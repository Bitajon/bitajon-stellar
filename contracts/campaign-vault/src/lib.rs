#![no_std]

//! Campaign Vault Contract
//!
//! This contract custodies donated funds for a specific campaign and releases
//! them according to a milestone model. It is the technical escrow of the
//! Bitajón protocol.
//!
//! # Lifecycle
//! 1. **`create_vault`**: The nonprofit creates the vault for an approved
//!    campaign. Immutable fields (`target_amount`, `deadline`, `token_address`,
//!    `milestone_percentage`) are cached to eliminate cross-contract calls on
//!    the hot path.
//! 2. **`deposit`**: Donors transfer SEP-41 tokens. When `total_deposited`
//!    reaches `target_amount`, the initial milestone (configurable percentage)
//!    is released automatically to the nonprofit.
//! 3. **`submit_evidence`**: The nonprofit submits a hash of the evidence
//!    (photos, videos, invoices) proving execution.
//! 4. **`release_final`**: The verifier validates the evidence and releases
//!    the remaining balance.
//!
//! # Refunds (Pull Pattern)
//! If the campaign expires or is cancelled without reaching `target_amount`,
//! donors can reclaim their net contribution via `claim_refund`. Contributions
//! are tracked per (campaign, donor) pair, so the cost does not grow with the
//! number of donors.
//!
//! # Roles
//! * **Admin**: Configures the router, pauses vaults, updates verifiers.
//! * **Verifier**: Validates evidence and releases final funds.
//! * **Nonprofit**: Creates the vault, submits evidence, receives funds.
//! * **Donor**: Deposits funds and claims refunds if applicable.
//!
//! # Security
//! * CEI pattern strictly followed: state persists before external calls.
//! * Router enforcement: when `authorized_router` is set, only that router
//!   can invoke `deposit`. This closes the platform-fee bypass.
//! * TOCTOU protection: `release_final` requires the exact evidence hash
//!   the verifier reviewed.
//! * Two-step admin transfer prevents accidental lockout.
//! * TTL extended on all entry points.

mod events;
mod storage;
#[cfg(test)]
mod test;

use protocol_interfaces::CampaignRegistryClient;
use protocol_types::{CampaignStatus, Error, VaultState};
use soroban_sdk::{contract, contractimpl, panic_with_error, token, Address, Bytes, Env};

use crate::events::{
    AdminAccepted, AdminProposed, AuthorizedRouterUpdated, DonationDeposited, EvidenceSubmitted,
    FinalFundsReleased, InitialFundsReleased, RefundClaimed, VaultCreated, VaultPaused,
    VaultUnpaused, VerifierUpdated,
};
use crate::storage::{
    clear_authorized_router, clear_pending_admin, extend_instance_ttl, get_admin,
    get_authorized_router, get_campaign_registry, get_contribution, get_pending_admin,
    get_vault_state, save_vault_state, set_admin, set_authorized_router, set_campaign_registry,
    set_contribution, set_pending_admin,
};

#[contract]
pub struct CampaignVaultContract;

#[contractimpl]
impl CampaignVaultContract {
    /// Initializes the contract with an admin and the Campaign Registry address.
    ///
    /// # Arguments
    /// * `admin` - Address authorized to configure the vault (EOA or smart account).
    /// * `campaign_registry` - Address of the deployed Campaign Registry.
    pub fn __constructor(env: Env, admin: Address, campaign_registry: Address) {
        if get_admin(&env).is_some() {
            panic_with_error!(&env, Error::Unauthorized);
        }
        set_admin(&env, &admin);
        set_campaign_registry(&env, &campaign_registry);
    }

    // --- Two-step admin transfer ---

    /// Proposes a new admin. The proposal must be accepted by the new admin.
    ///
    /// # Authorization
    /// Only the current admin can propose.
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
    pub fn accept_admin(env: Env) {
        extend_instance_ttl(&env);
        let pending = get_pending_admin(&env)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized));
        pending.require_auth();
        set_admin(&env, &pending);
        clear_pending_admin(&env);
        AdminAccepted { new_admin: pending }.publish(&env);
    }

    /// Returns the pending admin, if any.
    pub fn get_pending_admin(env: Env) -> Option<Address> {
        get_pending_admin(&env)
    }

    /// Returns the current admin.
    pub fn get_admin(env: Env) -> Address {
        get_admin(&env).unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized))
    }

    // --- Verifier management ---

    /// Updates the verifier of an existing vault.
    ///
    /// # Authorization
    /// Only the admin can update the verifier.
    pub fn set_verifier_for_campaign(
        env: Env,
        admin: Address,
        campaign_id: u64,
        verifier: Address,
    ) {
        extend_instance_ttl(&env);
        admin.require_auth();
        let stored =
            get_admin(&env).unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized));
        if admin != stored {
            panic_with_error!(&env, Error::Unauthorized);
        }
        let mut state = get_vault_state(&env, campaign_id)
            .unwrap_or_else(|| panic_with_error!(&env, Error::CampaignNotFound));
        state.verifier = verifier.clone();
        save_vault_state(&env, campaign_id, &state);
        VerifierUpdated {
            campaign_id,
            new_verifier: verifier,
        }
        .publish(&env);
    }

    // --- Authorized router ---

    /// Configures or clears the authorized router.
    ///
    /// When set to `Some(router)`, `deposit` requires `router.require_auth()`.
    /// Since the router is the direct invoker when it calls `deposit`, the
    /// authorization is implicitly granted by Soroban, and direct deposits
    /// from arbitrary addresses are rejected.
    ///
    /// # Authorization
    /// Only the admin can configure the router.
    pub fn set_authorized_router(env: Env, admin: Address, router: Option<Address>) {
        extend_instance_ttl(&env);
        admin.require_auth();
        let stored =
            get_admin(&env).unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized));
        if admin != stored {
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

    /// Returns the authorized router, if any.
    pub fn get_authorized_router(env: Env) -> Option<Address> {
        get_authorized_router(&env)
    }

    // --- Vault lifecycle ---

    /// Creates a new vault for an approved campaign.
    ///
    /// # Arguments
    /// * `campaign_id` - ID of the campaign in the registry.
    /// * `nonprofit` - Address of the nonprofit that owns the campaign.
    /// * `verifier` - Address authorized to validate evidence and release
    ///   final funds. Can be an EOA or a smart account.
    ///
    /// # Authorization
    /// The `nonprofit` must authorize this call.
    pub fn create_vault(env: Env, campaign_id: u64, nonprofit: Address, verifier: Address) {
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
            // `nonprofit` is used again in the `VaultCreated` event below,
            // so it must be cloned into the persisted state.
            nonprofit: nonprofit.clone(),
            token_address: campaign.token_address.clone(),
            target_amount: campaign.target_amount,
            deadline: campaign.deadline,
            milestone_percentage: campaign.milestone_percentage,
            // Same for `verifier`: cloned into the persisted state, moved
            // into the event.
            verifier: verifier.clone(),
            total_deposited: 0,
            initial_release_done: false,
            evidence_hash: None,
            final_release_done: false,
            paused: false,
        };

        save_vault_state(&env, campaign_id, &state);

        VaultCreated {
            campaign_id,
            nonprofit,
            token_address: campaign.token_address,
            verifier,
        }
        .publish(&env);
    }

    /// Deposits tokens into a campaign's vault.
    ///
    /// # Milestone Trigger
    /// When `total_deposited` reaches `target_amount`, the initial milestone
    /// (`milestone_percentage` of `target_amount`) is released automatically
    /// to the nonprofit.
    ///
    /// # Router Enforcement
    /// If `authorized_router` is configured, the router must authorize this
    /// call. Direct deposits from arbitrary addresses are rejected with a
    /// Soroban authentication error.
    ///
    /// # Authorization
    /// * `donor` must authorize the top-level call.
    /// * If `authorized_router` is set, the router must be the direct invoker.
    pub fn deposit(env: Env, campaign_id: u64, donor: Address, amount: i128) {
        extend_instance_ttl(&env);
        donor.require_auth();

        if let Some(expected_router) = get_authorized_router(&env) {
            expected_router.require_auth();
        }

        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        let mut state = get_vault_state(&env, campaign_id)
            .unwrap_or_else(|| panic_with_error!(&env, Error::CampaignNotFound));

        // --- CHECKS ---
        if state.paused {
            panic_with_error!(&env, Error::VaultPaused);
        }
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

        let trigger_initial =
            new_total >= state.target_amount && !state.initial_release_done;
        let initial_amount = if trigger_initial {
            (state.target_amount * state.milestone_percentage as i128) / 100
        } else {
            0
        };

        // --- EFFECTS ---
        let prev_contribution = get_contribution(&env, campaign_id, &donor);
        set_contribution(&env, campaign_id, &donor, prev_contribution + amount);

        state.total_deposited = new_total;
        if trigger_initial {
            state.initial_release_done = true;
        }
        save_vault_state(&env, campaign_id, &state);

        // --- INTERACTIONS ---
        let token_client = token::Client::new(&env, &state.token_address);
        token_client.transfer(&donor, &env.current_contract_address(), &amount);

        if trigger_initial {
            token_client.transfer(
                &env.current_contract_address(),
                &state.nonprofit,
                &initial_amount,
            );
            InitialFundsReleased {
                campaign_id,
                nonprofit: state.nonprofit.clone(),
                amount: initial_amount,
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

    /// Claims a refund when the campaign expires or is cancelled without
    /// reaching the initial milestone.
    ///
    /// # Eligibility
    /// Refund is available when ALL of these hold:
    /// * `initial_release_done == false`
    /// * AND (campaign is expired OR cancelled OR vault is paused)
    ///
    /// # CEI
    /// The contribution is zeroed BEFORE the transfer to prevent re-entrancy.
    ///
    /// # Authorization
    /// The `donor` must authorize this call.
    pub fn claim_refund(env: Env, campaign_id: u64, donor: Address) {
        extend_instance_ttl(&env);
        donor.require_auth();

        let state = get_vault_state(&env, campaign_id)
            .unwrap_or_else(|| panic_with_error!(&env, Error::CampaignNotFound));

        let registry_address = get_campaign_registry(&env)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized));
        let registry_client = CampaignRegistryClient::new(&env, &registry_address);
        let campaign = registry_client.get_campaign(&campaign_id);

        let expired = env.ledger().timestamp() > state.deadline;
        let cancelled = campaign.status == CampaignStatus::Cancelled;
        let refundable = !state.initial_release_done && (expired || cancelled || state.paused);

        if !refundable {
            panic_with_error!(&env, Error::RefundNotAvailable);
        }

        let contribution = get_contribution(&env, campaign_id, &donor);
        if contribution <= 0 {
            panic_with_error!(&env, Error::NothingToRefund);
        }

        // --- EFFECTS: zero out BEFORE transfer (CEI) ---
        set_contribution(&env, campaign_id, &donor, 0);

        // --- INTERACTIONS ---
        let token_client = token::Client::new(&env, &state.token_address);
        token_client.transfer(&env.current_contract_address(), &donor, &contribution);

        RefundClaimed {
            campaign_id,
            donor,
            amount: contribution,
        }
        .publish(&env);
    }

    /// Submits evidence for the final milestone.
    ///
    /// The evidence hash can be overwritten before `release_final` is called.
    /// This is intentional: the nonprofit may correct errors in the submitted
    /// evidence.
    ///
    /// # Authorization
    /// Only the nonprofit that owns the campaign can submit evidence.
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

    /// Releases the final milestone to the nonprofit.
    ///
    /// # TOCTOU Protection
    /// The verifier must pass the exact evidence hash they reviewed. If the
    /// nonprofit changed the evidence between review and release, the call
    /// fails with `InvalidEvidenceHash`. This closes the time-of-check /
    /// time-of-use gap.
    ///
    /// # Error Semantics
    /// Two distinct failures are intentionally distinguished:
    /// * **`EvidenceNotSubmitted` (#8)**: no evidence has been submitted yet.
    ///   The verifier has nothing to review.
    /// * **`InvalidEvidenceHash` (#29)**: evidence exists, but the hash the
    ///   verifier passed does not match the currently stored one. This usually
    ///   means the nonprofit overwrote the evidence between review and release.
    ///
    /// Distinguishing these allows the frontend to give actionable feedback
    /// ("wait for evidence" vs. "re-review because evidence changed").
    ///
    /// # Authorization
    /// Only the configured `verifier` can call this function.
    pub fn release_final(
        env: Env,
        campaign_id: u64,
        verifier: Address,
        expected_evidence: Bytes,
    ) {
        extend_instance_ttl(&env);
        verifier.require_auth();

        let mut state = get_vault_state(&env, campaign_id)
            .unwrap_or_else(|| panic_with_error!(&env, Error::CampaignNotFound));

        if state.verifier != verifier {
            panic_with_error!(&env, Error::NotVerifier);
        }
        if state.final_release_done {
            panic_with_error!(&env, Error::FinalAlreadyReleased);
        }

        let stored = state
            .evidence_hash
            .clone()
            .unwrap_or_else(|| panic_with_error!(&env, Error::EvidenceNotSubmitted));

        if stored != expected_evidence {
            panic_with_error!(&env, Error::InvalidEvidenceHash);
        }

        let initial_amount =
            (state.target_amount * state.milestone_percentage as i128) / 100;
        let final_amount = state.total_deposited - initial_amount;

        // --- EFFECTS ---
        state.final_release_done = true;
        save_vault_state(&env, campaign_id, &state);

        // --- INTERACTIONS ---
        let token_client = token::Client::new(&env, &state.token_address);
        token_client.transfer(
            &env.current_contract_address(),
            &state.nonprofit,
            &final_amount,
        );

        FinalFundsReleased {
            campaign_id,
            nonprofit: state.nonprofit,
            amount: final_amount,
        }
        .publish(&env);
    }

    /// Pauses a vault (emergency brake). While paused, `deposit` is blocked
    /// and `claim_refund` becomes available even if the campaign has not
    /// expired.
    ///
    /// # Authorization
    /// Only the admin can pause.
    pub fn pause_vault(env: Env, admin: Address, campaign_id: u64) {
        extend_instance_ttl(&env);
        admin.require_auth();
        let stored =
            get_admin(&env).unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized));
        if admin != stored {
            panic_with_error!(&env, Error::Unauthorized);
        }
        let mut state = get_vault_state(&env, campaign_id)
            .unwrap_or_else(|| panic_with_error!(&env, Error::CampaignNotFound));
        state.paused = true;
        save_vault_state(&env, campaign_id, &state);
        VaultPaused { campaign_id }.publish(&env);
    }

    /// Unpauses a vault, restoring normal deposit behavior.
    ///
    /// # Authorization
    /// Only the admin can unpause.
    pub fn unpause_vault(env: Env, admin: Address, campaign_id: u64) {
        extend_instance_ttl(&env);
        admin.require_auth();
        let stored =
            get_admin(&env).unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized));
        if admin != stored {
            panic_with_error!(&env, Error::Unauthorized);
        }
        let mut state = get_vault_state(&env, campaign_id)
            .unwrap_or_else(|| panic_with_error!(&env, Error::CampaignNotFound));
        state.paused = false;
        save_vault_state(&env, campaign_id, &state);
        VaultUnpaused { campaign_id }.publish(&env);
    }

    /// Returns the current state of a campaign's vault.
    ///
    /// # Errors
    /// Returns `CampaignNotFound` if no vault exists for the campaign.
    pub fn get_vault(env: Env, campaign_id: u64) -> VaultState {
        extend_instance_ttl(&env);
        get_vault_state(&env, campaign_id)
            .unwrap_or_else(|| panic_with_error!(&env, Error::CampaignNotFound))
    }
}
