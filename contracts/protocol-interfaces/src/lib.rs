#![no_std]

//! Public traits for cross-contract calls within the Bitajón protocol.
//!
//! These interfaces enable typed, decoupled communication between contracts.
//! Each trait is annotated with `#[contractclient]` to generate a typed client
//! that can be used in other contracts without importing the full implementation.

use soroban_sdk::{contractclient, Address, Env};
use protocol_types::{Campaign, NonprofitProfile, VaultState};

/// Public interface for the Nonprofit Registry contract.
///
/// Used by other contracts to verify organizational legitimacy before
/// allowing campaign creation or fund disbursement.
#[contractclient(name = "NonprofitRegistryClient")]
pub trait NonprofitRegistry {
    /// Returns `true` if the address belongs to an approved nonprofit.
    ///
    /// # Arguments
    /// * `nonprofit` - Stellar address of the organization to verify.
    fn is_approved(env: Env, nonprofit: Address) -> bool;

    /// Retrieves the full profile of a registered nonprofit.
    ///
    /// # Errors
    /// Returns `NonprofitNotFound` if the address has no profile.
    fn get_profile(env: Env, nonprofit: Address) -> NonprofitProfile;
}

/// Public interface for the Campaign Registry contract.
///
/// Used by the vault to fetch campaign metadata and by the frontend to
/// display campaign state. The vault caches immutable fields at creation
/// to minimize calls on the hot path.
#[contractclient(name = "CampaignRegistryClient")]
pub trait CampaignRegistry {
    /// Retrieves the metadata of a specific campaign.
    ///
    /// # Errors
    /// Returns `CampaignNotFound` if the ID does not exist.
    fn get_campaign(env: Env, campaign_id: u64) -> Campaign;
}

/// Public interface for the Campaign Vault contract.
///
/// Used by the donation router to forward deposits and by the frontend
/// to read custody state. Direct calls to `deposit` from the frontend
/// are blocked when `authorized_router` is configured.
#[contractclient(name = "CampaignVaultClient")]
pub trait CampaignVault {
    /// Forwards a deposit to the vault on behalf of the donor.
    ///
    /// # Authorization
    /// * `donor` must authorize the top-level transaction.
    /// * If `authorized_router` is set, the router must be the direct invoker.
    ///
    /// # Arguments
    /// * `campaign_id` - ID of the campaign.
    /// * `donor` - Address that signed the transaction.
    /// * `amount` - Net amount to deposit (after platform fees).
    fn deposit(env: Env, campaign_id: u64, donor: Address, amount: i128);

    /// Retrieves the custody state of a campaign.
    ///
    /// # Errors
    /// Returns `CampaignNotFound` if no vault exists for the campaign.
    fn get_vault(env: Env, campaign_id: u64) -> VaultState;
}
