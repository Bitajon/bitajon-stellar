#![cfg(test)]

use protocol_types::{NonprofitProfile, NonprofitStatus};
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Address, Bytes, Env, String,
};

use campaign_registry::{CampaignRegistryContract, CampaignRegistryContractClient};
use campaign_vault::{CampaignVaultContract, CampaignVaultContractClient};
use donation_router::{DonationRouterContract, DonationRouterContractClient};
use nonprofit_registry::{NonprofitRegistryContract, NonprofitRegistryContractClient};

/// Builds a minimal valid nonprofit profile for tests.
///
/// `email_hash` and `rut_hash` are opaque byte strings; the contract does not
/// interpret them. In production these are SHA-256 hashes of the off-chain
/// documents (privacy compliance: Ley 1581 de 2012).
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

/// Deploys the full stack (nonprofit-registry, campaign-registry,
/// campaign-vault, donation-router) and returns all handles needed by tests.
///
/// The campaign is created with `milestone_percentage` as configured by the
/// caller, so tests can exercise custom milestone configurations.
#[allow(clippy::type_complexity)]
fn setup_full_stack<'a>(
    fee_bps: u32,
    milestone_percentage: u32,
) -> (
    Env,
    Address, // admin
    Address, // nonprofit
    Address, // verifier
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
    let verifier = Address::generate(&env);
    let treasury = Address::generate(&env);

    // --- Nonprofit registry ---
    let np_registry_id = env.register(NonprofitRegistryContract, (&admin,));
    let np_registry_client = NonprofitRegistryContractClient::new(&env, &np_registry_id);
    let profile = create_mock_profile(&env);
    np_registry_client.register_nonprofit(&nonprofit, &profile);
    np_registry_client.approve_nonprofit(&admin, &nonprofit);

    // --- Campaign registry ---
    let campaign_registry_id =
        env.register(CampaignRegistryContract, (&admin, &np_registry_id));
    let campaign_registry_client =
        CampaignRegistryContractClient::new(&env, &campaign_registry_id);

    // --- Token (SEP-41 SAC) ---
    let token_admin = Address::generate(&env);
    let token_address = env
        .register_stellar_asset_contract_v2(token_admin)
        .address();

    // --- Create campaign ---
    let campaign_id = campaign_registry_client.create_campaign(
        &nonprofit,
        &String::from_str(&env, "Comedor Comunitario"),
        &String::from_str(&env, "Construcción de comedor"),
        &String::from_str(&env, "Suba, Bogotá"),
        &10_000i128,
        &token_address,
        &(env.ledger().timestamp() + 30 * 86_400),
        &milestone_percentage,
    );

    // --- Vault ---
    let vault_id = env.register(CampaignVaultContract, (&admin, &campaign_registry_id));
    let vault_client = CampaignVaultContractClient::new(&env, &vault_id);
    vault_client.create_vault(&campaign_id, &nonprofit, &verifier);

    // --- Router ---
    let router_id = env.register(
        DonationRouterContract,
        (&admin, &treasury, &vault_id, fee_bps),
    );
    let router_client = DonationRouterContractClient::new(&env, &router_id);

    (
        env,
        admin,
        nonprofit,
        verifier,
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

/// With fee = 0, the full gross amount reaches the vault and triggers the
/// default 50% milestone release to the nonprofit.
#[test]
fn test_donate_zero_fee_full_amount_to_vault() {
    let (env, _admin, nonprofit, _verifier, treasury, token_address, campaign_id, vault_client, router) =
        setup_full_stack(0, 50);

    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    let token_client = soroban_sdk::token::Client::new(&env, &token_address);
    token_admin.mint(&donor, &10_000i128);

    router.donate(&campaign_id, &donor, &10_000i128);

    let vault = vault_client.get_vault(&campaign_id);
    assert_eq!(vault.total_deposited, 10_000);
    assert_eq!(token_client.balance(&treasury), 0);
    assert_eq!(token_client.balance(&nonprofit), 5_000);
}

/// With fee = 200 bps (2%), the treasury receives 2% and the vault 98%.
#[test]
fn test_donate_with_fee_splits_correctly() {
    let (env, _admin, _nonprofit, _verifier, treasury, token_address, campaign_id, vault_client, router) =
        setup_full_stack(200, 50);

    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    let token_client = soroban_sdk::token::Client::new(&env, &token_address);
    token_admin.mint(&donor, &10_000i128);

    // Donate 5_000 gross: fee 100, net 4_900.
    router.donate(&campaign_id, &donor, &5_000i128);

    assert_eq!(token_client.balance(&treasury), 100);
    assert_eq!(vault_client.get_vault(&campaign_id).total_deposited, 4_900);
}

/// With fee = 200, the campaign's target must be reached in **net** terms.
/// The donor must pay slightly more than the target to trigger the release.
#[test]
fn test_target_reached_in_net_terms_with_fee() {
    let (env, _admin, nonprofit, _verifier, treasury, token_address, campaign_id, vault_client, router) =
        setup_full_stack(200, 50);

    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    let token_client = soroban_sdk::token::Client::new(&env, &token_address);
    // To reach 10_000 net with 2% fee, donor must pay 10_204 gross:
    //   fee = 10_204 * 200 / 10_000 = 204
    //   net = 10_204 - 204 = 10_000 (exact)
    token_admin.mint(&donor, &20_000i128);

    router.donate(&campaign_id, &donor, &10_204i128);

    let vault = vault_client.get_vault(&campaign_id);
    assert_eq!(vault.total_deposited, 10_000);
    assert!(vault.initial_release_done);

    assert_eq!(token_client.balance(&treasury), 204);
    assert_eq!(token_client.balance(&nonprofit), 5_000);
}

/// Full E2E: donate through router → initial release → evidence → final release.
///
/// Uses the new `release_final(campaign_id, verifier, expected_evidence)`
/// signature, which requires the verifier to pass the exact evidence hash
/// they reviewed (TOCTOU protection, H3).
#[test]
fn test_full_flow_with_router() {
    let (env, _admin, nonprofit, verifier, treasury, token_address, campaign_id, vault_client, router) =
        setup_full_stack(200, 50);

    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    let token_client = soroban_sdk::token::Client::new(&env, &token_address);
    token_admin.mint(&donor, &10_204i128);

    router.donate(&campaign_id, &donor, &10_204i128);
    assert_eq!(token_client.balance(&treasury), 204);

    let evidence_hash = Bytes::from_slice(&env, b"QmEvidence");
    vault_client.submit_evidence(&campaign_id, &nonprofit, &evidence_hash);
    vault_client.release_final(&campaign_id, &verifier, &evidence_hash);

    // Nonprofit received initial (5_000) + final (10_000 - 5_000 = 5_000).
    assert_eq!(token_client.balance(&nonprofit), 10_000);
    assert_eq!(token_client.balance(&treasury), 204);
}

// ---------------------------------------------------------------------------
// Error propagation from the vault
// ---------------------------------------------------------------------------

/// Vault error propagates when campaign does not exist.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #5)")]
fn test_donate_non_existent_campaign() {
    let (env, _admin, _nonprofit, _verifier, _treasury, token_address, _campaign_id, _vault, router) =
        setup_full_stack(0, 50);
    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &1_000i128);

    router.donate(&999u64, &donor, &1_000i128);
}

/// Vault error propagates when the campaign has expired.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #22)")]
fn test_donate_expired_campaign() {
    let (env, _admin, _nonprofit, _verifier, _treasury, token_address, campaign_id, _vault, router) =
        setup_full_stack(0, 50);
    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &1_000i128);

    env.ledger().with_mut(|li| li.timestamp += 31 * 86_400);

    router.donate(&campaign_id, &donor, &1_000i128);
}

/// Vault rejects deposits exceeding the target, propagated through the router.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #19)")]
fn test_donate_exceeds_target() {
    let (env, _admin, _nonprofit, _verifier, _treasury, token_address, campaign_id, _vault, router) =
        setup_full_stack(0, 50);
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
    let (_env, admin, _nonprofit, _verifier, _treasury, _token, _campaign_id, _vault, router) =
        setup_full_stack(0, 50);

    router.update_fee_bps(&admin, &300u32);
    assert_eq!(router.get_fee_bps(), 300);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #1)")]
fn test_update_fee_bps_not_admin_via_router() {
    let (env, _admin, _nonprofit, _verifier, _treasury, _token, _campaign_id, _vault, router) =
        setup_full_stack(0, 50);
    let attacker = Address::generate(&env);

    router.update_fee_bps(&attacker, &300u32);
}

/// After updating the fee, subsequent donations use the new rate.
#[test]
fn test_fee_update_affects_subsequent_donations() {
    let (env, admin, _nonprofit, _verifier, treasury, token_address, campaign_id, vault_client, router) =
        setup_full_stack(0, 50);

    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    let token_client = soroban_sdk::token::Client::new(&env, &token_address);
    token_admin.mint(&donor, &10_000i128);

    router.donate(&campaign_id, &donor, &1_000i128);
    assert_eq!(token_client.balance(&treasury), 0);

    router.update_fee_bps(&admin, &500u32); // 5%

    router.donate(&campaign_id, &donor, &1_000i128);
    assert_eq!(token_client.balance(&treasury), 50);

    assert_eq!(vault_client.get_vault(&campaign_id).total_deposited, 1_950);
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
    let (env, admin, _nonprofit, _verifier, treasury, token_address, campaign_id, vault_client, router) =
        setup_full_stack(200, 50);

    // Configure the vault to only accept deposits from this router.
    let router_id = router.address.clone();
    vault_client.set_authorized_router(&admin, &Some(router_id));

    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    let token_client = soroban_sdk::token::Client::new(&env, &token_address);
    token_admin.mint(&donor, &10_000i128);

    // Full flow: donor → router → vault.
    router.donate(&campaign_id, &donor, &5_000i128);

    assert_eq!(token_client.balance(&treasury), 100);
    assert_eq!(vault_client.get_vault(&campaign_id).total_deposited, 4_900);
}

// ---------------------------------------------------------------------------
// H1 — Refund when the campaign expires without reaching the target
// ---------------------------------------------------------------------------

/// Verifies that a donor can reclaim their net contribution after the
/// campaign expires without reaching the target (H1 fix).
///
/// The contribution is tracked per (campaign, donor) pair in the vault and
/// is zeroed before the transfer (CEI).
#[test]
fn test_claim_refund_after_expiry() {
    let (env, _admin, _nonprofit, _verifier, _treasury, token_address, campaign_id, vault_client, router) =
        setup_full_stack(0, 50);

    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    let token_client = soroban_sdk::token::Client::new(&env, &token_address);
    token_admin.mint(&donor, &5_000i128);

    // Partial deposit: target not reached, no initial release.
    router.donate(&campaign_id, &donor, &5_000i128);
    assert_eq!(token_client.balance(&donor), 0);
    assert!(!vault_client.get_vault(&campaign_id).initial_release_done);

    // Advance past the campaign deadline (created at now + 30 days).
    let new_ts = env.ledger().timestamp() + 31 * 86_400;
    env.ledger().with_mut(|li| li.timestamp = new_ts);

    // Donor claims refund directly from the vault (not through the router).
    vault_client.claim_refund(&campaign_id, &donor);

    assert_eq!(token_client.balance(&donor), 5_000);
}

/// A donor cannot claim a refund after the initial milestone has been
/// released, even if they later want to withdraw.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #27)")]
fn test_claim_refund_blocked_after_initial_release() {
    let (env, _admin, _nonprofit, _verifier, _treasury, token_address, campaign_id, vault_client, router) =
        setup_full_stack(0, 50);

    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &10_000i128);

    // Full deposit: target reached, initial release executed.
    router.donate(&campaign_id, &donor, &10_000i128);

    // Advance past deadline to make the campaign technically expired.
    let new_ts = env.ledger().timestamp() + 31 * 86_400;
    env.ledger().with_mut(|li| li.timestamp = new_ts);

    // Refund must fail because `initial_release_done == true`.
    vault_client.claim_refund(&campaign_id, &donor);
}

// ---------------------------------------------------------------------------
// H2 — Custom milestone percentage is respected
// ---------------------------------------------------------------------------

/// A campaign created with `milestone_percentage = 30` releases 30% (not the
/// default 50%) when the target is reached (H2 fix).
#[test]
fn test_custom_milestone_percentage_respected() {
    let (env, _admin, nonprofit, _verifier, _treasury, token_address, campaign_id, _vault_client, router) =
        setup_full_stack(0, 30);

    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    let token_client = soroban_sdk::token::Client::new(&env, &token_address);
    token_admin.mint(&donor, &10_000i128);

    router.donate(&campaign_id, &donor, &10_000i128);

    // 30% of 10_000 = 3_000, not the default 5_000.
    assert_eq!(token_client.balance(&nonprofit), 3_000);
}

// ---------------------------------------------------------------------------
// H3 — TOCTOU protection on evidence hash
// ---------------------------------------------------------------------------

/// The verifier must pass the exact evidence hash they reviewed. If the
/// nonprofit changed the evidence between review and release, the call must
/// fail with `InvalidEvidenceHash` (H3 fix).
#[test]
#[should_panic(expected = "HostError: Error(Contract, #29)")]
fn test_release_final_rejects_wrong_evidence() {
    let (env, _admin, nonprofit, verifier, _treasury, token_address, campaign_id, vault_client, router) =
        setup_full_stack(0, 50);

    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &10_000i128);

    router.donate(&campaign_id, &donor, &10_000i128);

    // Nonprofit submits one evidence hash.
    let submitted = Bytes::from_slice(&env, b"QmSubmitted");
    vault_client.submit_evidence(&campaign_id, &nonprofit, &submitted);

    // Verifier tries to release with a different hash → mismatch.
    let wrong = Bytes::from_slice(&env, b"QmWrong");
    vault_client.release_final(&campaign_id, &verifier, &wrong);
}

// ---------------------------------------------------------------------------
// H4 — Emergency pause blocks deposits
// ---------------------------------------------------------------------------

/// When the admin pauses a vault, the router's `donate` call must fail with
/// `VaultPaused` (H4 fix). The error propagates from the vault unchanged.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #32)")]
fn test_donate_blocked_when_vault_paused() {
    let (env, admin, _nonprofit, _verifier, _treasury, token_address, campaign_id, vault_client, router) =
        setup_full_stack(0, 50);

    vault_client.pause_vault(&admin, &campaign_id);

    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &1_000i128);

    router.donate(&campaign_id, &donor, &1_000i128);
}
