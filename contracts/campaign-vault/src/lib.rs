#![no_std]

//! Campaign Vault Contract
//!
//! This contract serves as the escrow mechanism for fundraising campaigns.
//! It custodies donated funds and releases them based on a milestone model:
//!
//! 1. **Deposit**: Donors transfer stablecoins to the vault for a specific campaign.
//! 2. **Initial Release (50%)**: When the campaign reaches its target amount,
//!    50% of the funds are automatically released to the nonprofit.
//! 3. **Evidence Submission**: The nonprofit submits a hash of evidence
//!    (photos, videos, invoices) proving execution.
//! 4. **Final Release (50%)**: The admin validates the evidence and releases
//!    the remaining 50% to the nonprofit.
//!
//! # Roles
//! * **Admin**: The address configured in the constructor. Responsible for
//!   validating evidence and releasing final funds, and optionally configuring
//!   the `authorized_router`.
//! * **Nonprofit**: The organization that owns the campaign and receives funds.
//! * **Donor**: Any address that deposits funds into a campaign's vault.
//!
//! # Security
//! * All state-mutating functions require authorization.
//! * The Checks-Effects-Interactions (CEI) pattern is strictly followed: state
//!   is persisted before any external call.
//! * Token transfers use the SEP-41 interface via `token::Client`.
//! * TTL is extended on all entry points to prevent data archival.
//! * When `authorized_router` is configured, `deposit` requires the router's
//!   authorization (`router.require_auth()`). This closes the platform-fee bypass:
//!   a donor cannot bypass the router by calling `deposit` directly.
//!
//! # Known MVP Limitations
//! * A campaign that is cancelled after its vault is created can still receive
//!   deposits until `deadline`. The frontend must query `campaign-registry`
//!   before offering the donate button. Post-MVP: add an active-status check.
//! * Evidence hashes can be overwritten by the nonprofit before the final
//!   release. This is intentional (allows correcting mistakes).

mod events;
mod storage;
#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractimpl, panic_with_error, token, Address, Bytes, Env};
use thriving_interfaces::CampaignRegistryClient;
use thriving_types::{CampaignStatus, Error, VaultState, DEFAULT_MILESTONE_PERCENTAGE};

use crate::events::{
    AuthorizedRouterUpdated, DonationDeposited, EvidenceSubmitted, FinalFundsReleased,
    InitialFundsReleased, VaultCreated,
};
use crate::storage::{
    clear_authorized_router, extend_instance_ttl, get_admin, get_authorized_router,
    get_campaign_registry, get_vault_state, save_vault_state, set_admin, set_authorized_router,
    set_campaign_registry,
};

/// The main contract struct for the Campaign Vault.
#[contract]
pub struct CampaignVaultContract;

#[contractimpl]
impl CampaignVaultContract {
    /// Initializes the contract with an administrator address and the
    /// address of the Campaign Registry contract.
    ///
    /// The vault starts in **open mode** (`authorized_router = None`). The admin
    /// can later call `set_authorized_router` to restrict deposits to a specific
    /// donation router.
    ///
    /// # Arguments
    /// * `admin` - The address authorized to validate evidence and release funds.
    /// * `campaign_registry` - The address of the deployed `campaign-registry` contract.
    ///
    /// # Errors
    /// * `Unauthorized` if the contract has already been initialized.
    pub fn __constructor(env: Env, admin: Address, campaign_registry: Address) {
        if get_admin(&env).is_some() {
            panic_with_error!(&env, Error::Unauthorized);
        }
        set_admin(&env, &admin);
        set_campaign_registry(&env, &campaign_registry);
    }

    /// Configures or clears the authorized donation router.
    ///
    /// When set to `Some(router)`, `deposit` requires `router.require_auth()`,
    /// which closes the platform-fee bypass. When set to `None`, the vault is
    /// in open mode: any address can call `deposit` directly.
    ///
    /// # Arguments
    /// * `admin` - The admin address (must authorize).
    /// * `router` - `Some(router_address)` to restrict deposits, `None` to open.
    ///
    /// # Authorization
    /// Only the `admin` configured in the constructor can call this function.
    ///
    /// # Errors
    /// * `Unauthorized` if the caller is not the configured admin.
    pub fn set_authorized_router(env: Env, admin: Address, router: Option<Address>) {
        extend_instance_ttl(&env);
        admin.require_auth();

        let stored_admin = get_admin(&env)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized));
        if admin != stored_admin {
            panic_with_error!(&env, Error::Unauthorized);
        }

        match router.clone() {
            Some(r) => set_authorized_router(&env, &r),
            None => clear_authorized_router(&env),
        }

        AuthorizedRouterUpdated {
            authorized_router: router,
        }
        .publish(&env);
    }

    /// Returns the currently configured authorized router, if any.
    ///
    /// `None` means the vault is in open mode.
    pub fn get_authorized_router(env: Env) -> Option<Address> {
        get_authorized_router(&env)
    }

    /// Creates a new vault for a specific campaign.
    ///
    /// # Arguments
    /// * `campaign_id` - The ID of the campaign in the `campaign-registry`.
    /// * `nonprofit` - The address of the nonprofit that owns the campaign.
    ///
    /// # Authorization
    /// The `nonprofit` address must authorize this call.
    ///
    /// # Errors
    /// * `CampaignAlreadyExists` if a vault already exists for this campaign.
    /// * `CampaignNotFound` if the campaign does not exist in the registry.
    /// * `CampaignNotActive` if the campaign is not active.
    /// * `Unauthorized` if `nonprofit` is not the campaign owner.
    pub fn create_vault(env: Env, campaign_id: u64, nonprofit: Address) {
        extend_instance_ttl(&env);
        nonprofit.require_auth();

        if get_vault_state(&env, campaign_id).is_some() {
            panic_with_error!(&env, Error::CampaignAlreadyExists);
        }

        let registry_address = get_campaign_registry(&env)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized));
        let registry_client = CampaignRegistryClient::new(&env, &registry_address);
        let campaign = registry_client.get_campaign(&campaign_id);

        if campaign.status != CampaignStatus::Active {
            panic_with_error!(&env, Error::CampaignNotActive);
        }
        if campaign.nonprofit != nonprofit {
            panic_with_error!(&env, Error::Unauthorized);
        }

        let state = VaultState {
            campaign_id,
            nonprofit: nonprofit.clone(),
            token_address: campaign.token_address.clone(),
            target_amount: campaign.target_amount,
            deadline: campaign.deadline,
            total_deposited: 0,
            initial_release_done: false,
            evidence_hash: None,
            final_release_done: false,
        };

        save_vault_state(&env, campaign_id, &state);

        VaultCreated {
            campaign_id,
            nonprofit,
            token_address: campaign.token_address,
        }
        .publish(&env);
    }

    /// Deposits tokens into a campaign's vault.
    ///
    /// If the deposit causes `total_deposited` to reach `target_amount` and the
    /// initial release has not occurred, this function atomically releases the
    /// initial milestone amount (default: 50%) to the nonprofit.
    ///
    /// # Router Enforcement
    /// If `authorized_router` is configured (via `set_authorized_router`), the
    /// router must authorize this call. This is verified with
    /// `router.require_auth()`. Since the router is the direct invoker when it
    /// calls this function, the authorization is implicitly granted (per Soroban's
    /// "Contract Invoker" rule). A donor calling directly cannot satisfy this
    /// requirement, closing the platform-fee bypass.
    ///
    /// # Arguments
    /// * `campaign_id` - The ID of the campaign.
    /// * `donor` - The address of the donor. Must authorize the top-level call.
    /// * `amount` - The amount of tokens to deposit. Must be strictly positive.
    ///
    /// # Errors
    /// * `InvalidAmount` if `amount <= 0`.
    /// * `CampaignNotFound` if no vault exists for the campaign.
    /// * `VaultFinalized` if the final release has already occurred.
    /// * `CampaignExpired` if the current ledger timestamp exceeds `deadline`.
    /// * `DepositExceedsTarget` if the deposit would exceed `target_amount`.
    /// * `NotAuthorizedRouter` if `authorized_router` is set and the router
    ///   did not authorize the call.
    ///
    /// # Re-entrancy
    /// State is fully persisted before any external token transfer. If a
    /// transfer fails, the entire transaction reverts (Soroban atomicity),
    /// leaving no partial state.
    pub fn deposit(env: Env, campaign_id: u64, donor: Address, amount: i128) {
        extend_instance_ttl(&env);
        donor.require_auth();

        // --- Router enforcement ---
        // If an authorized router is configured, it must authorize this call.
        // Because the router is the direct invoker, this check passes only when
        // the call originates from the router.
        if let Some(expected_router) = get_authorized_router(&env) {
            expected_router.require_auth();
        }

        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        let mut state = get_vault_state(&env, campaign_id)
            .unwrap_or_else(|| panic_with_error!(&env, Error::CampaignNotFound));

        // --- CHECKS ---
        if state.final_release_done {
            panic_with_error!(&env, Error::VaultFinalized);
        }
        if env.ledger().timestamp() > state.deadline {
            panic_with_error!(&env, Error::CampaignExpired);
        }

        let new_total = state.total_deposited + amount;
        if new_total > state.target_amount {
            panic_with_error!(&env, Error::DepositExceedsTarget);
        }

        let trigger_initial_release =
            new_total >= state.target_amount && !state.initial_release_done;

        let initial_release_amount = if trigger_initial_release {
            (state.target_amount * DEFAULT_MILESTONE_PERCENTAGE as i128) / 100
        } else {
            0
        };

        // --- EFFECTS ---
        state.total_deposited = new_total;
        if trigger_initial_release {
            state.initial_release_done = true;
        }
        save_vault_state(&env, campaign_id, &state);

        // --- INTERACTIONS ---
        let token_client = token::Client::new(&env, &state.token_address);
        token_client.transfer(&donor, &env.current_contract_address(), &amount);

        if trigger_initial_release {
            token_client.transfer(
                &env.current_contract_address(),
                &state.nonprofit,
                &initial_release_amount,
            );

            InitialFundsReleased {
                campaign_id,
                nonprofit: state.nonprofit.clone(),
                amount: initial_release_amount,
            }
            .publish(&env);
        }

        DonationDeposited {
            campaign_id,
            donor,
            amount,
            total_deposited: state.total_deposited,
        }
        .publish(&env);
    }

    /// Submits evidence for the final milestone.
    ///
    /// # Arguments
    /// * `campaign_id` - The ID of the campaign.
    /// * `nonprofit` - The address of the nonprofit submitting evidence.
    /// * `evidence_hash` - A non-empty hash of the evidence (e.g., IPFS CID).
    ///
    /// # Authorization
    /// The `nonprofit` address must authorize this call and match the vault owner.
    ///
    /// # Errors
    /// * `CampaignNotFound` if no vault exists for the campaign.
    /// * `Unauthorized` if the caller is not the campaign's nonprofit.
    /// * `InitialReleaseNotDone` if the initial milestone has not been released yet.
    /// * `VaultFinalized` if the final release has already occurred.
    /// * `InvalidEvidence` if `evidence_hash` is empty.
    pub fn submit_evidence(
        env: Env,
        campaign_id: u64,
        nonprofit: Address,
        evidence_hash: Bytes,
    ) {
        extend_instance_ttl(&env);
        nonprofit.require_auth();

        let mut state = get_vault_state(&env, campaign_id)
            .unwrap_or_else(|| panic_with_error!(&env, Error::CampaignNotFound));

        if state.nonprofit != nonprofit {
            panic_with_error!(&env, Error::Unauthorized);
        }
        if !state.initial_release_done {
            panic_with_error!(&env, Error::InitialReleaseNotDone);
        }
        if state.final_release_done {
            panic_with_error!(&env, Error::VaultFinalized);
        }
        if evidence_hash.is_empty() {
            panic_with_error!(&env, Error::InvalidEvidence);
        }

        // --- EFFECTS ---
        state.evidence_hash = Some(evidence_hash.clone());
        save_vault_state(&env, campaign_id, &state);

        // --- INTERACTIONS ---
        EvidenceSubmitted {
            campaign_id,
            nonprofit,
            evidence_hash,
        }
        .publish(&env);
    }

    /// Releases the final milestone amount to the nonprofit after evidence validation.
    ///
    /// # Arguments
    /// * `campaign_id` - The ID of the campaign.
    /// * `admin` - The address of the admin validating the evidence.
    ///
    /// # Authorization
    /// Only the `admin` configured in the constructor can call this function.
    ///
    /// # Errors
    /// * `NotVaultAdmin` if the caller is not the configured admin.
    /// * `CampaignNotFound` if no vault exists for the campaign.
    /// * `FinalAlreadyReleased` if the final release has already occurred.
    /// * `EvidenceNotSubmitted` if no evidence has been submitted.
    pub fn release_final(env: Env, campaign_id: u64, admin: Address) {
        extend_instance_ttl(&env);
        admin.require_auth();

        let stored_admin = get_admin(&env)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized));
        if admin != stored_admin {
            panic_with_error!(&env, Error::NotVaultAdmin);
        }

        let mut state = get_vault_state(&env, campaign_id)
            .unwrap_or_else(|| panic_with_error!(&env, Error::CampaignNotFound));

        if state.final_release_done {
            panic_with_error!(&env, Error::FinalAlreadyReleased);
        }
        if state.evidence_hash.is_none() {
            panic_with_error!(&env, Error::EvidenceNotSubmitted);
        }

        let initial_release = (state.target_amount * DEFAULT_MILESTONE_PERCENTAGE as i128) / 100;
        let final_release = state.total_deposited - initial_release;

        // --- EFFECTS ---
        state.final_release_done = true;
        save_vault_state(&env, campaign_id, &state);

        // --- INTERACTIONS ---
        let token_client = token::Client::new(&env, &state.token_address);
        token_client.transfer(
            &env.current_contract_address(),
            &state.nonprofit,
            &final_release,
        );

        FinalFundsReleased {
            campaign_id,
            nonprofit: state.nonprofit,
            amount: final_release,
        }
        .publish(&env);
    }

    /// Retrieves the vault state for a specific campaign.
    ///
    /// # Arguments
    /// * `campaign_id` - The ID of the campaign.
    ///
    /// # Returns
    /// The `VaultState` struct.
    ///
    /// # Errors
    /// * `CampaignNotFound` if no vault exists for the campaign.
    ///
    /// # Notes
    /// Extends the instance TTL as a defensive measure to keep the contract
    /// alive during quiet periods. This is a deliberate trade-off (one ledger
    /// write per query) for a donation platform where users browse frequently.
    pub fn get_vault(env: Env, campaign_id: u64) -> VaultState {
        extend_instance_ttl(&env);
        get_vault_state(&env, campaign_id)
            .unwrap_or_else(|| panic_with_error!(&env, Error::CampaignNotFound))
    }
}
