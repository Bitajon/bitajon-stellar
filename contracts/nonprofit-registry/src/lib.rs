#![no_std]

//! Nonprofit Registry Contract
//!
//! This contract manages the lifecycle of verified nonprofit organizations within
//! the Thriving Stellar ecosystem. It serves as the source of truth for organizational
//! legitimacy, enabling other contracts (e.g., campaign-registry, campaign-vault)
//! to verify that a nonprofit is authorized to operate on the platform.
//!
//! # Roles
//! * **Admin**: The address configured in the constructor. Responsible for approving
//!   and revoking nonprofit registrations.
//! * **Nonprofit**: An organization seeking verification. Once approved, it can create
//!   campaigns and receive donations.
//!
//! # Security
//! * All state-mutating functions require authorization from the caller.
//! * The `approve_nonprofit` function is restricted to the Admin.
//! * Checks-Effects-Interactions (CEI) pattern is followed where applicable.

mod events;
mod storage;
#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractimpl, panic_with_error, Address, Env};
use thriving_types::{
    Error, NonprofitProfile, NonprofitStatus,
};

use crate::events::{NonprofitApproved, NonprofitRegistered, NonprofitRevoked};
use crate::storage::{get_admin, set_admin, get_profile, save_profile, has_profile};

/// The main contract struct for the Nonprofit Registry.
#[contract]
pub struct NonprofitRegistryContract;

#[contractimpl]
impl NonprofitRegistryContract {
    /// Initializes the contract with an administrator address.
    ///
    /// # Arguments
    /// * `admin` - The address that will have authority to approve and revoke
    ///   nonprofit registrations.
    ///
    /// # Errors
    /// * Panics if the contract has already been initialized.
    pub fn __constructor(env: Env, admin: Address) {
        if get_admin(&env).is_some() {
            panic_with_error!(&env, Error::Unauthorized);
        }
        set_admin(&env, &admin);
    }

    /// Registers a new nonprofit organization in a pending state.
    ///
    /// # Arguments
    /// * `nonprofit` - The Stellar address of the nonprofit organization.
    /// * `profile` - The legal and contact profile of the organization. The `status`
    ///   field is ignored and forced to `Pending`.
    ///
    /// # Authorization
    /// The `nonprofit` address must authorize this call.
    ///
    /// # Errors
    /// * `NonprofitAlreadyRegistered` if the address already has a profile.
    pub fn register_nonprofit(
        env: Env,
        nonprofit: Address,
        mut profile: NonprofitProfile,
    ) {
        nonprofit.require_auth();

        if has_profile(&env, &nonprofit) {
            panic_with_error!(&env, Error::NonprofitAlreadyRegistered);
        }

        // Force the status to Pending regardless of the input.
        profile.status = NonprofitStatus::Pending;
        save_profile(&env, &nonprofit, &profile);

        NonprofitRegistered { nonprofit, legal_name: profile.legal_name }.publish(&env);
    }

    /// Approves a pending nonprofit organization, allowing it to operate on the platform.
    ///
    /// # Arguments
    /// * `nonprofit` - The address of the nonprofit to approve.
    ///
    /// # Authorization
    /// Only the Admin can call this function.
    ///
    /// # Errors
    /// * `NonprofitNotFound` if the address has no profile.
    /// * `Unauthorized` if the caller is not the Admin.
    pub fn approve_nonprofit(env: Env, admin: Address, nonprofit: Address) {
        admin.require_auth();

        let stored_admin = get_admin(&env)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized));

        if admin != stored_admin {
            panic_with_error!(&env, Error::Unauthorized);
        }

        let mut profile = get_profile(&env, &nonprofit)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NonprofitNotFound));

        // CEI: Check state, then update.
        if profile.status == NonprofitStatus::Approved {
            return;
        }

        profile.status = NonprofitStatus::Approved;
        save_profile(&env, &nonprofit, &profile);

        NonprofitApproved { nonprofit }.publish(&env);
    }

    /// Revokes an approved nonprofit, preventing it from operating on the platform.
    ///
    /// # Arguments
    /// * `nonprofit` - The address of the nonprofit to revoke.
    ///
    /// # Authorization
    /// Only the Admin can call this function.
    ///
    /// # Errors
    /// * `NonprofitNotFound` if the address has no profile.
    /// * `Unauthorized` if the caller is not the Admin.
    pub fn revoke_nonprofit(env: Env, admin: Address, nonprofit: Address) {
        admin.require_auth();

        let stored_admin = get_admin(&env)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized));

        if admin != stored_admin {
            panic_with_error!(&env, Error::Unauthorized);
        }

        let mut profile = get_profile(&env, &nonprofit)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NonprofitNotFound));

        if profile.status == NonprofitStatus::Revoked {
            return;
        }

        profile.status = NonprofitStatus::Revoked;
        save_profile(&env, &nonprofit, &profile);

        NonprofitRevoked { nonprofit }.publish(&env);
    }

    /// Checks if a nonprofit is approved and authorized to operate.
    ///
    /// # Arguments
    /// * `nonprofit` - The address to check.
    ///
    /// # Returns
    /// `true` if the nonprofit exists and is `Approved`, otherwise `false`.
    pub fn is_approved(env: Env, nonprofit: Address) -> bool {
        match get_profile(&env, &nonprofit) {
            Some(profile) => profile.status == NonprofitStatus::Approved,
            None => false,
        }
    }

    /// Retrieves the full profile of a registered nonprofit.
    ///
    /// # Arguments
    /// * `nonprofit` - The address of the nonprofit.
    ///
    /// # Returns
    /// The `NonprofitProfile`.
    ///
    /// # Errors
    /// * `NonprofitNotFound` if the address has no profile.
    pub fn get_profile(env: Env, nonprofit: Address) -> NonprofitProfile {
        get_profile(&env, &nonprofit)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NonprofitNotFound))
    }
}
