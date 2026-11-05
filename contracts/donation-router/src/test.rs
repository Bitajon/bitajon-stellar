#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env};

use crate::{DonationRouterContract, DonationRouterContractClient};

/// Deploys the router with a dummy vault address for constructor validation.
fn setup<'a>(
    fee_bps: u32,
) -> (
    Env,
    Address, // admin
    Address, // treasury
    DonationRouterContractClient<'a>,
) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let dummy_vault = Address::generate(&env);

    let contract_id = env.register(
        DonationRouterContract,
        (&admin, &treasury, &dummy_vault, fee_bps),
    );
    let client = DonationRouterContractClient::new(&env, &contract_id);
    (env, admin, treasury, client)
}

#[test]
fn test_constructor_stores_config() {
    let (_env, _admin, treasury, client) = setup(200);
    assert_eq!(client.get_fee_bps(), 200);
    assert_eq!(client.get_treasury(), treasury);
}

/// Ensures the constructor rejects a fee above `MAX_FEE_BPS` (1000).
/// The panic message is wrapped by `env.register` as
/// `HostError: Error(Context, InvalidAction)`, so we assert the panic
/// occurs without matching the exact error discriminant.
#[test]
#[should_panic]
fn test_constructor_rejects_excessive_fee() {
    let _ = setup(1001); // MAX_FEE_BPS = 1000
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #11)")]
fn test_donate_zero_amount_panics() {
    let (env, _admin, _treasury, client) = setup(0);
    let donor = Address::generate(&env);
    client.donate(&1u64, &donor, &0i128);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #11)")]
fn test_donate_negative_amount_panics() {
    let (env, _admin, _treasury, client) = setup(0);
    let donor = Address::generate(&env);
    client.donate(&1u64, &donor, &(-100i128));
}

#[test]
fn test_quote_zero_fee() {
    let (_env, _admin, _treasury, client) = setup(0);
    let quote = client.quote(&10_000i128);
    assert_eq!(quote.gross_amount, 10_000);
    assert_eq!(quote.fee_amount, 0);
    assert_eq!(quote.net_amount, 10_000);
}

#[test]
fn test_quote_with_fee() {
    let (_env, _admin, _treasury, client) = setup(200); // 2%
    let quote = client.quote(&10_000i128);
    assert_eq!(quote.gross_amount, 10_000);
    assert_eq!(quote.fee_amount, 200);
    assert_eq!(quote.net_amount, 9_800);
}

#[test]
fn test_quote_rounds_down() {
    let (_env, _admin, _treasury, client) = setup(200);
    // 1 * 200 / 10000 = 0 (integer division)
    let quote = client.quote(&1i128);
    assert_eq!(quote.fee_amount, 0);
    assert_eq!(quote.net_amount, 1);
}

#[test]
fn test_quote_max_fee() {
    let (_env, _admin, _treasury, client) = setup(1000); // 10%
    let quote = client.quote(&10_000i128);
    assert_eq!(quote.fee_amount, 1_000);
    assert_eq!(quote.net_amount, 9_000);
}

#[test]
fn test_update_fee_bps() {
    let (_env, admin, _treasury, client) = setup(0);
    client.update_fee_bps(&admin, &300u32);
    assert_eq!(client.get_fee_bps(), 300);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #25)")]
fn test_update_fee_bps_exceeds_max() {
    let (_env, admin, _treasury, client) = setup(0);
    client.update_fee_bps(&admin, &1001u32);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #1)")]
fn test_update_fee_bps_not_admin() {
    let (env, _admin, _treasury, client) = setup(0);
    let attacker = Address::generate(&env);
    client.update_fee_bps(&attacker, &300u32);
}

#[test]
fn test_update_treasury() {
    let (env, admin, _treasury, client) = setup(0);
    let new_treasury = Address::generate(&env);
    client.update_treasury(&admin, &new_treasury);
    assert_eq!(client.get_treasury(), new_treasury);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #1)")]
fn test_update_treasury_not_admin() {
    let (env, _admin, _treasury, client) = setup(0);
    let attacker = Address::generate(&env);
    let new_treasury = Address::generate(&env);
    client.update_treasury(&attacker, &new_treasury);
}
