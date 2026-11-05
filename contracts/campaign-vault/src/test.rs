#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Address, Env,
};

use crate::{CampaignVaultContract, CampaignVaultContractClient};

/// Deploys the vault contract with a dummy campaign registry address.
/// The dummy registry is sufficient for unit tests that do not exercise the
/// cross-contract call (e.g., invalid input validation).
fn setup<'a>() -> (Env, Address, Address, CampaignVaultContractClient<'a>) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = 1_700_000_000);

    let admin = Address::generate(&env);
    let dummy_registry = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_address = env
        .register_stellar_asset_contract_v2(token_admin)
        .address();

    let contract_id = env.register(CampaignVaultContract, (&admin, &dummy_registry));
    let client = CampaignVaultContractClient::new(&env, &contract_id);
    (env, admin, token_address, client)
}

/// Ensures that querying a non-existent vault returns an error.
#[test]
fn test_get_vault_non_existent() {
    let (_env, _admin, _token, client) = setup();
    let result = client.try_get_vault(&999u64);
    assert!(result.is_err());
}

/// Ensures that a zero deposit is rejected before any state mutation.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #11)")]
fn test_deposit_zero_amount_panics() {
    let (env, _admin, _token, client) = setup();
    let donor = Address::generate(&env);
    client.deposit(&999u64, &donor, &0i128);
}

/// Ensures that a negative deposit is rejected.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #11)")]
fn test_deposit_negative_amount_panics() {
    let (env, _admin, _token, client) = setup();
    let donor = Address::generate(&env);
    client.deposit(&999u64, &donor, &(-100i128));
}
