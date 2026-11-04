#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Bytes, Env, String};
use thriving_types::{NonprofitProfile, NonprofitStatus};

use crate::{NonprofitRegistryContract, NonprofitRegistryContractClient};

/// Constructs a valid nonprofit profile for use in unit tests.
fn create_mock_profile(env: &Env) -> NonprofitProfile {
    NonprofitProfile {
        legal_name: String::from_str(env, "Fundación de Prueba"),
        tax_id: String::from_str(env, "900123456-7"),
        rut_hash: Bytes::from_slice(env, b"dummy_hash"),
        retention_certificate: true,
        email: String::from_str(env, "contacto@fundacion.org"),
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

/// Verifies the happy path: register, then approve.
#[test]
fn test_register_and_approve_nonprofit() {
    let (env, admin, client) = setup();
    let nonprofit = Address::generate(&env);
    let profile = create_mock_profile(&env);

    client.register_nonprofit(&nonprofit, &profile);

    let stored = client.get_profile(&nonprofit);
    assert_eq!(stored.status, NonprofitStatus::Pending);
    assert_eq!(client.is_approved(&nonprofit), false);

    client.approve_nonprofit(&admin, &nonprofit);

    let stored = client.get_profile(&nonprofit);
    assert_eq!(stored.status, NonprofitStatus::Approved);
    assert_eq!(client.is_approved(&nonprofit), true);
}

/// Ensures that registration forces Pending status regardless of input.
#[test]
fn test_registration_forces_pending_status() {
    let (env, _admin, client) = setup();
    let nonprofit = Address::generate(&env);
    let mut profile = create_mock_profile(&env);
    profile.status = NonprofitStatus::Approved;

    client.register_nonprofit(&nonprofit, &profile);

    let stored = client.get_profile(&nonprofit);
    assert_eq!(stored.status, NonprofitStatus::Pending);
}

/// Ensures that a nonprofit cannot be registered twice.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #4)")]
fn test_register_duplicate_nonprofit() {
    let (env, _admin, client) = setup();
    let nonprofit = Address::generate(&env);
    let profile = create_mock_profile(&env);

    client.register_nonprofit(&nonprofit, &profile);
    client.register_nonprofit(&nonprofit, &profile);
}

/// Ensures that an admin can revoke an approved nonprofit.
#[test]
fn test_revoke_nonprofit() {
    let (env, admin, client) = setup();
    let nonprofit = Address::generate(&env);
    let profile = create_mock_profile(&env);

    client.register_nonprofit(&nonprofit, &profile);
    client.approve_nonprofit(&admin, &nonprofit);
    assert_eq!(client.is_approved(&nonprofit), true);

    client.revoke_nonprofit(&admin, &nonprofit);

    assert_eq!(client.is_approved(&nonprofit), false);
    assert_eq!(
        client.get_profile(&nonprofit).status,
        NonprofitStatus::Revoked
    );
}

/// Ensures that approving a non-existent nonprofit fails.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #2)")]
fn test_approve_non_existent_nonprofit() {
    let (env, admin, client) = setup();
    let nonexistent = Address::generate(&env);

    client.approve_nonprofit(&admin, &nonexistent);
}

/// Ensures that revoking a non-existent nonprofit fails.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #2)")]
fn test_revoke_non_existent_nonprofit() {
    let (env, admin, client) = setup();
    let nonexistent = Address::generate(&env);

    client.revoke_nonprofit(&admin, &nonexistent);
}

/// Ensures that is_approved returns false for an unregistered address.
#[test]
fn test_is_approved_for_non_existent() {
    let (env, _admin, client) = setup();
    let nonexistent = Address::generate(&env);

    assert_eq!(client.is_approved(&nonexistent), false);
}

/// Ensures that get_profile panics for an unregistered address.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #2)")]
fn test_get_profile_non_existent() {
    let (env, _admin, client) = setup();
    let nonexistent = Address::generate(&env);

    client.get_profile(&nonexistent);
}
