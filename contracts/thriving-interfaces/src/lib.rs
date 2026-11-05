#![no_std]

//! Public traits for cross-contract calls within the Thriving Stellar ecosystem.
//! These interfaces enable typed, decoupled communication between contracts.

use soroban_sdk::{contractclient, Address, Env};
use thriving_types::{Campaign, NonprofitProfile, VaultState};

/// Defines the public interface for interacting with the Nonprofit Registry contract.
/// Used by other contracts to verify organizational legitimacy before allowing
/// campaign creation or fund disbursement.
#[contractclient(name = "NonprofitRegistryClient")]
pub trait NonprofitRegistry {
    /// Verifies if a given address belongs to an approved nonprofit organization.
    ///
    /// # Arguments
    /// * `address` - The Stellar address of the nonprofit to verify.
    ///
    /// # Returns
    /// `true` if the nonprofit exists and its status is `Approved`, otherwise `false`.
    fn is_approved(env: Env, address: Address) -> bool;

    /// Retrieves the full profile of a registered nonprofit.
    ///
    /// # Arguments
    /// * `address` - The Stellar address of the nonprofit.
    ///
    /// # Returns
    /// The `NonprofitProfile` if found.
    fn get_profile(env: Env, address: Address) -> NonprofitProfile;
}

/// Defines the public interface for interacting with the Campaign Registry contract.
/// Used by the campaign-vault to fetch campaign metadata (target amount, token,
/// milestone configuration) and verify that the campaign is still active before
/// accepting deposits or releasing funds.
#[contractclient(name = "CampaignRegistryClient")]
pub trait CampaignRegistry {
    /// Retrieves the metadata of a specific campaign.
    ///
    /// # Arguments
    /// * `campaign_id` - The ID of the campaign.
    ///
    /// # Returns
    /// The `Campaign` struct.
    fn get_campaign(env: Env, campaign_id: u64) -> Campaign;
}

/// Defines the public interface for interacting with the Campaign Vault contract.
/// Used by the donation router to forward deposits and read token metadata.
#[contractclient(name = "CampaignVaultClient")]
pub trait CampaignVault {
    /// Forwards a deposit to the vault on behalf of the donor.
    ///
    /// # Arguments
    /// * `campaign_id` - The ID of the campaign.
    /// * `donor` - The address that signed the top-level transaction.
    /// * `amount` - The net amount to deposit (after platform fees).
    fn deposit(env: Env, campaign_id: u64, donor: Address, amount: i128);

    /// Retrieves the vault state, used to discover the donation token address.
    ///
    /// # Arguments
    /// * `campaign_id` - The ID of the campaign.
    ///
    /// # Returns
    /// The `VaultState` for the campaign.
    fn get_vault(env: Env, campaign_id: u64) -> VaultState;
}
