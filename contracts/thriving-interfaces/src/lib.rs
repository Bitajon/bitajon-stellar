#![no_std]

//! Public traits for cross-contract calls within the Thriving Stellar ecosystem.
//! These interfaces enable typed, decoupled communication between contracts.

use soroban_sdk::{contractclient, Address, Env};
use thriving_types::NonprofitProfile;

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
