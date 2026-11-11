#![cfg(test)]

use soroban_sdk::{BytesN, Env, Vec};

use crate::{GovernanceAccountContract, GovernanceAccountContractClient};

fn pk(env: &Env, seed: u8) -> BytesN<32> {
    let mut bytes = [0u8; 32];
    bytes[0] = seed;
    BytesN::from_array(env, &bytes)
}

fn make_signers(env: &Env, seeds: &[u8]) -> Vec<BytesN<32>> {
    let mut v = Vec::new(env);
    for s in seeds {
        v.push_back(pk(env, *s));
    }
    v
}

fn setup<'a>(
    env: &Env,
    seeds: &[u8],
    threshold: u32,
) -> GovernanceAccountContractClient<'a> {
    let signers = make_signers(env, seeds);
    let id = env.register(GovernanceAccountContract, (&signers, threshold));
    GovernanceAccountContractClient::new(env, &id)
}

#[test]
fn test_constructor_valid() {
    let env = Env::default();
    env.mock_all_auths();

    let client = setup(&env, &[1, 2, 3], 2);
    assert_eq!(client.get_threshold(), 2);
    assert_eq!(client.get_signers().len(), 3);
    assert!(client.is_signer(&pk(&env, 1)));
    assert!(client.is_signer(&pk(&env, 2)));
    assert!(client.is_signer(&pk(&env, 3)));
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_constructor_empty_signers_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let empty: Vec<BytesN<32>> = Vec::new(&env);
    let id = env.register(GovernanceAccountContract, (&empty, 1u32));
    let _ = GovernanceAccountContractClient::new(&env, &id);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_constructor_threshold_zero_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let _ = setup(&env, &[1], 0);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_constructor_threshold_exceeds_signers_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let _ = setup(&env, &[1], 2);
}

#[test]
fn test_add_signer() {
    let env = Env::default();
    env.mock_all_auths();

    let client = setup(&env, &[1, 2], 2);
    client.add_signer(&pk(&env, 3));

    assert_eq!(client.get_signers().len(), 3);
    assert!(client.is_signer(&pk(&env, 3)));
    assert_eq!(client.get_threshold(), 2);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_add_duplicate_signer_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup(&env, &[1, 2], 2);
    client.add_signer(&pk(&env, 1));
}

#[test]
fn test_remove_signer_keeps_threshold_when_room_available() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup(&env, &[1, 2, 3], 2);

    client.remove_signer(&pk(&env, 3));
    assert_eq!(client.get_signers().len(), 2);
    assert_eq!(client.get_threshold(), 2);
}

#[test]
fn test_remove_signer_auto_adjusts_threshold() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup(&env, &[1, 2, 3], 3);

    client.remove_signer(&pk(&env, 3));
    assert_eq!(client.get_signers().len(), 2);
    assert_eq!(client.get_threshold(), 2);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_remove_non_signer_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup(&env, &[1, 2], 2);
    client.remove_signer(&pk(&env, 99));
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_remove_last_signer_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup(&env, &[1], 1);
    client.remove_signer(&pk(&env, 1));
}

#[test]
fn test_update_threshold() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup(&env, &[1, 2, 3], 2);
    client.update_threshold(&3);
    assert_eq!(client.get_threshold(), 3);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_update_threshold_invalid_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup(&env, &[1, 2], 2);
    client.update_threshold(&3);
}
