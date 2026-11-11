#![no_std]

//! Nonprofit Registry Contract
//!
//! Source of truth for organizational legitimacy in the Bitajón protocol.
//! Tracks the lifecycle of nonprofits from registration to revocation and
//! exposes a typed interface (`is_approved`) consumed by other contracts.
//!
//! # Lifecycle
//! 1. **`register_nonprofit`**: The nonprofit submits its legal profile. The
//!    status is forced to `Pending` regardless of input.
//! 2. **`approve_nonprofit`**: The admin approves the profile, enabling the
//!    nonprofit to create campaigns.
//! 3. **`revoke_nonprofit`**: The admin revokes approval. Existing campaigns
//!    are not affected (documented in `known-limitations.md`).
//!
//! # Privacy (Ley 1581 de 2012)
//! Personal data (RUT, contact email) is stored off-chain. On-chain we keep
//! only SHA-256 hashes so the profile is verifiable without exposing PII.
//!
//! # Standards
//! * **SEP-41**: This contract does not handle tokens, but the `Campaign`
//!   metadata it stores references SEP-41 token addresses.
//! * **SEP-45 (planned)**: The admin can be a smart account that authenticates
//!   via SEP-45. This contract only requires `Address::require_auth()`, which
//!   works transparently for both EOAs and smart accounts.
//!
//! # Security
//! * CEI pattern followed in every mutation.
//! * `register_nonprofit` forces `Pending` to prevent approval bypass.
//! * Two-step admin transfer prevents accidental lockout.
//! * Instance and persistent TTLs extended on every entry point.

mod events;
mod storage;
#[cfg(test)]
mod test;

use protocol_types::{Error, NonprofitProfile, NonprofitStatus};
use soroban_sdk::{contract, contractimpl, panic_with_error, Address, Env};

use crate::events::{
    AdminAccepted, AdminProposed, NonprofitApproved, NonprofitRegistered, NonprofitRevoked,
};
use crate::storage::{
    clear_pending_admin, extend_instance_ttl, get_admin, get_pending_admin, get_profile,
    has_profile, save_profile, set_admin, set_pending_admin,
};

#[contract]
pub struct NonprofitRegistryContract;

#[contractimpl]
impl NonprofitRegistryContract {
    /// Initializes the contract with an admin address.
    ///
    /// # Arguments
    /// * `admin` - Address authorized to approve and revoke nonprofits.
    ///   Can be an EOA (`G...`) or a smart account (`C...`).
    pub fn __constructor(env: Env, admin: Address) {
        if get_admin(&env).is_some() {
            panic_with_error!(&env, Error::Unauthorized);
        }
        set_admin(&env, &admin);
    }

    // --- Two-step admin transfer ---

    /// Proposes a new admin. The proposal must be accepted by the new admin.
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

    /// Returns the pending admin, if any.
    pub fn get_pending_admin(env: Env) -> Option<Address> {
        get_pending_admin(&env)
    }

    /// Returns the current admin.
    pub fn get_admin(env: Env) -> Address {
        get_admin(&env).unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized))
    }

    // --- Nonprofit lifecycle ---

    /// Registers a new nonprofit in a pending state.
    ///
    /// The `status` field of the input is ignored and forced to `Pending`.
    /// This prevents a caller from registering themselves as approved.
    ///
    /// # Authorization
    /// The `nonprofit` address must authorize this call.
    ///
    /// # Errors
    /// * `NonprofitAlreadyRegistered` if the address already has a profile.
    pub fn register_nonprofit(env: Env, nonprofit: Address, mut profile: NonprofitProfile) {
        extend_instance_ttl(&env);
        nonprofit.require_auth();

        if has_profile(&env, &nonprofit) {
            panic_with_error!(&env, Error::NonprofitAlreadyRegistered);
        }

        // Force Pending: the caller cannot self-approve.
        profile.status = NonprofitStatus::Pending;
        save_profile(&env, &nonprofit, &profile);

        NonprofitRegistered {
            nonprofit,
            legal_name: profile.legal_name,
        }
        .publish(&env);
    }

    /// Approves a pending nonprofit, enabling it to create campaigns.
    ///
    /// # Authorization
    /// Only the admin can approve.
    ///
    /// # Errors
    /// * `Unauthorized` if the caller is not the admin.
    /// * `NonprofitNotFound` if the address has no profile.
    pub fn approve_nonprofit(env: Env, admin: Address, nonprofit: Address) {
        extend_instance_ttl(&env);
        admin.require_auth();

        let stored =
            get_admin(&env).unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized));
        if admin != stored {
            panic_with_error!(&env, Error::Unauthorized);
        }

        let mut profile = get_profile(&env, &nonprofit)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NonprofitNotFound));

        if profile.status == NonprofitStatus::Approved {
            return;
        }

        // --- EFFECTS ---
        profile.status = NonprofitStatus::Approved;
        save_profile(&env, &nonprofit, &profile);

        // --- INTERACTIONS ---
        NonprofitApproved { nonprofit }.publish(&env);
    }

    /// Revokes an approved nonprofit.
    ///
    /// # Note
    /// Revocation does not cancel existing campaigns. See
    /// `docs/known-limitations.md` (L1) for the rationale and mitigation.
    ///
    /// # Authorization
    /// Only the admin can revoke.
    ///
    /// # Errors
    /// * `Unauthorized` if the caller is not the admin.
    /// * `NonprofitNotFound` if the address has no profile.
    pub fn revoke_nonprofit(env: Env, admin: Address, nonprofit: Address) {
        extend_instance_ttl(&env);
        admin.require_auth();

        let stored =
            get_admin(&env).unwrap_or_else(|| panic_with_error!(&env, Error::Unauthorized));
        if admin != stored {
            panic_with_error!(&env, Error::Unauthorized);
        }

        let mut profile = get_profile(&env, &nonprofit)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NonprofitNotFound));

        if profile.status == NonprofitStatus::Revoked {
            return;
        }

        // --- EFFECTS ---
        profile.status = NonprofitStatus::Revoked;
        save_profile(&env, &nonprofit, &profile);

        // --- INTERACTIONS ---
        NonprofitRevoked { nonprofit }.publish(&env);
    }

    // --- Queries ---

    /// Returns `true` if the nonprofit exists and is approved.
    ///
    /// Designed to be called cross-contract from `campaign-registry` and
    /// `campaign-vault`. A missing profile returns `false` rather than
    /// panicking, so callers can branch cleanly.
    pub fn is_approved(env: Env, nonprofit: Address) -> bool {
        extend_instance_ttl(&env);
        match get_profile(&env, &nonprofit) {
            Some(p) => p.status == NonprofitStatus::Approved,
            None => false,
        }
    }

    /// Returns the full profile of a registered nonprofit.
    ///
    /// # Errors
    /// * `NonprofitNotFound` if the address has no profile.
    pub fn get_profile(env: Env, nonprofit: Address) -> NonprofitProfile {
        extend_instance_ttl(&env);
        get_profile(&env, &nonprofit)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NonprofitNotFound))
    }
}
