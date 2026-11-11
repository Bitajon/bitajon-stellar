#![no_std]

//! Donation Router — Atomic orchestrator for donations.
//!
//! Single entry point for donations in the Bitajón protocol. In one
//! transaction (one signature from the donor), this contract:
//!
//! 1. Computes the platform fee and the net amount.
//! 2. Transfers the fee to the treasury (if `fee_bps > 0`).
//! 3. Forwards the net amount to the campaign's vault via
//!    `CampaignVaultClient::deposit`.
//! 4. The vault auto-releases the initial milestone if the deposit
//!    crosses `target_amount`.
//!
//! **Atomicity**: If any step fails (invalid campaign, deadline expired,
//! deposit exceeds target, vault paused, etc.), the entire transaction
//! reverts, including the fee transfer. The donor pays only the network
//! cost of the failed transaction, not a partial donation.
//!
//! # Fee Model
//!
//! Gross-based, deducted from the donor's payment:
//!
//! ```text
//! fee_amount = (gross_amount * fee_bps) / 10_000
//! net_amount = gross_amount - fee_amount
//! ```
//!
//! The donor pays `gross_amount`. The treasury receives `fee_amount`. The
//! vault receives `net_amount`.
//!
//! **`target_amount` is expressed in NET terms.** A campaign with
//! `target_amount = 10_000` and `fee_bps = 200` requires a gross payment
//! of `ceil(10_000 * 10_000 / 9_800) = 10_204` to reach the target.
//! The frontend must compute the gross amount from the campaign target
//! and display the fee breakdown via `quote()`.
//!
//! # Roles
//!
//! * **Admin**: Configures fee, treasury, and pending admin. Can be an
//!   EOA (`G...`) or a `governance-account` (`C...`).
//! * **Treasury**: Receives platform fees.
//! * **Donor**: Authorizes the transaction and pays the gross amount.
//!
//! # Standards
//!
//! * **SEP-41**: The vault's donation token is a SEP-41 token. The router
//!   reads `token_address` from the vault state and uses it for the fee
//!   transfer, so it is agnostic to the specific token.
//! * **SEP-45 (planned)**: The admin can be a smart account that
//!   authenticates via SEP-45. This contract only requires
//!   `Address::require_auth()`, which works transparently for both EOAs
//!   and smart accounts.
//! * **SEP-24 / SEP-6 (frontend)**: On-ramps (COP → USDC) are handled by
//!   Anchors (VANK, Pollar) and orchestrated by the frontend. This
//!   contract only sees the resulting USDC transfer.
//! * **SEP-38 (frontend)**: Anchor quotes for fiat/crypto conversion are
//!   consumed by the frontend, not by this contract.
//!
//! # Security
//!
//! * CEI pattern followed: state changes happen before external calls.
//! * Router bypass is closed at the vault level: when
//!   `authorized_router` is configured on the vault, direct deposits
//!   from arbitrary addresses are rejected. This contract is the only
//!   authorized router and therefore the only path that collects fees.
//! * Fee is bounded by `MAX_FEE_BPS` (10%) at construction and update.
//! * Two-step admin transfer prevents accidental lockout.
//! * Instance TTL extended on every entry point.

mod events;
mod storage;
#[cfg(test)]
mod test;

use protocol_interfaces::CampaignVaultClient;
use protocol_types::{Error, MAX_FEE_BPS};
use soroban_sdk::{contract, contractimpl, contracttype, panic_with_error, token, Address, Env};

use crate::events::{
    AdminAccepted, AdminProposed, DonationRouted, FeeBpsUpdated, TreasuryUpdated,
};
use crate::storage::{
    clear_pending_admin, extend_instance_ttl, get_admin, get_campaign_vault, get_fee_bps,
    get_pending_admin, get_treasury, set_admin, set_campaign_vault, set_fee_bps,
    set_pending_admin, set_treasury,
};

/// Result of a fee quote, returned by `quote`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct QuoteResult {
    pub gross_amount: i128,
    pub fee_amount: i128,
    pub net_amount: i128,
}

#[contract]
pub struct DonationRouterContract;

#[contractimpl]
impl DonationRouterContract {
    /// Initializes the router with admin, treasury, vault, and fee.
    ///
    /// # Arguments
    /// * `admin` - Address authorized to configure the router. Can be an
    ///   EOA or a `governance-account`.
    /// * `treasury` - Address that receives platform fees.
    /// * `campaign_vault` - Address of the Campaign Vault contract.
    /// * `fee_bps` - Initial fee in basis points. Must be `<= MAX_FEE_BPS`.
    ///
    /// # Errors
    /// * `Unauthorized` if the contract has already been initialized.
    /// * `InvalidFeeBps` if `fee_bps > MAX_FEE_BPS`.
    pub fn __constructor(
        env: Env,
        admin: Address,
        treasury: Address,
        campaign_vault: Address,
        fee_bps: u32,
    ) {
        if get_admin(&env).is_some() {
            panic_with_error!(&env, Error::Unauthorized);
        }
        if fee_bps > MAX_FEE_BPS {
            panic_with_error!(&env, Error::InvalidFeeBps);
        }
        set_admin(&env, &admin);
        set_treasury(&env, &treasury);
        set_campaign_vault(&env, &campaign_vault);
        set_fee_bps(&env, fee_bps);
    }

    // --- Two-step admin transfer ---

    /// Proposes a new admin. Must be accepted by the proposed admin.
    ///
    /// # Authorization
    /// Only the current admin can propose.
    ///
    /// # Errors
    /// * `Unauthorized` if the caller is not the current admin.
    pub fn propose_admin(env: Env, admin: Address, new_admin: Address) {
        extend_instance_ttl(&env);
        admin.require_auth();
        let stored =
            get_admin(&env).unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized));
        if admin != stored {
            panic_with_error!(&env, Error::Unauthorized);
        }
        set_pending_admin(&env, &new_admin);
        AdminProposed {
            current: admin,
            proposed: new_admin,
        }
        .publish(&env);
    }

    /// Accepts the pending admin role.
    ///
    /// # Authorization
    /// Only the pending admin can accept.
    ///
    /// # Errors
    /// * `Unauthorized` if there is no pending admin.
    pub fn accept_admin(env: Env) {
        extend_instance_ttl(&env);
        let pending = get_pending_admin(&env)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized));
        pending.require_auth();
        set_admin(&env, &pending);
        clear_pending_admin(&env);
        AdminAccepted { new_admin: pending }.publish(&env);
    }

    /// Returns the current admin.
    pub fn get_admin(env: Env) -> Address {
        get_admin(&env).unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized))
    }

    /// Returns the pending admin, if any.
    pub fn get_pending_admin(env: Env) -> Option<Address> {
        get_pending_admin(&env)
    }

    // --- Configuration ---

    /// Updates the platform fee.
    ///
    /// # Authorization
    /// Only the admin can update the fee.
    ///
    /// # Errors
    /// * `Unauthorized` if the caller is not the admin.
    /// * `InvalidFeeBps` if `new_fee_bps > MAX_FEE_BPS`.
    pub fn update_fee_bps(env: Env, admin: Address, new_fee_bps: u32) {
        extend_instance_ttl(&env);
        admin.require_auth();
        let stored =
            get_admin(&env).unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized));
        if admin != stored {
            panic_with_error!(&env, Error::Unauthorized);
        }
        if new_fee_bps > MAX_FEE_BPS {
            panic_with_error!(&env, Error::InvalidFeeBps);
        }
        let old_fee_bps = get_fee_bps(&env);
        set_fee_bps(&env, new_fee_bps);
        FeeBpsUpdated {
            old_fee_bps,
            new_fee_bps,
        }
        .publish(&env);
    }

    /// Updates the treasury address.
    ///
    /// # Authorization
    /// Only the admin can update the treasury.
    ///
    /// # Errors
    /// * `Unauthorized` if the caller is not the admin.
    pub fn update_treasury(env: Env, admin: Address, new_treasury: Address) {
        extend_instance_ttl(&env);
        admin.require_auth();
        let stored =
            get_admin(&env).unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized));
        if admin != stored {
            panic_with_error!(&env, Error::Unauthorized);
        }
        let old_treasury =
            get_treasury(&env).unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized));
        set_treasury(&env, &new_treasury);
        TreasuryUpdated {
            old_treasury,
            new_treasury,
        }
        .publish(&env);
    }

    /// Returns the current fee in basis points.
    pub fn get_fee_bps(env: Env) -> u32 {
        extend_instance_ttl(&env);
        get_fee_bps(&env)
    }

    /// Returns the current treasury address.
    pub fn get_treasury(env: Env) -> Address {
        extend_instance_ttl(&env);
        get_treasury(&env).unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized))
    }

    /// Returns the Campaign Vault address.
    pub fn get_campaign_vault(env: Env) -> Address {
        extend_instance_ttl(&env);
        get_campaign_vault(&env).unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized))
    }

    // --- Atomic donation ---

    /// Routes a donation through the platform in a single atomic transaction.
    ///
    /// # Atomicity
    /// The fee transfer and the vault deposit happen in the same
    /// transaction. If either fails, the entire transaction reverts
    /// (Soroban protocol-level atomicity). The donor is never partially
    /// charged.
    ///
    /// # Flow
    /// 1. Compute `fee_amount = gross * fee_bps / 10_000` and
    ///    `net_amount = gross - fee_amount`.
    /// 2. If `fee_amount > 0`, read the vault state to get the token, then
    ///    transfer the fee from `donor` to `treasury`. If the fee is zero,
    ///    skip the read (optimization for the current deployment where
    ///    `fee_bps = 0`).
    /// 3. Call `vault.deposit(campaign_id, donor, net_amount)`. The vault
    ///    validates the campaign, transfers the net amount, and releases
    ///    the initial milestone if the target is reached.
    ///
    /// # Authorization
    /// * `donor` must authorize this call.
    /// * If the vault has `authorized_router` configured, this router must
    ///   be that address (it is, by definition).
    ///
    /// # Errors
    /// * `InvalidAmount` if `amount <= 0`.
    /// * Vault errors propagate unchanged: `CampaignNotFound`,
    ///   `CampaignExpired`, `DepositExceedsTarget`, `VaultPaused`,
    ///   `VaultFinalized`.
    pub fn donate(env: Env, campaign_id: u64, donor: Address, amount: i128) {
        extend_instance_ttl(&env);
        donor.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        let fee_bps = get_fee_bps(&env);
        let fee_amount = (amount * fee_bps as i128) / 10_000;
        let net_amount = amount - fee_amount;

        if net_amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        let vault_address = get_campaign_vault(&env)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized));
        let vault_client = CampaignVaultClient::new(&env, &vault_address);

        // Charge the fee first (when non-zero). This avoids an unnecessary
        // cross-contract read of the vault state when the platform fee is
        // disabled, which is the current deployment configuration.
        if fee_amount > 0 {
            let vault_state = vault_client.get_vault(&campaign_id);
            let token_client = token::Client::new(&env, &vault_state.token_address);
            let treasury = get_treasury(&env)
                .unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized));
            token_client.transfer(&donor, &treasury, &fee_amount);
        }

        // Forward the net amount. Atomic with the fee transfer above: if
        // the vault rejects the deposit, the whole transaction reverts.
        vault_client.deposit(&campaign_id, &donor, &net_amount);

        DonationRouted {
            campaign_id,
            donor,
            gross_amount: amount,
            fee_amount,
            net_amount,
        }
        .publish(&env);
    }

    /// Returns the fee breakdown for a given gross amount without executing
    /// a donation. Useful for UI previews.
    ///
    /// # Arguments
    /// * `gross_amount` - The gross amount the donor is considering.
    ///
    /// # Returns
    /// A `QuoteResult` with `gross_amount`, `fee_amount`, and `net_amount`.
    pub fn quote(env: Env, gross_amount: i128) -> QuoteResult {
        let fee_bps = get_fee_bps(&env);
        let fee_amount = if gross_amount > 0 {
            (gross_amount * fee_bps as i128) / 10_000
        } else {
            0
        };
        let net_amount = gross_amount - fee_amount;
        QuoteResult {
            gross_amount,
            fee_amount,
            net_amount,
        }
    }
}
