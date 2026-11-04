#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Address, Bytes, Env, String,
};
use thriving_types::{
    CampaignStatus, NonprofitProfile, NonprofitStatus, DEFAULT_MILESTONE_PERCENTAGE,
};

use campaign_registry::{CampaignRegistryContract, CampaignRegistryContractClient};
use nonprofit_registry::{NonprofitRegistryContract, NonprofitRegistryContractClient};

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

/// Deploys both contracts, registers and approves a nonprofit, and returns
/// a mock Stellar Asset Contract as the donation token.
fn setup_full_env<'a>() -> (
    Env,
    Address, // Admin
    Address, // Nonprofit
    Address, // Token
    CampaignRegistryContractClient<'a>,
) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = 1_700_000_000);

    let admin = Address::generate(&env);
    let nonprofit = Address::generate(&env);

    let np_registry_id = env.register(NonprofitRegistryContract, (&admin,));
    let np_registry_client = NonprofitRegistryContractClient::new(&env, &np_registry_id);

    let profile = create_mock_profile(&env);
    np_registry_client.register_nonprofit(&nonprofit, &profile);
    np_registry_client.approve_nonprofit(&admin, &nonprofit);

    let campaign_registry_id =
        env.register(CampaignRegistryContract, (&admin, &np_registry_id));
    let client = CampaignRegistryContractClient::new(&env, &campaign_registry_id);

    let token_admin = Address::generate(&env);
    let token_address = env
        .register_stellar_asset_contract_v2(token_admin)
        .address();

    (env, admin, nonprofit, token_address, client)
}

#[test]
fn test_create_campaign_success() {
    let (env, _admin, nonprofit, token_address, client) = setup_full_env();

    let deadline = env.ledger().timestamp() + 30 * 86_400;

    let campaign_id = client.create_campaign(
        &nonprofit,
        &String::from_str(&env, "Comedor Comunitario"),
        &String::from_str(&env, "Construcción de comedor"),
        &String::from_str(&env, "Suba, Bogotá"),
        &10_000_000_000i128,
        &token_address,
        &deadline,
        &50u32,
    );

    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(campaign.nonprofit, nonprofit);
    assert_eq!(campaign.status, CampaignStatus::Active);
    assert_eq!(campaign.milestone_percentage, 50);
    assert_eq!(campaign.target_amount, 10_000_000_000i128);
    assert_eq!(campaign.deadline, deadline);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #3)")]
fn test_create_campaign_unapproved_nonprofit() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = 1_700_000_000);

    let admin = Address::generate(&env);
    let nonprofit = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_address = env
        .register_stellar_asset_contract_v2(token_admin)
        .address();

    let np_registry_id = env.register(NonprofitRegistryContract, (&admin,));
    let np_registry_client = NonprofitRegistryContractClient::new(&env, &np_registry_id);
    let profile = create_mock_profile(&env);
    np_registry_client.register_nonprofit(&nonprofit, &profile);
    // Deliberately skip approve_nonprofit.

    let campaign_registry_id =
        env.register(CampaignRegistryContract, (&admin, &np_registry_id));
    let client = CampaignRegistryContractClient::new(&env, &campaign_registry_id);

    client.create_campaign(
        &nonprofit,
        &String::from_str(&env, "Unauthorized"),
        &String::from_str(&env, "Desc"),
        &String::from_str(&env, "Loc"),
        &1_000i128,
        &token_address,
        &(env.ledger().timestamp() + 86_400),
        &50u32,
    );
}

#[test]
fn test_cancel_campaign() {
    let (env, _admin, nonprofit, token_address, client) = setup_full_env();

    let campaign_id = client.create_campaign(
        &nonprofit,
        &String::from_str(&env, "To Cancel"),
        &String::from_str(&env, "Desc"),
        &String::from_str(&env, "Loc"),
        &1_000i128,
        &token_address,
        &(env.ledger().timestamp() + 86_400),
        &50u32,
    );

    client.cancel_campaign(&nonprofit, &campaign_id);

    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(campaign.status, CampaignStatus::Cancelled);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #1)")]
fn test_cancel_campaign_unauthorized() {
    let (env, _admin, nonprofit, token_address, client) = setup_full_env();
    let attacker = Address::generate(&env);

    let campaign_id = client.create_campaign(
        &nonprofit,
        &String::from_str(&env, "Target"),
        &String::from_str(&env, "Desc"),
        &String::from_str(&env, "Loc"),
        &1_000i128,
        &token_address,
        &(env.ledger().timestamp() + 86_400),
        &50u32,
    );

    client.cancel_campaign(&attacker, &campaign_id);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_cancel_already_cancelled_campaign() {
    let (env, _admin, nonprofit, token_address, client) = setup_full_env();

    let campaign_id = client.create_campaign(
        &nonprofit,
        &String::from_str(&env, "Double Cancel"),
        &String::from_str(&env, "Desc"),
        &String::from_str(&env, "Loc"),
        &1_000i128,
        &token_address,
        &(env.ledger().timestamp() + 86_400),
        &50u32,
    );

    client.cancel_campaign(&nonprofit, &campaign_id);
    client.cancel_campaign(&nonprofit, &campaign_id);
}

#[test]
fn test_create_campaign_default_milestone() {
    let (env, _admin, nonprofit, token_address, client) = setup_full_env();

    let campaign_id = client.create_campaign(
        &nonprofit,
        &String::from_str(&env, "Default Milestone"),
        &String::from_str(&env, "Desc"),
        &String::from_str(&env, "Loc"),
        &1_000i128,
        &token_address,
        &(env.ledger().timestamp() + 86_400),
        &0u32,
    );

    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(
        campaign.milestone_percentage,
        DEFAULT_MILESTONE_PERCENTAGE
    );
}

#[test]
fn test_multiple_campaigns_increment_id() {
    let (env, _admin, nonprofit, token_address, client) = setup_full_env();

    let first = client.create_campaign(
        &nonprofit,
        &String::from_str(&env, "First"),
        &String::from_str(&env, "Desc"),
        &String::from_str(&env, "Loc"),
        &1_000i128,
        &token_address,
        &(env.ledger().timestamp() + 86_400),
        &50u32,
    );

    let second = client.create_campaign(
        &nonprofit,
        &String::from_str(&env, "Second"),
        &String::from_str(&env, "Desc"),
        &String::from_str(&env, "Loc"),
        &1_000i128,
        &token_address,
        &(env.ledger().timestamp() + 86_400),
        &50u32,
    );

    assert_eq!(first, 1);
    assert_eq!(second, 2);
}
