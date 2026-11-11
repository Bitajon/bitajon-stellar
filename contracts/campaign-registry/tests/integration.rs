#![cfg(test)]

use protocol_types::{NonprofitProfile, NonprofitStatus};
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Address, Bytes, Env, String,
};

use campaign_registry::{CampaignRegistryContract, CampaignRegistryContractClient};
use nonprofit_registry::{NonprofitRegistryContract, NonprofitRegistryContractClient};

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

/// Deploys nonprofit-registry + campaign-registry, approves the nonprofit,
/// and returns the campaign-registry client ready to create campaigns.
#[allow(clippy::type_complexity)]
fn setup_approved_nonprofit<'a>() -> (
    Env,
    Address, // admin
    Address, // nonprofit
    Address, // token
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
    let campaign_registry_client =
        CampaignRegistryContractClient::new(&env, &campaign_registry_id);

    let token_admin = Address::generate(&env);
    let token_address = env
        .register_stellar_asset_contract_v2(token_admin)
        .address();

    (
        env,
        admin,
        nonprofit,
        token_address,
        campaign_registry_client,
    )
}

// ===========================================================================
// Happy paths
// ===========================================================================

/// A campaign created with a valid milestone in `1..=90` succeeds.
#[test]
fn test_create_campaign_success() {
    let (env, _admin, nonprofit, token_address, client) = setup_approved_nonprofit();

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
    assert_eq!(campaign.milestone_percentage, 50);
    assert_eq!(campaign.target_amount, 10_000_000_000i128);
    assert_eq!(campaign.deadline, deadline);
}

#[test]
fn test_cancel_campaign() {
    let (env, _admin, nonprofit, token_address, client) = setup_approved_nonprofit();

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
    assert_eq!(campaign.status, campaign_registry_contract_status_cancelled());
}

/// Helper to compare against `CampaignStatus::Cancelled` without importing
/// the enum in every test.
fn campaign_registry_contract_status_cancelled() -> protocol_types::CampaignStatus {
    protocol_types::CampaignStatus::Cancelled
}

#[test]
fn test_multiple_campaigns_increment_id() {
    let (env, _admin, nonprofit, token_address, client) = setup_approved_nonprofit();

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

// ===========================================================================
// Authorization
// ===========================================================================

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

    // Register but do NOT approve.
    let np_registry_id = env.register(NonprofitRegistryContract, (&admin,));
    let np_registry_client = NonprofitRegistryContractClient::new(&env, &np_registry_id);
    let profile = create_mock_profile(&env);
    np_registry_client.register_nonprofit(&nonprofit, &profile);

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
#[should_panic(expected = "HostError: Error(Contract, #1)")]
fn test_cancel_campaign_unauthorized() {
    let (env, _admin, nonprofit, token_address, client) = setup_approved_nonprofit();
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
    let (env, _admin, nonprofit, token_address, client) = setup_approved_nonprofit();

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

// ===========================================================================
// Milestone validation (Opción C: required, 1..=90)
// ===========================================================================

/// `milestone_percentage = 0` is now rejected. There is no silent default.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #13)")]
fn test_create_campaign_zero_milestone_panics() {
    let (env, _admin, nonprofit, token_address, client) = setup_approved_nonprofit();

    client.create_campaign(
        &nonprofit,
        &String::from_str(&env, "Zero Milestone"),
        &String::from_str(&env, "Desc"),
        &String::from_str(&env, "Loc"),
        &1_000i128,
        &token_address,
        &(env.ledger().timestamp() + 86_400),
        &0u32,
    );
}

/// `milestone_percentage = 91` is rejected (above the 90% cap).
///
/// The 90% cap preserves at least 10% of the target tied to evidence
/// validation.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #13)")]
fn test_create_campaign_milestone_above_max_panics() {
    let (env, _admin, nonprofit, token_address, client) = setup_approved_nonprofit();

    client.create_campaign(
        &nonprofit,
        &String::from_str(&env, "Over Max"),
        &String::from_str(&env, "Desc"),
        &String::from_str(&env, "Loc"),
        &1_000i128,
        &token_address,
        &(env.ledger().timestamp() + 86_400),
        &91u32,
    );
}

/// `milestone_percentage = 100` is rejected (would leave no funds tied to
/// evidence).
#[test]
#[should_panic(expected = "HostError: Error(Contract, #13)")]
fn test_create_campaign_milestone_100_panics() {
    let (env, _admin, nonprofit, token_address, client) = setup_approved_nonprofit();

    client.create_campaign(
        &nonprofit,
        &String::from_str(&env, "100 Percent"),
        &String::from_str(&env, "Desc"),
        &String::from_str(&env, "Loc"),
        &1_000i128,
        &token_address,
        &(env.ledger().timestamp() + 86_400),
        &100u32,
    );
}

/// Boundary: `milestone_percentage = 90` is accepted.
#[test]
fn test_create_campaign_milestone_at_max_succeeds() {
    let (env, _admin, nonprofit, token_address, client) = setup_approved_nonprofit();

    let campaign_id = client.create_campaign(
        &nonprofit,
        &String::from_str(&env, "At Max"),
        &String::from_str(&env, "Desc"),
        &String::from_str(&env, "Loc"),
        &1_000i128,
        &token_address,
        &(env.ledger().timestamp() + 86_400),
        &90u32,
    );

    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(campaign.milestone_percentage, 90);
}

/// Boundary: `milestone_percentage = 1` is accepted.
#[test]
fn test_create_campaign_milestone_at_min_succeeds() {
    let (env, _admin, nonprofit, token_address, client) = setup_approved_nonprofit();

    let campaign_id = client.create_campaign(
        &nonprofit,
        &String::from_str(&env, "At Min"),
        &String::from_str(&env, "Desc"),
        &String::from_str(&env, "Loc"),
        &1_000i128,
        &token_address,
        &(env.ledger().timestamp() + 86_400),
        &1u32,
    );

    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(campaign.milestone_percentage, 1);
}
