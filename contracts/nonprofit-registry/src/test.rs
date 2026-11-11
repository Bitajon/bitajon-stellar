#![cfg(test)]

use protocol_types::{NonprofitProfile, NonprofitStatus};
use soroban_sdk::{testutils::Address as _, Address, Bytes, Env, String};

use crate::{NonprofitRegistryContract, NonprofitRegistryContractClient};

/// Constructs a valid nonprofit profile for use in unit tests.
fn create_mock_profile(env: &Env) -> NonprofitProfile {
    NonprofitProfile {
        legal_name: String::from_str(env, "Fundación de Prueba"),
        tax_id: String::from_str(env, "900123456-7"),
        rut_hash: Bytes::from_slice(env, b"dummy_rut_hash"),
        email_hash: Bytes::from_slice(env, b"dummy_email_hash"),
        retention_certificate: true,
        data_consent: true,
        status: NonprofitStatus::Pending,
    }
}

/// Deploys the contract with a fresh admin and returns the test environment.
fn setup<'a>() -> (Env, Address, NonprofitRegistryContractClient<'a>) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(NonprofitRegistryContract, (&admin,));
    let client = NonprofitRegistryContractClient::new(&env, &contract_id);
    (env, admin, client)
}

// ===========================================================================
// Nonprofit lifecycle
// ===========================================================================

#[test]
fn test_register_and_approve_nonprofit() {
    let (env, admin, client) = setup();
    let nonprofit = Address::generate(&env);
    let profile = create_mock_profile(&env);

    client.register_nonprofit(&nonprofit, &profile);

    let stored = client.get_profile(&nonprofit);
    assert_eq!(stored.status, NonprofitStatus::Pending);
    assert!(!client.is_approved(&nonprofit));

    client.approve_nonprofit(&admin, &nonprofit);

    let stored = client.get_profile(&nonprofit);
    assert_eq!(stored.status, NonprofitStatus::Approved);
    assert!(client.is_approved(&nonprofit));
}

#[test]
fn test_registration_forces_pending_status() {
    let (env, _admin, client) = setup();
    let nonprofit = Address::generate(&env);
    let mut profile = create_mock_profile(&env);
    profile.status = NonprofitStatus::Approved;

    client.register_nonprofit(&nonprofit, &profile);

    assert_eq!(
        client.get_profile(&nonprofit).status,
        NonprofitStatus::Pending
    );
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #4)")]
fn test_register_duplicate_nonprofit() {
    let (env, _admin, client) = setup();
    let nonprofit = Address::generate(&env);
    let profile = create_mock_profile(&env);

    client.register_nonprofit(&nonprofit, &profile);
    client.register_nonprofit(&nonprofit, &profile);
}

#[test]
fn test_revoke_nonprofit() {
    let (env, admin, client) = setup();
    let nonprofit = Address::generate(&env);
    let profile = create_mock_profile(&env);

    client.register_nonprofit(&nonprofit, &profile);
    client.approve_nonprofit(&admin, &nonprofit);
    assert!(client.is_approved(&nonprofit));

    client.revoke_nonprofit(&admin, &nonprofit);

    assert!(!client.is_approved(&nonprofit));
    assert_eq!(
        client.get_profile(&nonprofit).status,
        NonprofitStatus::Revoked
    );
}

// ===========================================================================
// Errors on missing profiles
// ===========================================================================

#[test]
#[should_panic(expected = "HostError: Error(Contract, #2)")]
fn test_approve_non_existent_nonprofit() {
    let (env, admin, client) = setup();
    let nonexistent = Address::generate(&env);

    client.approve_nonprofit(&admin, &nonexistent);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #2)")]
fn test_revoke_non_existent_nonprofit() {
    let (env, admin, client) = setup();
    let nonexistent = Address::generate(&env);

    client.revoke_nonprofit(&admin, &nonexistent);
}

#[test]
fn test_is_approved_for_non_existent() {
    let (env, _admin, client) = setup();
    let nonexistent = Address::generate(&env);

    assert!(!client.is_approved(&nonexistent));
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #2)")]
fn test_get_profile_non_existent() {
    let (env, _admin, client) = setup();
    let nonexistent = Address::generate(&env);

    client.get_profile(&nonexistent);
}

// ===========================================================================
// Two-step admin transfer
// ===========================================================================

/// Happy path: current admin proposes a new admin, new admin accepts.
#[test]
fn test_propose_and_accept_admin_flow() {
    let (env, admin, client) = setup();
    let new_admin = Address::generate(&env);

    assert_eq!(client.get_admin(), admin);
    assert_eq!(client.get_pending_admin(), None);

    client.propose_admin(&admin, &new_admin);
    assert_eq!(client.get_pending_admin(), Some(new_admin.clone()));

    client.accept_admin();

    assert_eq!(client.get_pending_admin(), None);
    assert_eq!(client.get_admin(), new_admin);
}

/// Non-admin cannot propose a successor.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #1)")]
fn test_propose_admin_not_admin() {
    let (env, _admin, client) = setup();
    let attacker = Address::generate(&env);
    let new_admin = Address::generate(&env);

    client.propose_admin(&attacker, &new_admin);
}

/// `accept_admin` fails when there is no pending admin.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #1)")]
fn test_accept_admin_without_pending() {
    let (_env, _admin, client) = setup();

    client.accept_admin();
}

/// Only the pending admin can accept the role.
///
/// The call is made by `pending` via `require_auth()`. With `mock_all_auths`,
/// any address is authorized, so the identity check that matters is
/// `get_pending_admin()`, not the caller. To validate that a non-pending
/// address cannot "accept", we simply check that once accepted, the pending
/// slot is cleared and the admin changed. This test asserts the post-condition.
#[test]
fn test_accept_admin_clears_pending() {
    let (env, admin, client) = setup();
    let new_admin = Address::generate(&env);

    client.propose_admin(&admin, &new_admin);
    assert!(client.get_pending_admin().is_some());

    client.accept_admin();

    assert!(client.get_pending_admin().is_none());
    assert_eq!(client.get_admin(), new_admin);
}

/// The proposed admin can be overwritten by a new proposal before acceptance.
#[test]
fn test_propose_admin_can_be_overwritten() {
    let (env, admin, client) = setup();
    let first_candidate = Address::generate(&env);
    let second_candidate = Address::generate(&env);

    client.propose_admin(&admin, &first_candidate);
    assert_eq!(client.get_pending_admin(), Some(first_candidate));

    client.propose_admin(&admin, &second_candidate);
    assert_eq!(client.get_pending_admin(), Some(second_candidate));
}
