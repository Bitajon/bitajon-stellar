#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Address, Bytes, Env, String,
};
use thriving_types::{NonprofitProfile, NonprofitStatus};

use campaign_registry::{CampaignRegistryContract, CampaignRegistryContractClient};
use campaign_vault::{CampaignVaultContract, CampaignVaultContractClient};
use donation_router::{DonationRouterContract, DonationRouterContractClient};
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

/// Deploys the full stack including the donation router.
fn setup_full_stack<'a>(
    fee_bps: u32,
) -> (
    Env,
    Address, // admin
    Address, // nonprofit
    Address, // treasury
    Address, // token
    u64,     // campaign_id
    CampaignVaultContractClient<'a>,
    DonationRouterContractClient<'a>,
) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = 1_700_000_000);

    let admin = Address::generate(&env);
    let nonprofit = Address::generate(&env);
    let treasury = Address::generate(&env);

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

    let campaign_id = campaign_registry_client.create_campaign(
        &nonprofit,
        &String::from_str(&env, "Comedor Comunitario"),
        &String::from_str(&env, "Construcción de comedor"),
        &String::from_str(&env, "Suba, Bogotá"),
        &10_000i128,
        &token_address,
        &(env.ledger().timestamp() + 30 * 86_400),
        &50u32,
    );

    let vault_id = env.register(CampaignVaultContract, (&admin, &campaign_registry_id));
    let vault_client = CampaignVaultContractClient::new(&env, &vault_id);
    vault_client.create_vault(&campaign_id, &nonprofit);

    let router_id = env.register(
        DonationRouterContract,
        (&admin, &treasury, &vault_id, fee_bps),
    );
    let router_client = DonationRouterContractClient::new(&env, &router_id);

    (
        env,
        admin,
        nonprofit,
        treasury,
        token_address,
        campaign_id,
        vault_client,
        router_client,
    )
}

// ---------------------------------------------------------------------------
// Happy paths
// ---------------------------------------------------------------------------

/// With fee = 0, the full gross amount reaches the vault.
#[test]
fn test_donate_zero_fee_full_amount_to_vault() {
    let (env, _admin, _nonprofit, treasury, token_address, campaign_id, vault_client, router) =
        setup_full_stack(0);

    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &10_000i128);

    router.donate(&campaign_id, &donor, &10_000i128);

    let vault = vault_client.get_vault(&campaign_id);
    assert_eq!(vault.total_deposited, 10_000);

    let token_client = soroban_sdk::token::Client::new(&env, &token_address);
    assert_eq!(token_client.balance(&treasury), 0);
    assert_eq!(token_client.balance(&_nonprofit), 5_000); // initial release
}

/// With fee = 200 bps (2%), the treasury receives 2% and the vault 98%.
#[test]
fn test_donate_with_fee_splits_correctly() {
    let (env, _admin, _nonprofit, treasury, token_address, campaign_id, vault_client, router) =
        setup_full_stack(200);

    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &10_000i128);

    // Donate 5_000 gross: fee 100, net 4_900.
    router.donate(&campaign_id, &donor, &5_000i128);

    let token_client = soroban_sdk::token::Client::new(&env, &token_address);
    assert_eq!(token_client.balance(&treasury), 100);

    let vault = vault_client.get_vault(&campaign_id);
    assert_eq!(vault.total_deposited, 4_900);
}

/// With fee = 200, the campaign's target must be reached in **net** terms.
/// The donor must pay slightly more than the target to trigger the release.
#[test]
fn test_target_reached_in_net_terms_with_fee() {
    let (env, _admin, nonprofit, treasury, token_address, campaign_id, vault_client, router) =
        setup_full_stack(200);

    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    // To reach 10_000 net with 2% fee, donor must pay 10_204 gross:
    //   fee = 10_204 * 200 / 10_000 = 204
    //   net = 10_204 - 204 = 10_000 (exact)
    token_admin.mint(&donor, &20_000i128);

    router.donate(&campaign_id, &donor, &10_204i128);

    let vault = vault_client.get_vault(&campaign_id);
    assert_eq!(vault.total_deposited, 10_000);
    assert!(vault.initial_release_done);

    let token_client = soroban_sdk::token::Client::new(&env, &token_address);
    assert_eq!(token_client.balance(&treasury), 204);
    assert_eq!(token_client.balance(&nonprofit), 5_000); // 50% of 10_000
}

/// Full E2E: donate through router, submit evidence, release final.
#[test]
fn test_full_flow_with_router() {
    let (env, admin, nonprofit, treasury, token_address, campaign_id, vault_client, router) =
        setup_full_stack(200);

    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &10_204i128);

    router.donate(&campaign_id, &donor, &10_204i128);

    let token_client = soroban_sdk::token::Client::new(&env, &token_address);
    assert_eq!(token_client.balance(&treasury), 204);

    let evidence_hash = Bytes::from_slice(&env, b"QmEvidence");
    vault_client.submit_evidence(&campaign_id, &nonprofit, &evidence_hash);
    vault_client.release_final(&campaign_id, &admin);

    // Nonprofit received initial (5_000) + final (10_000 - 5_000 = 5_000) = 10_000
    assert_eq!(token_client.balance(&nonprofit), 10_000);
    assert_eq!(token_client.balance(&treasury), 204);
}

// ---------------------------------------------------------------------------
// Error propagation
// ---------------------------------------------------------------------------

/// Vault error propagates when campaign does not exist.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #5)")]
fn test_donate_non_existent_campaign() {
    let (env, _admin, _nonprofit, _treasury, token_address, _campaign_id, _vault, router) =
        setup_full_stack(0);
    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &1_000i128);

    router.donate(&999u64, &donor, &1_000i128);
}

/// Vault error propagates when the campaign has expired.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #22)")]
fn test_donate_expired_campaign() {
    let (env, _admin, _nonprofit, _treasury, token_address, campaign_id, _vault, router) =
        setup_full_stack(0);
    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &1_000i128);

    env.ledger()
        .with_mut(|li| li.timestamp += 31 * 86_400);

    router.donate(&campaign_id, &donor, &1_000i128);
}

/// Vault rejects deposits exceeding the target, propagated through the router.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #19)")]
fn test_donate_exceeds_target() {
    let (env, _admin, _nonprofit, _treasury, token_address, campaign_id, _vault, router) =
        setup_full_stack(0);
    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &20_000i128);

    router.donate(&campaign_id, &donor, &15_000i128);
}

// ---------------------------------------------------------------------------
// Admin and configuration
// ---------------------------------------------------------------------------

#[test]
fn test_update_fee_bps_via_router() {
    let (_env, admin, _nonprofit, _treasury, _token, _campaign_id, _vault, router) =
        setup_full_stack(0);

    router.update_fee_bps(&admin, &300u32);
    assert_eq!(router.get_fee_bps(), 300);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #1)")]
fn test_update_fee_bps_not_admin_via_router() {
    let (env, _admin, _nonprofit, _treasury, _token, _campaign_id, _vault, router) =
        setup_full_stack(0);
    let attacker = Address::generate(&env);

    router.update_fee_bps(&attacker, &300u32);
}

/// After updating the fee, subsequent donations use the new rate.
#[test]
fn test_fee_update_affects_subsequent_donations() {
    let (env, admin, _nonprofit, treasury, token_address, campaign_id, vault_client, router) =
        setup_full_stack(0);

    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &10_000i128);

    router.donate(&campaign_id, &donor, &1_000i128);
    let token_client = soroban_sdk::token::Client::new(&env, &token_address);
    assert_eq!(token_client.balance(&treasury), 0);

    router.update_fee_bps(&admin, &500u32); // 5%

    router.donate(&campaign_id, &donor, &1_000i128);
    assert_eq!(token_client.balance(&treasury), 50);

    let vault = vault_client.get_vault(&campaign_id);
    assert_eq!(vault.total_deposited, 1_950); // 1_000 + 950
}

// ---------------------------------------------------------------------------
// Router bypass protection (vault configured with authorized_router)
// ---------------------------------------------------------------------------

/// Ensures that when the vault is configured with this router as its
/// authorized invoker, `router.donate()` works transparently. The router's
/// authorization is implicitly granted because it is the direct caller of
/// `vault.deposit`.
#[test]
fn test_donate_works_when_router_is_authorized_in_vault() {
    let (env, admin, _nonprofit, treasury, token_address, campaign_id, vault_client, router) =
        setup_full_stack(200);

    // Configure the vault to only accept deposits from this router.
    let router_id = router.address.clone();
    vault_client.set_authorized_router(&admin, &Some(router_id));

    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &10_000i128);

    // Full flow: donor → router → vault.
    router.donate(&campaign_id, &donor, &5_000i128);

    let token_client = soroban_sdk::token::Client::new(&env, &token_address);
    assert_eq!(token_client.balance(&treasury), 100);

    let vault = vault_client.get_vault(&campaign_id);
    assert_eq!(vault.total_deposited, 4_900);
}
