#![cfg(test)]

use soroban_sdk::{
    testutils::Address as _,
    Address, Env, Vec,
};

use crate::{GovernanceAccountContract, GovernanceAccountContractClient};

fn make_signers(env: &Env, addresses: &[&Address]) -> Vec<Address> {
    let mut v = Vec::new(env);
    for a in addresses {
        v.push_back((*a).clone());
    }
    v
}

fn setup<'a>(
    env: &Env,
    signers: Vec<Address>,
    threshold: u32,
) -> GovernanceAccountContractClient<'a> {
    let id = env.register(GovernanceAccountContract, (&signers, threshold));
    GovernanceAccountContractClient::new(env, &id)
}

#[test]
fn test_constructor_valid() {
    let env = Env::default();
    env.mock_all_auths();

    let s1 = Address::generate(&env);
    let s2 = Address::generate(&env);
    let s3 = Address::generate(&env);
    let signers = make_signers(&env, &[&s1, &s2, &s3]);
    let client = setup(&env, signers, 2);

    assert_eq!(client.get_threshold(), 2);
    assert_eq!(client.get_signers().len(), 3);
    assert!(client.is_signer(&s1));
    assert!(client.is_signer(&s2));
    assert!(client.is_signer(&s3));
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_constructor_empty_signers_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let empty: Vec<Address> = Vec::new(&env);
    setup(&env, empty, 1);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_constructor_threshold_zero_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let s1 = Address::generate(&env);
    setup(&env, make_signers(&env, &[&s1]), 0);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_constructor_threshold_exceeds_signers_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let s1 = Address::generate(&env);
    setup(&env, make_signers(&env, &[&s1]), 2);
}

#[test]
fn test_add_signer() {
    let env = Env::default();
    env.mock_all_auths();

    let s1 = Address::generate(&env);
    let s2 = Address::generate(&env);
    let s3 = Address::generate(&env);
    let client = setup(&env, make_signers(&env, &[&s1, &s2]), 2);

    client.add_signer(&s3);
    assert_eq!(client.get_signers().len(), 3);
    assert!(client.is_signer(&s3));
    // Threshold unchanged.
    assert_eq!(client.get_threshold(), 2);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_add_duplicate_signer_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let s1 = Address::generate(&env);
    let s2 = Address::generate(&env);
    let client = setup(&env, make_signers(&env, &[&s1, &s2]), 2);

    client.add_signer(&s1);
}

#[test]
fn test_remove_signer_keeps_threshold_when_room_available() {
    let env = Env::default();
    env.mock_all_auths();

    let s1 = Address::generate(&env);
    let s2 = Address::generate(&env);
    let s3 = Address::generate(&env);
    let client = setup(&env, make_signers(&env, &[&s1, &s2, &s3]), 2);

    client.remove_signer(&s3);
    assert_eq!(client.get_signers().len(), 2);
    assert_eq!(client.get_threshold(), 2); // unchanged
}

#[test]
fn test_remove_signer_auto_adjusts_threshold() {
    let env = Env::default();
    env.mock_all_auths();

    let s1 = Address::generate(&env);
    let s2 = Address::generate(&env);
    let s3 = Address::generate(&env);
    let client = setup(&env, make_signers(&env, &[&s1, &s2, &s3]), 3);

    client.remove_signer(&s3);
    // Threshold must auto-lower from 3 to 2.
    assert_eq!(client.get_signers().len(), 2);
    assert_eq!(client.get_threshold(), 2);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_remove_non_signer_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let s1 = Address::generate(&env);
    let s2 = Address::generate(&env);
    let stranger = Address::generate(&env);
    let client = setup(&env, make_signers(&env, &[&s1, &s2]), 2);

    client.remove_signer(&stranger);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_remove_last_signer_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let s1 = Address::generate(&env);
    let client = setup(&env, make_signers(&env, &[&s1]), 1);

    client.remove_signer(&s1);
}

#[test]
fn test_update_threshold() {
    let env = Env::default();
    env.mock_all_auths();

    let s1 = Address::generate(&env);
    let s2 = Address::generate(&env);
    let s3 = Address::generate(&env);
    let client = setup(&env, make_signers(&env, &[&s1, &s2, &s3]), 2);

    client.update_threshold(&3);
    assert_eq!(client.get_threshold(), 3);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_update_threshold_invalid_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let s1 = Address::generate(&env);
    let s2 = Address::generate(&env);
    let client = setup(&env, make_signers(&env, &[&s1, &s2]), 2);

    client.update_threshold(&3); // exceeds signer count
}
