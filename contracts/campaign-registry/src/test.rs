#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Address, Env, String,
};

use crate::{CampaignRegistryContract, CampaignRegistryContractClient};

/// Deploys the contract with a dummy nonprofit registry address.
/// Validation failures occur before the cross-contract call, so the
/// registry is never actually invoked.
fn setup_validations<'a>() -> (
    Env,
    Address, // Nonprofit
    Address, // Valid token
    CampaignRegistryContractClient<'a>,
) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = 1_700_000_000);

    let admin = Address::generate(&env);
    let nonprofit = Address::generate(&env);
    let dummy_registry = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_address = env
        .register_stellar_asset_contract_v2(token_admin)
        .address();

    let contract_id = env.register(CampaignRegistryContract, (&admin, &dummy_registry));
    let client = CampaignRegistryContractClient::new(&env, &contract_id);
    (env, nonprofit, token_address, client)
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #11)")]
fn test_create_campaign_invalid_amount() {
    let (env, nonprofit, token_address, client) = setup_validations();

    client.create_campaign(
        &nonprofit,
        &String::from_str(&env, "Invalid Amount"),
        &String::from_str(&env, "Desc"),
        &String::from_str(&env, "Loc"),
        &0i128,
        &token_address,
        &(env.ledger().timestamp() + 86_400),
        &50u32,
    );
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #12)")]
fn test_create_campaign_invalid_deadline() {
    let (env, nonprofit, token_address, client) = setup_validations();

    let expired_deadline = env.ledger().timestamp();

    client.create_campaign(
        &nonprofit,
        &String::from_str(&env, "Invalid Deadline"),
        &String::from_str(&env, "Desc"),
        &String::from_str(&env, "Loc"),
        &1_000i128,
        &token_address,
        &expired_deadline,
        &50u32,
    );
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #13)")]
fn test_create_campaign_invalid_milestone() {
    let (env, nonprofit, token_address, client) = setup_validations();

    client.create_campaign(
        &nonprofit,
        &String::from_str(&env, "Invalid Milestone"),
        &String::from_str(&env, "Desc"),
        &String::from_str(&env, "Loc"),
        &1_000i128,
        &token_address,
        &(env.ledger().timestamp() + 86_400),
        &101u32,
    );
}

#[test]
#[should_panic(expected = "HostError")]
fn test_create_campaign_invalid_token() {
    let (env, nonprofit, _valid_token, client) = setup_validations();
    let invalid_token = Address::generate(&env);

    client.create_campaign(
        &nonprofit,
        &String::from_str(&env, "Invalid Token"),
        &String::from_str(&env, "Desc"),
        &String::from_str(&env, "Loc"),
        &1_000i128,
        &invalid_token,
        &(env.ledger().timestamp() + 86_400),
        &50u32,
    );
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #5)")]
fn test_cancel_non_existent_campaign() {
    let (_env, nonprofit, _token_address, client) = setup_validations();

    client.cancel_campaign(&nonprofit, &999u64);
}
