#![no_std]

//! Campaign Registry Contract
//!
//! This contract manages the lifecycle of fundraising campaigns created by
//! verified nonprofit organizations. It serves as the metadata layer that
//! the `campaign-vault` contract references for fund custody and release.
//!
//! # Roles
//! * **Admin**: The address configured in the constructor. Responsible for
//!   initializing the registry.
//! * **Nonprofit**: An approved organization that can create and cancel campaigns.
//!
//! # Security
//! * Campaign creation is restricted to nonprofits approved by the
//!   `nonprofit-registry` contract via a cross-contract call.
//! * Input parameters are strictly validated to prevent invalid states.
//! * Only the nonprofit that created a campaign can cancel it.
//! * Checks-Effects-Interactions (CEI) pattern is followed where applicable.

mod events;
mod storage;
#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractimpl, panic_with_error, token, Address, Env, String};
use thriving_interfaces::NonprofitRegistryClient;
use thriving_types::{Campaign, CampaignStatus, Error, DEFAULT_MILESTONE_PERCENTAGE};

use crate::events::{CampaignCancelled, CampaignCreated};
use crate::storage::{
    extend_instance_ttl, get_admin, get_campaign, get_next_campaign_id, get_nonprofit_registry,
    increment_campaign_id, save_campaign, set_admin, set_nonprofit_registry,
};

/// The main contract struct for the Campaign Registry.
#[contract]
pub struct CampaignRegistryContract;

#[contractimpl]
impl CampaignRegistryContract {
    /// Initializes the contract with an administrator address and the
    /// address of the Nonprofit Registry contract.
    ///
    /// # Arguments
    /// * `admin` - The address authorized to manage the registry.
    /// * `nonprofit_registry` - The address of the deployed `nonprofit-registry`
    ///   contract, used for validating nonprofit legitimacy.
    ///
    /// # Errors
    /// * Panics if the contract has already been initialized.
    pub fn __constructor(env: Env, admin: Address, nonprofit_registry: Address) {
        if get_admin(&env).is_some() {
            panic_with_error!(&env, Error::Unauthorized);
        }
        set_admin(&env, &admin);
        set_nonprofit_registry(&env, &nonprofit_registry);
    }

    /// Creates a new fundraising campaign.
    ///
    /// # Arguments
    /// * `nonprofit` - The address of the nonprofit creating the campaign.
    /// * `name` - The campaign name.
    /// * `description` - A description of the campaign.
    /// * `location` - The geographic location of the campaign.
    /// * `target_amount` - The funding goal in the smallest unit of the token.
    /// * `token_address` - The Stellar Asset Contract (SAC) address of the stablecoin.
    /// * `deadline` - The Unix timestamp after which the campaign expires.
    /// * `milestone_percentage` - The percentage of funds released upon reaching
    ///   the target (e.g., 50 for 50%). If 0, `DEFAULT_MILESTONE_PERCENTAGE` is used.
    ///
    /// # Authorization
    /// The `nonprofit` address must authorize this call and be approved in the
    /// `nonprofit-registry` contract.
    ///
    /// # Returns
    /// The newly assigned campaign ID.
    ///
    /// # Errors
    /// * `InvalidAmount` if the target amount is not strictly positive.
    /// * `InvalidDeadline` if the deadline is not in the future.
    /// * `InvalidMilestonePercentage` if the milestone percentage exceeds 100.
    /// * `NonprofitNotApproved` if the nonprofit is not approved in the registry.
    /// * `Unauthorized` if the caller is not the nonprofit.
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

        // Input validation
        if target_amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        if deadline <= env.ledger().timestamp() {
            panic_with_error!(&env, Error::InvalidDeadline);
        }
        if milestone_percentage > 100 {
            panic_with_error!(&env, Error::InvalidMilestonePercentage);
        }

        // Validate that the token address points to a valid token contract
        let token_client = token::Client::new(&env, &token_address);
        token_client.decimals(); // Panics if not a valid token contract

        // Cross-contract call to validate nonprofit legitimacy
        let registry_address = get_nonprofit_registry(&env)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized));
        let registry_client = NonprofitRegistryClient::new(&env, &registry_address);
        if !registry_client.is_approved(&nonprofit) {
            panic_with_error!(&env, Error::NonprofitNotApproved);
        }

        let campaign_id = get_next_campaign_id(&env);
        let effective_milestone = if milestone_percentage == 0 {
            DEFAULT_MILESTONE_PERCENTAGE
        } else {
            milestone_percentage
        };

        let campaign = Campaign {
            nonprofit: nonprofit.clone(),
            name: name.clone(),
            description,
            location,
            target_amount,
            token_address,
            deadline,
            milestone_percentage: effective_milestone,
            status: CampaignStatus::Active,
        };

        // Effects
        save_campaign(&env, campaign_id, &campaign);
        increment_campaign_id(&env);

        // Interactions (Events)
        CampaignCreated {
            campaign_id,
            nonprofit,
            name,
            target_amount,
        }
        .publish(&env);

        campaign_id
    }

    /// Cancels an active campaign.
    ///
    /// # Arguments
    /// * `nonprofit` - The address of the nonprofit that owns the campaign.
    /// * `campaign_id` - The ID of the campaign to cancel.
    ///
    /// # Authorization
    /// Only the nonprofit that created the campaign can cancel it.
    ///
    /// # Errors
    /// * `CampaignNotFound` if the campaign does not exist.
    /// * `Unauthorized` if the caller is not the owner.
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

        // Effects
        campaign.status = CampaignStatus::Cancelled;
        save_campaign(&env, campaign_id, &campaign);

        // Interactions (Events)
        CampaignCancelled {
            campaign_id,
            nonprofit,
        }
        .publish(&env);
    }

    /// Retrieves the metadata of a specific campaign.
    ///
    /// # Arguments
    /// * `campaign_id` - The ID of the campaign.
    ///
    /// # Returns
    /// The `Campaign` struct.
    ///
    /// # Errors
    /// * `CampaignNotFound` if the campaign does not exist.
    pub fn get_campaign(env: Env, campaign_id: u64) -> Campaign {
        get_campaign(&env, campaign_id)
            .unwrap_or_else(|| panic_with_error!(&env, Error::CampaignNotFound))
    }
}
