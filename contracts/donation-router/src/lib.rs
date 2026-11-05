#![no_std]

//! Donation Router Contract
//!
//! Single entry point for donations in the Thriving Stellar ecosystem.
//! This contract abstracts the campaign vault from the frontend and applies
//! the platform fee (Model B: fee is deducted from the donation, not added
//! on top).
//!
//! # Fee Model
//!
//! Given a gross donation `A` and a fee of `F` basis points (1 bps = 0.01%):
//!
//! ```text
//! fee_amount = (A * F) / 10_000   // integer division
//! net_amount = A - fee_amount
//! ```
//!
//! The donor pays `A`. The treasury receives `fee_amount`. The vault receives
//! `net_amount`. Campaign targets in `campaign-registry` are expressed in
//! **net** terms: a campaign with `target_amount = 10_000` and `fee_bps = 200`
//! requires the donor to pay `10_204` for the vault to reach its target. The
//! frontend MUST display the gross, fee, and net amounts to the donor.
//!
//! # Roles
//! * **Admin**: Configures `fee_bps` and `treasury`.
//! * **Treasury**: Receives platform fees.
//! * **Donor**: Authorizes the donation and pays both the fee and the net amount.
//!
//! # Security
//! * All state-mutating functions require authorization.
//! * The router is stateless per-donation: no CEI concerns.
//! * Fee is bounded by `MAX_FEE_BPS` (10%) at construction and update time.
//! * TTL is extended on all entry points.
//!
//! # Known MVP Limitations
//! * **Direct vault bypass**: A user who knows the vault's contract address
//!   and a campaign ID can call `vault.deposit()` directly, bypassing the
//!   platform fee. Mitigation for production: add an `authorized_router`
//!   configuration to the vault that, when set, requires the router's
//!   authorization on every deposit. Not implemented in the MVP.
//! * **No humanity proof**: Any address can donate. Post-MVP, a `donate_with_proof`
//!   variant can require an off-chain attestation (inspired by p2p.me).

mod events;
mod storage;
#[cfg(test)]
mod test;

use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, token, Address, Env,
};
use thriving_interfaces::CampaignVaultClient;
use thriving_types::{Error, MAX_FEE_BPS};

use crate::events::{DonationRouted, FeeBpsUpdated, TreasuryUpdated};
use crate::storage::{
    extend_instance_ttl, read_admin, read_campaign_vault, read_fee_bps, read_treasury,
    write_admin, write_campaign_vault, write_fee_bps, write_treasury,
};

/// Result of a fee quote, returned by `quote`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct QuoteResult {
    pub gross_amount: i128,
    pub fee_amount: i128,
    pub net_amount: i128,
}

/// The main contract struct for the Donation Router.
#[contract]
pub struct DonationRouterContract;

#[contractimpl]
impl DonationRouterContract {
    /// Initializes the router with admin, treasury, vault, and fee configuration.
    ///
    /// # Arguments
    /// * `admin` - The address authorized to update fee and treasury.
    /// * `treasury` - The address that receives platform fees.
    /// * `campaign_vault` - The address of the `campaign-vault` contract.
    /// * `fee_bps` - Initial fee in basis points. Must be <= `MAX_FEE_BPS`.
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
        if read_admin(&env).is_some() {
            panic_with_error!(&env, Error::Unauthorized);
        }
        if fee_bps > MAX_FEE_BPS {
            panic_with_error!(&env, Error::InvalidFeeBps);
        }
        write_admin(&env, &admin);
        write_treasury(&env, &treasury);
        write_campaign_vault(&env, &campaign_vault);
        write_fee_bps(&env, fee_bps);
    }

    /// Routes a donation through the platform.
    ///
    /// # Flow
    /// 1. Compute `fee_amount = gross * fee_bps / 10_000` and `net_amount = gross - fee`.
    /// 2. If `fee_amount > 0`, transfer the fee from `donor` to `treasury`.
    ///    The token address is read from the vault's cached state.
    /// 3. Forward `net_amount` to the vault via `vault.deposit(campaign_id, donor, net)`.
    ///
    /// Atomicity: if any step fails, the entire transaction reverts and no
    /// funds move.
    ///
    /// # Arguments
    /// * `campaign_id` - The ID of the campaign.
    /// * `donor` - The address authorizing and paying for the donation.
    /// * `amount` - The gross amount to donate (fee is deducted from this).
    ///
    /// # Errors
    /// * `InvalidAmount` if `amount <= 0`.
    /// * `Unauthorized` if the router has not been initialized with a vault.
    /// * All vault-side errors propagate unchanged (e.g. `CampaignNotFound`,
    ///   `CampaignExpired`, `DepositExceedsTarget`, `VaultFinalized`).
    pub fn donate(env: Env, campaign_id: u64, donor: Address, amount: i128) {
        extend_instance_ttl(&env);
        donor.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        let fee_bps = read_fee_bps(&env);
        let fee_amount = (amount * fee_bps as i128) / 10_000;
        let net_amount = amount - fee_amount;

        // Defensive assertion: with MAX_FEE_BPS = 1000 (10%) and amount >= 1,
        // net_amount is always >= 1. Future changes to the cap must revisit this.
        if net_amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        let vault_address = read_campaign_vault(&env)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized));
        let vault_client = CampaignVaultClient::new(&env, &vault_address);

        // Only resolve the token address when a fee must be transferred.
        if fee_amount > 0 {
            let vault_state = vault_client.get_vault(&campaign_id);
            let token_client = token::Client::new(&env, &vault_state.token_address);
            let treasury = read_treasury(&env)
                .unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized));
            token_client.transfer(&donor, &treasury, &fee_amount);
        }

        // Forward the net amount. Propagates vault-side errors unchanged.
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
        let fee_bps = read_fee_bps(&env);
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

    /// Updates the platform fee. Only callable by the admin.
    ///
    /// # Arguments
    /// * `admin` - The admin address (must authorize).
    /// * `new_fee_bps` - The new fee in basis points. Must be <= `MAX_FEE_BPS`.
    ///
    /// # Errors
    /// * `Unauthorized` if the caller is not the admin.
    /// * `InvalidFeeBps` if `new_fee_bps > MAX_FEE_BPS`.
    pub fn update_fee_bps(env: Env, admin: Address, new_fee_bps: u32) {
        extend_instance_ttl(&env);
        admin.require_auth();

        let stored_admin = read_admin(&env)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized));
        if admin != stored_admin {
            panic_with_error!(&env, Error::Unauthorized);
        }
        if new_fee_bps > MAX_FEE_BPS {
            panic_with_error!(&env, Error::InvalidFeeBps);
        }

        let old_fee_bps = read_fee_bps(&env);
        write_fee_bps(&env, new_fee_bps);

        FeeBpsUpdated {
            old_fee_bps,
            new_fee_bps,
        }
        .publish(&env);
    }

    /// Updates the treasury address. Only callable by the admin.
    ///
    /// # Arguments
    /// * `admin` - The admin address (must authorize).
    /// * `new_treasury` - The new treasury address.
    ///
    /// # Errors
    /// * `Unauthorized` if the caller is not the admin.
    pub fn update_treasury(env: Env, admin: Address, new_treasury: Address) {
        extend_instance_ttl(&env);
        admin.require_auth();

        let stored_admin = read_admin(&env)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized));
        if admin != stored_admin {
            panic_with_error!(&env, Error::Unauthorized);
        }

        let old_treasury = read_treasury(&env)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized));
        write_treasury(&env, &new_treasury);

        TreasuryUpdated {
            old_treasury,
            new_treasury,
        }
        .publish(&env);
    }

    /// Returns the current fee in basis points.
    pub fn get_fee_bps(env: Env) -> u32 {
        read_fee_bps(&env)
    }

    /// Returns the current treasury address.
    ///
    /// # Errors
    /// * `Unauthorized` if the contract has not been initialized.
    pub fn get_treasury(env: Env) -> Address {
        read_treasury(&env)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized))
    }
}
