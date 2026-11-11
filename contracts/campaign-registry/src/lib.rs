#![no_std]

//! Campaign Registry Contract
//!
//! Metadata source of truth for fundraising campaigns in the Bitajón
//! protocol. Tracks campaign lifecycle and validates that the creator is an
//! approved nonprofit before allowing campaign creation.
//!
//! # Lifecycle
//! 1. **`create_campaign`**: An approved nonprofit creates a campaign with
//!    a name, description, location, target amount, SEP-41 token, deadline,
//!    and milestone percentage. The contract validates the nonprofit against
//!    `nonprofit-registry` via a typed cross-contract call.
//! 2. **`cancel_campaign`**: The owning nonprofit can cancel an active
//!    campaign before the deadline. Cancellation makes the associated vault
//!    eligible for pull-based refunds (see `campaign-vault.claim_refund`).
//!
//! # Milestone Percentage
//!
//! The percentage of `target_amount` released upon reaching the goal is
//! **required** per campaign (no implicit default) and must be in the range
//! `MIN_MILESTONE_PERCENTAGE..=MAX_MILESTONE_PERCENTAGE` (1% to 90%).
//!
//! **Why the 90% cap?** The protocol's differentiator is "Payment by
//! Progress": a substantive portion of funds must remain tied to evidence
//! validation. A 100% (or even 99%) milestone would reduce evidence review
//! to a symbolic step with no meaningful financial weight. The 90% cap
//! ensures at least 10% of `target_amount` is always contingent on
//! acceptable evidence, protecting donors from hollow accountability.
//!
//! The frontend should suggest `RECOMMENDED_MILESTONE_PERCENTAGE` (50%) as
//! a starting point, but the contract does not enforce any specific value
//! within the allowed range.
//!
//! # Standards
//! * **SEP-41**: The `token_address` field references a SEP-41 token (SAC).
//!   The contract validates it at creation by calling `decimals()`, but does
//!   not hold or transfer tokens. Custody is handled by `campaign-vault`.
//! * **SEP-45 (planned)**: The admin can be a smart account that
//!   authenticates via SEP-45. This contract only requires
//!   `Address::require_auth()`, which works transparently for both EOAs and
//!   smart accounts.
//!
//! # Security
//! * CEI pattern followed in every mutation.
//! * `create_campaign` requires the nonprofit to authorize and be approved
//!   in `nonprofit-registry`.
//! * Token addresses are validated before being stored.
//! * Two-step admin transfer prevents accidental lockout.
//! * Instance and persistent TTLs extended on every entry point.

mod events;
mod storage;
#[cfg(test)]
mod test;

use protocol_interfaces::NonprofitRegistryClient;
use protocol_types::{
    Campaign, CampaignStatus, Error, MAX_MILESTONE_PERCENTAGE, MIN_MILESTONE_PERCENTAGE,
};
use soroban_sdk::{contract, contractimpl, panic_with_error, token, Address, Env, String};

use crate::events::{AdminAccepted, AdminProposed, CampaignCancelled, CampaignCreated};
use crate::storage::{
    clear_pending_admin, extend_instance_ttl, get_admin, get_campaign, get_next_campaign_id,
    get_nonprofit_registry, get_pending_admin, increment_campaign_id, save_campaign, set_admin,
    set_nonprofit_registry, set_pending_admin,
};

#[contract]
pub struct CampaignRegistryContract;

#[contractimpl]
impl CampaignRegistryContract {
    /// Initializes the contract with an admin and the Nonprofit Registry address.
    ///
    /// # Arguments
    /// * `admin` - Address authorized to manage the registry. Can be an EOA
    ///   (`G...`) or a smart account (`C...`).
    /// * `nonprofit_registry` - Address of the deployed Nonprofit Registry.
    pub fn __constructor(env: Env, admin: Address, nonprofit_registry: Address) {
        if get_admin(&env).is_some() {
            panic_with_error!(&env, Error::Unauthorized);
        }
        set_admin(&env, &admin);
        set_nonprofit_registry(&env, &nonprofit_registry);
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

    // --- Campaign lifecycle ---

    /// Creates a new campaign owned by an approved nonprofit.
    ///
    /// # Validation
    /// * `target_amount` must be strictly positive.
    /// * `deadline` must be in the future.
    /// * `milestone_percentage` must be in
    ///   `MIN_MILESTONE_PERCENTAGE..=MAX_MILESTONE_PERCENTAGE` (1..=90).
    ///   No default fallback: the caller must choose explicitly.
    /// * `token_address` must be a valid SEP-41 token (verified via `decimals()`).
    /// * `nonprofit` must be approved in the Nonprofit Registry.
    ///
    /// # Authorization
    /// The `nonprofit` address must authorize this call.
    ///
    /// # Returns
    /// The newly assigned `campaign_id`.
    pub fn create_campaign(
        env: Env,
        nonprofit: Address,
        name: String,
        description: String,
        location: String,
        target_amount: i128,
        token_address: Address,
        deadline: u64,
        milestone_percentage: u32,
    ) -> u64 {
        extend_instance_ttl(&env);
        nonprofit.require_auth();

        // --- CHECKS ---
        if target_amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        if deadline <= env.ledger().timestamp() {
            panic_with_error!(&env, Error::InvalidDeadline);
        }

        // Milestone validation: the value is required and must leave at least
        // 10% of the target tied to evidence validation.
        if milestone_percentage < MIN_MILESTONE_PERCENTAGE
            || milestone_percentage > MAX_MILESTONE_PERCENTAGE
        {
            panic_with_error!(&env, Error::InvalidMilestonePercentage);
        }

        // Validate that the token address points to a real SEP-41 token.
        // Panics if the address is not a valid token contract.
        let token_client = token::Client::new(&env, &token_address);
        let _ = token_client.decimals();

        // Validate that the nonprofit is approved via cross-contract call.
        let registry_address = get_nonprofit_registry(&env)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized));
        let registry_client = NonprofitRegistryClient::new(&env, &registry_address);
        if !registry_client.is_approved(&nonprofit) {
            panic_with_error!(&env, Error::NonprofitNotApproved);
        }

        // --- EFFECTS ---
        let campaign_id = get_next_campaign_id(&env);

        let campaign = Campaign {
            nonprofit: nonprofit.clone(),
            name: name.clone(),
            description,
            location,
            target_amount,
            token_address,
            deadline,
            milestone_percentage,
            status: CampaignStatus::Active,
        };

        save_campaign(&env, campaign_id, &campaign);
        increment_campaign_id(&env);

        // --- INTERACTIONS ---
        CampaignCreated {
            campaign_id,
            nonprofit,
            name,
            target_amount,
        }
        .publish(&env);

        campaign_id
    }

    /// Cancels an active campaign owned by the caller.
    ///
    /// # Note
    /// Cancellation flips the campaign status to `Cancelled`. Existing vaults
    /// become eligible for pull-based refunds (see `campaign-vault.claim_refund`).
    ///
    /// # Authorization
    /// Only the nonprofit that owns the campaign can cancel it.
    ///
    /// # Errors
    /// * `CampaignNotFound` if the campaign does not exist.
    /// * `Unauthorized` if the caller is not the owning nonprofit.
    /// * `CampaignNotActive` if the campaign is not in `Active` status.
    pub fn cancel_campaign(env: Env, nonprofit: Address, campaign_id: u64) {
        extend_instance_ttl(&env);
        nonprofit.require_auth();

        let mut campaign = get_campaign(&env, campaign_id)
            .unwrap_or_else(|| panic_with_error!(&env, Error::CampaignNotFound));

        if campaign.nonprofit != nonprofit {
            panic_with_error!(&env, Error::Unauthorized);
        }
        if campaign.status != CampaignStatus::Active {
            panic_with_error!(&env, Error::CampaignNotActive);
        }

        // --- EFFECTS ---
        campaign.status = CampaignStatus::Cancelled;
        save_campaign(&env, campaign_id, &campaign);

        // --- INTERACTIONS ---
        CampaignCancelled {
            campaign_id,
            nonprofit,
        }
        .publish(&env);
    }

    /// Returns the metadata of a specific campaign.
    ///
    /// # Errors
    /// * `CampaignNotFound` if the ID does not exist.
    pub fn get_campaign(env: Env, campaign_id: u64) -> Campaign {
        extend_instance_ttl(&env);
        get_campaign(&env, campaign_id)
            .unwrap_or_else(|| panic_with_error!(&env, Error::CampaignNotFound))
    }
}
