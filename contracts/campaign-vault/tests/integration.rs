#![cfg(test)]

use protocol_types::{NonprofitProfile, NonprofitStatus};
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Address, Bytes, Env, String,
};

use campaign_registry::{CampaignRegistryContract, CampaignRegistryContractClient};
use campaign_vault::{CampaignVaultContract, CampaignVaultContractClient};
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

/// Deploys the full ecosystem and returns all handles needed by tests.
/// Campaign is created with the default 50% milestone.
#[allow(clippy::type_complexity)]
fn setup_full_ecosystem<'a>() -> (
    Env,
    Address, // admin
    Address, // nonprofit
    Address, // verifier
    Address, // token
    Address, // campaign_registry_id
    u64,     // campaign_id
    CampaignVaultContractClient<'a>,
) {
    setup_full_ecosystem_with_milestone(50)
}

/// Same as `setup_full_ecosystem` but allows specifying a custom milestone.
#[allow(clippy::type_complexity)]
fn setup_full_ecosystem_with_milestone<'a>(
    milestone_percentage: u32,
) -> (
    Env,
    Address,
    Address,
    Address,
    Address,
    Address,
    u64,
    CampaignVaultContractClient<'a>,
) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = 1_700_000_000);

    let admin = Address::generate(&env);
    let nonprofit = Address::generate(&env);
    let verifier = Address::generate(&env);

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
        &milestone_percentage,
    );

    let vault_id = env.register(CampaignVaultContract, (&admin, &campaign_registry_id));
    let vault_client = CampaignVaultContractClient::new(&env, &vault_id);
    vault_client.create_vault(&campaign_id, &nonprofit, &verifier);

    (
        env,
        admin,
        nonprofit,
        verifier,
        token_address,
        campaign_registry_id,
        campaign_id,
        vault_client,
    )
}

// ===========================================================================
// Happy paths
// ===========================================================================

#[test]
fn test_full_happy_path() {
    let (env, _admin, nonprofit, verifier, token_address, _cr_id, campaign_id, vault_client) =
        setup_full_ecosystem();

    let donor = Address::generate(&env);
    let token_client = soroban_sdk::token::Client::new(&env, &token_address);
    let token_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin_client.mint(&donor, &10_000i128);

    vault_client.deposit(&campaign_id, &donor, &10_000i128);

    let vault = vault_client.get_vault(&campaign_id);
    assert_eq!(vault.total_deposited, 10_000);
    assert!(vault.initial_release_done);
    assert!(!vault.final_release_done);
    assert_eq!(token_client.balance(&nonprofit), 5_000);

    let evidence_hash = Bytes::from_slice(&env, b"QmEvidenceHash");
    vault_client.submit_evidence(&campaign_id, &nonprofit, &evidence_hash);

    assert!(vault_client.get_vault(&campaign_id).evidence_hash.is_some());

    vault_client.release_final(&campaign_id, &verifier, &evidence_hash);

    assert_eq!(token_client.balance(&nonprofit), 10_000);
    assert!(vault_client.get_vault(&campaign_id).final_release_done);
}

#[test]
fn test_multiple_donors_reach_target() {
    let (env, _admin, nonprofit, verifier, token_address, _cr_id, campaign_id, vault_client) =
        setup_full_ecosystem();

    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    let token_client = soroban_sdk::token::Client::new(&env, &token_address);

    let donor_a = Address::generate(&env);
    let donor_b = Address::generate(&env);
    token_admin.mint(&donor_a, &6_000i128);
    token_admin.mint(&donor_b, &4_000i128);

    vault_client.deposit(&campaign_id, &donor_a, &6_000i128);
    let vault = vault_client.get_vault(&campaign_id);
    assert_eq!(vault.total_deposited, 6_000);
    assert!(!vault.initial_release_done);
    assert_eq!(token_client.balance(&nonprofit), 0);

    vault_client.deposit(&campaign_id, &donor_b, &4_000i128);
    let vault = vault_client.get_vault(&campaign_id);
    assert_eq!(vault.total_deposited, 10_000);
    assert!(vault.initial_release_done);
    assert_eq!(token_client.balance(&nonprofit), 5_000);

    let evidence_hash = Bytes::from_slice(&env, b"QmEvidence");
    vault_client.submit_evidence(&campaign_id, &nonprofit, &evidence_hash);
    vault_client.release_final(&campaign_id, &verifier, &evidence_hash);

    assert_eq!(token_client.balance(&nonprofit), 10_000);
}

#[test]
fn test_submit_evidence_overwrites_previous() {
    let (env, _admin, nonprofit, _verifier, token_address, _cr_id, campaign_id, vault_client) =
        setup_full_ecosystem();
    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &10_000i128);
    vault_client.deposit(&campaign_id, &donor, &10_000i128);

    let first_hash = Bytes::from_slice(&env, b"QmFirstEvidence");
    vault_client.submit_evidence(&campaign_id, &nonprofit, &first_hash);

    let second_hash = Bytes::from_slice(&env, b"QmCorrectedEvidence");
    vault_client.submit_evidence(&campaign_id, &nonprofit, &second_hash);

    let vault = vault_client.get_vault(&campaign_id);
    assert_eq!(vault.evidence_hash.unwrap(), second_hash);
}

// ===========================================================================
// Deposit validation
// ===========================================================================

#[test]
#[should_panic(expected = "HostError: Error(Contract, #19)")]
fn test_deposit_exceeds_target() {
    let (env, _admin, _nonprofit, _verifier, token_address, _cr_id, campaign_id, vault_client) =
        setup_full_ecosystem();
    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &20_000i128);

    vault_client.deposit(&campaign_id, &donor, &15_000i128);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #5)")]
fn test_deposit_non_existent_vault() {
    let (env, _admin, _nonprofit, _verifier, token_address, _cr_id, _campaign_id, vault_client) =
        setup_full_ecosystem();
    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &1_000i128);

    vault_client.deposit(&999u64, &donor, &1_000i128);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #22)")]
fn test_deposit_after_deadline() {
    let (env, _admin, _nonprofit, _verifier, token_address, _cr_id, campaign_id, vault_client) =
        setup_full_ecosystem();
    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &1_000i128);

    let new_ts = env.ledger().timestamp() + 31 * 86_400;
    env.ledger().with_mut(|li| li.timestamp = new_ts);

    vault_client.deposit(&campaign_id, &donor, &1_000i128);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #23)")]
fn test_deposit_after_final_release() {
    let (env, _admin, nonprofit, verifier, token_address, _cr_id, campaign_id, vault_client) =
        setup_full_ecosystem();
    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &11_000i128);

    vault_client.deposit(&campaign_id, &donor, &10_000i128);
    let evidence_hash = Bytes::from_slice(&env, b"QmEvidence");
    vault_client.submit_evidence(&campaign_id, &nonprofit, &evidence_hash);
    vault_client.release_final(&campaign_id, &verifier, &evidence_hash);

    vault_client.deposit(&campaign_id, &donor, &1_000i128);
}

// ===========================================================================
// Evidence validation
// ===========================================================================

#[test]
#[should_panic(expected = "HostError: Error(Contract, #21)")]
fn test_submit_evidence_before_initial_release() {
    let (env, _admin, nonprofit, _verifier, token_address, _cr_id, campaign_id, vault_client) =
        setup_full_ecosystem();
    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &5_000i128);

    vault_client.deposit(&campaign_id, &donor, &5_000i128);

    let evidence_hash = Bytes::from_slice(&env, b"QmEarlyEvidence");
    vault_client.submit_evidence(&campaign_id, &nonprofit, &evidence_hash);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #1)")]
fn test_submit_evidence_unauthorized() {
    let (env, _admin, _nonprofit, _verifier, token_address, _cr_id, campaign_id, vault_client) =
        setup_full_ecosystem();
    let donor = Address::generate(&env);
    let attacker = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &10_000i128);
    vault_client.deposit(&campaign_id, &donor, &10_000i128);

    let evidence_hash = Bytes::from_slice(&env, b"QmEvidence");
    vault_client.submit_evidence(&campaign_id, &attacker, &evidence_hash);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #24)")]
fn test_submit_evidence_empty_hash() {
    let (env, _admin, nonprofit, _verifier, token_address, _cr_id, campaign_id, vault_client) =
        setup_full_ecosystem();
    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &10_000i128);
    vault_client.deposit(&campaign_id, &donor, &10_000i128);

    let empty = Bytes::new(&env);
    vault_client.submit_evidence(&campaign_id, &nonprofit, &empty);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #5)")]
fn test_submit_evidence_non_existent_vault() {
    let (env, _admin, nonprofit, _verifier, _token, _cr_id, _campaign_id, vault_client) =
        setup_full_ecosystem();

    let evidence_hash = Bytes::from_slice(&env, b"QmEvidence");
    vault_client.submit_evidence(&999u64, &nonprofit, &evidence_hash);
}

// ===========================================================================
// Final release validation
// ===========================================================================

#[test]
#[should_panic(expected = "HostError: Error(Contract, #8)")]
fn test_final_release_without_evidence() {
    let (env, _admin, _nonprofit, verifier, token_address, _cr_id, campaign_id, vault_client) =
        setup_full_ecosystem();
    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &10_000i128);
    vault_client.deposit(&campaign_id, &donor, &10_000i128);

    let any_hash = Bytes::from_slice(&env, b"QmAnything");
    vault_client.release_final(&campaign_id, &verifier, &any_hash);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #30)")]
fn test_release_final_not_verifier() {
    let (env, _admin, nonprofit, _verifier, token_address, _cr_id, campaign_id, vault_client) =
        setup_full_ecosystem();
    let donor = Address::generate(&env);
    let attacker = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &10_000i128);
    vault_client.deposit(&campaign_id, &donor, &10_000i128);

    let evidence_hash = Bytes::from_slice(&env, b"QmEvidence");
    vault_client.submit_evidence(&campaign_id, &nonprofit, &evidence_hash);

    vault_client.release_final(&campaign_id, &attacker, &evidence_hash);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #16)")]
fn test_release_final_twice() {
    let (env, _admin, nonprofit, verifier, token_address, _cr_id, campaign_id, vault_client) =
        setup_full_ecosystem();
    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &10_000i128);
    vault_client.deposit(&campaign_id, &donor, &10_000i128);

    let evidence_hash = Bytes::from_slice(&env, b"QmEvidence");
    vault_client.submit_evidence(&campaign_id, &nonprofit, &evidence_hash);

    vault_client.release_final(&campaign_id, &verifier, &evidence_hash);
    vault_client.release_final(&campaign_id, &verifier, &evidence_hash);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #5)")]
fn test_release_final_non_existent_vault() {
    let (env, _admin, _nonprofit, verifier, _token, _cr_id, _campaign_id, vault_client) =
        setup_full_ecosystem();
    let any_hash = Bytes::from_slice(&env, b"QmAnything");

    vault_client.release_final(&999u64, &verifier, &any_hash);
}

// ===========================================================================
// H3: TOCTOU protection
// ===========================================================================

/// The verifier must pass the exact evidence hash they reviewed. If the
/// nonprofit overwrote the evidence between review and release, the call
/// fails with `InvalidEvidenceHash` (#29).
#[test]
#[should_panic(expected = "HostError: Error(Contract, #29)")]
fn test_release_final_rejects_wrong_evidence() {
    let (env, _admin, nonprofit, verifier, token_address, _cr_id, campaign_id, vault_client) =
        setup_full_ecosystem();
    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &10_000i128);
    vault_client.deposit(&campaign_id, &donor, &10_000i128);

    // Nonprofit submits one hash, then overwrites it.
    let original = Bytes::from_slice(&env, b"QmOriginal");
    vault_client.submit_evidence(&campaign_id, &nonprofit, &original);

    let tampered = Bytes::from_slice(&env, b"QmTampered");
    vault_client.submit_evidence(&campaign_id, &nonprofit, &tampered);

    // Verifier tries to release against the original hash they reviewed.
    vault_client.release_final(&campaign_id, &verifier, &original);
}

// ===========================================================================
// H2: custom milestone percentage
// ===========================================================================

#[test]
fn test_custom_milestone_30_percent() {
    let (env, _admin, nonprofit, _verifier, token_address, _cr_id, campaign_id, vault_client) =
        setup_full_ecosystem_with_milestone(30);

    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    let token_client = soroban_sdk::token::Client::new(&env, &token_address);
    token_admin.mint(&donor, &10_000i128);

    vault_client.deposit(&campaign_id, &donor, &10_000i128);

    // 30% of 10_000 = 3_000, not the default 5_000.
    assert_eq!(token_client.balance(&nonprofit), 3_000);
}

// ===========================================================================
// H1: pull-based refunds
// ===========================================================================

#[test]
fn test_claim_refund_after_expiry() {
    let (env, _admin, _nonprofit, _verifier, token_address, _cr_id, campaign_id, vault_client) =
        setup_full_ecosystem();
    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    let token_client = soroban_sdk::token::Client::new(&env, &token_address);
    token_admin.mint(&donor, &5_000i128);

    // Partial deposit: target not reached, no initial release.
    vault_client.deposit(&campaign_id, &donor, &5_000i128);
    assert_eq!(token_client.balance(&donor), 0);

    // Advance past deadline.
    let new_ts = env.ledger().timestamp() + 31 * 86_400;
    env.ledger().with_mut(|li| li.timestamp = new_ts);

    vault_client.claim_refund(&campaign_id, &donor);
    assert_eq!(token_client.balance(&donor), 5_000);
}

#[test]
fn test_claim_refund_after_cancellation() {
    let (env, _admin, _nonprofit, _verifier, token_address, cr_id, campaign_id, vault_client) =
        setup_full_ecosystem();
    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    let token_client = soroban_sdk::token::Client::new(&env, &token_address);
    token_admin.mint(&donor, &5_000i128);

    vault_client.deposit(&campaign_id, &donor, &5_000i128);

    // Cancel the campaign via the registry.
    let cr_client = CampaignRegistryContractClient::new(&env, &cr_id);
    cr_client.cancel_campaign(&_nonprofit, &campaign_id);

    vault_client.claim_refund(&campaign_id, &donor);
    assert_eq!(token_client.balance(&donor), 5_000);
}

#[test]
fn test_claim_refund_when_paused() {
    let (env, admin, _nonprofit, _verifier, token_address, _cr_id, campaign_id, vault_client) =
        setup_full_ecosystem();
    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    let token_client = soroban_sdk::token::Client::new(&env, &token_address);
    token_admin.mint(&donor, &5_000i128);

    vault_client.deposit(&campaign_id, &donor, &5_000i128);

    // Admin pauses the vault — refunds become available even without expiry.
    vault_client.pause_vault(&admin, &campaign_id);
    vault_client.claim_refund(&campaign_id, &donor);
    assert_eq!(token_client.balance(&donor), 5_000);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #27)")]
fn test_claim_refund_blocked_when_active() {
    let (env, _admin, _nonprofit, _verifier, token_address, _cr_id, campaign_id, vault_client) =
        setup_full_ecosystem();
    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &5_000i128);

    vault_client.deposit(&campaign_id, &donor, &5_000i128);

    // Campaign is still active, not expired, not paused: refund not available.
    vault_client.claim_refund(&campaign_id, &donor);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #27)")]
fn test_claim_refund_blocked_after_initial_release() {
    let (env, _admin, _nonprofit, _verifier, token_address, _cr_id, campaign_id, vault_client) =
        setup_full_ecosystem();
    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &10_000i128);

    // Full deposit: target reached, initial release executed.
    vault_client.deposit(&campaign_id, &donor, &10_000i128);

    // Advance past deadline.
    let new_ts = env.ledger().timestamp() + 31 * 86_400;
    env.ledger().with_mut(|li| li.timestamp = new_ts);

    vault_client.claim_refund(&campaign_id, &donor);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #28)")]
fn test_claim_refund_twice_fails() {
    let (env, _admin, _nonprofit, _verifier, token_address, _cr_id, campaign_id, vault_client) =
        setup_full_ecosystem();
    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &5_000i128);

    vault_client.deposit(&campaign_id, &donor, &5_000i128);
    let new_ts = env.ledger().timestamp() + 31 * 86_400;
    env.ledger().with_mut(|li| li.timestamp = new_ts);

    vault_client.claim_refund(&campaign_id, &donor);
    vault_client.claim_refund(&campaign_id, &donor);
}

// ===========================================================================
// H4: emergency pause
// ===========================================================================

#[test]
#[should_panic(expected = "HostError: Error(Contract, #32)")]
fn test_pause_vault_blocks_deposits() {
    let (env, admin, _nonprofit, _verifier, token_address, _cr_id, campaign_id, vault_client) =
        setup_full_ecosystem();
    vault_client.pause_vault(&admin, &campaign_id);

    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &1_000i128);
    vault_client.deposit(&campaign_id, &donor, &1_000i128);
}

#[test]
fn test_unpause_vault_restores_deposits() {
    let (env, admin, _nonprofit, _verifier, token_address, _cr_id, campaign_id, vault_client) =
        setup_full_ecosystem();
    vault_client.pause_vault(&admin, &campaign_id);
    vault_client.unpause_vault(&admin, &campaign_id);

    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &1_000i128);
    vault_client.deposit(&campaign_id, &donor, &1_000i128);

    assert_eq!(vault_client.get_vault(&campaign_id).total_deposited, 1_000);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #1)")]
fn test_pause_vault_non_admin_fails() {
    let (env, _admin, _nonprofit, _verifier, _token, _cr_id, campaign_id, vault_client) =
        setup_full_ecosystem();
    let attacker = Address::generate(&env);
    vault_client.pause_vault(&attacker, &campaign_id);
}

// ===========================================================================
// Vault creation validation
// ===========================================================================

#[test]
#[should_panic(expected = "HostError: Error(Contract, #5)")]
fn test_create_vault_non_existent_campaign() {
    let (env, _admin, _nonprofit, verifier, _token, _cr_id, _campaign_id, vault_client) =
        setup_full_ecosystem();
    let some_nonprofit = Address::generate(&env);

    vault_client.create_vault(&999u64, &some_nonprofit, &verifier);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #20)")]
fn test_create_vault_twice_panics() {
    let (env, _admin, nonprofit, verifier, _token, _cr_id, campaign_id, vault_client) =
        setup_full_ecosystem();

    vault_client.create_vault(&campaign_id, &nonprofit, &verifier);
    let _ = env;
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_create_vault_for_cancelled_campaign() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = 1_700_000_000);

    let admin = Address::generate(&env);
    let nonprofit = Address::generate(&env);
    let verifier = Address::generate(&env);

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
        &String::from_str(&env, "Cancelled Campaign"),
        &String::from_str(&env, "Desc"),
        &String::from_str(&env, "Loc"),
        &5_000i128,
        &token_address,
        &(env.ledger().timestamp() + 86_400),
        &50u32,
    );

    campaign_registry_client.cancel_campaign(&nonprofit, &campaign_id);

    let vault_id = env.register(CampaignVaultContract, (&admin, &campaign_registry_id));
    let vault_client = CampaignVaultContractClient::new(&env, &vault_id);
    vault_client.create_vault(&campaign_id, &nonprofit, &verifier);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #1)")]
fn test_create_vault_unauthorized_for_new_campaign() {
    let (env, admin, _nonprofit, verifier, token_address, _cr_id, _campaign_id, _vault_client) =
        setup_full_ecosystem();

    let other_nonprofit = Address::generate(&env);
    let np_registry_id = env.register(NonprofitRegistryContract, (&admin,));
    let np_registry_client = NonprofitRegistryContractClient::new(&env, &np_registry_id);
    let profile = create_mock_profile(&env);
    np_registry_client.register_nonprofit(&other_nonprofit, &profile);
    np_registry_client.approve_nonprofit(&admin, &other_nonprofit);

    let campaign_registry_id =
        env.register(CampaignRegistryContract, (&admin, &np_registry_id));
    let campaign_registry_client =
        CampaignRegistryContractClient::new(&env, &campaign_registry_id);

    let campaign_id = campaign_registry_client.create_campaign(
        &other_nonprofit,
        &String::from_str(&env, "Other Campaign"),
        &String::from_str(&env, "Desc"),
        &String::from_str(&env, "Loc"),
        &5_000i128,
        &token_address,
        &(env.ledger().timestamp() + 86_400),
        &50u32,
    );

    let vault_id = env.register(CampaignVaultContract, (&admin, &campaign_registry_id));
    let vault_client = CampaignVaultContractClient::new(&env, &vault_id);

    let attacker = Address::generate(&env);
    vault_client.create_vault(&campaign_id, &attacker, &verifier);
}

// ===========================================================================
// Authorized router
// ===========================================================================

#[test]
fn test_admin_can_set_and_clear_authorized_router() {
    let (env, admin, _nonprofit, _verifier, _token, _cr_id, _campaign_id, vault_client) =
        setup_full_ecosystem();

    assert_eq!(vault_client.get_authorized_router(), None);

    let router = Address::generate(&env);
    vault_client.set_authorized_router(&admin, &Some(router.clone()));
    assert_eq!(vault_client.get_authorized_router(), Some(router));

    vault_client.set_authorized_router(&admin, &None);
    assert_eq!(vault_client.get_authorized_router(), None);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #1)")]
fn test_set_authorized_router_not_admin() {
    let (env, _admin, _nonprofit, _verifier, _token, _cr_id, _campaign_id, vault_client) =
        setup_full_ecosystem();
    let attacker = Address::generate(&env);
    let router = Address::generate(&env);

    vault_client.set_authorized_router(&attacker, &Some(router));
}

#[test]
fn test_deposit_works_after_clearing_router() {
    let (env, admin, _nonprofit, _verifier, token_address, _cr_id, campaign_id, vault_client) =
        setup_full_ecosystem();
    let router = Address::generate(&env);
    vault_client.set_authorized_router(&admin, &Some(router));
    vault_client.set_authorized_router(&admin, &None);

    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &1_000i128);
    vault_client.deposit(&campaign_id, &donor, &1_000i128);

    assert_eq!(vault_client.get_vault(&campaign_id).total_deposited, 1_000);
}

#[test]
#[should_panic(expected = "HostError: Error(Auth")]
fn test_direct_deposit_blocked_when_router_configured() {
    use soroban_sdk::testutils::{MockAuth, MockAuthInvoke};
    use soroban_sdk::IntoVal;

    let (env, admin, _nonprofit, _verifier, token_address, _cr_id, campaign_id, vault_client) =
        setup_full_ecosystem();

    let router = Address::generate(&env);
    vault_client.set_authorized_router(&admin, &Some(router));

    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &1_000i128);

    let vault_id = vault_client.address.clone();
    env.mock_auths(&[MockAuth {
        address: &donor,
        invoke: &MockAuthInvoke {
            contract: &vault_id,
            fn_name: "deposit",
            args: (campaign_id, donor.clone(), 1_000i128).into_val(&env),
            sub_invokes: &[],
        },
    }]);

    vault_client.deposit(&campaign_id, &donor, &1_000i128);
}

// ===========================================================================
// Verifier management
// ===========================================================================

#[test]
fn test_set_verifier_for_campaign() {
    let (env, admin, nonprofit, old_verifier, token_address, _cr_id, campaign_id, vault_client) =
        setup_full_ecosystem();
    let new_verifier = Address::generate(&env);

    vault_client.set_verifier_for_campaign(&admin, &campaign_id, &new_verifier);

    // Fund the vault and submit evidence.
    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &10_000i128);
    vault_client.deposit(&campaign_id, &donor, &10_000i128);

    let evidence_hash = Bytes::from_slice(&env, b"QmEvidence");
    vault_client.submit_evidence(&campaign_id, &nonprofit, &evidence_hash);

    // Old verifier is rejected.
    let old_result = vault_client.try_release_final(&campaign_id, &old_verifier, &evidence_hash);
    assert!(old_result.is_err());

    // New verifier succeeds.
    vault_client.release_final(&campaign_id, &new_verifier, &evidence_hash);
    assert!(vault_client.get_vault(&campaign_id).final_release_done);
}

// ===========================================================================
// Two-step admin transfer
// ===========================================================================

#[test]
fn test_propose_and_accept_admin_flow() {
    let (env, admin, _nonprofit, _verifier, _token, _cr_id, _campaign_id, vault_client) =
        setup_full_ecosystem();
    let new_admin = Address::generate(&env);

    vault_client.propose_admin(&admin, &new_admin);
    assert_eq!(vault_client.get_pending_admin(), Some(new_admin.clone()));

    vault_client.accept_admin();
    assert_eq!(vault_client.get_pending_admin(), None);
    assert_eq!(vault_client.get_admin(), new_admin);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #1)")]
fn test_propose_admin_not_admin() {
    let (env, _admin, _nonprofit, _verifier, _token, _cr_id, _campaign_id, vault_client) =
        setup_full_ecosystem();
    let attacker = Address::generate(&env);
    let new_admin = Address::generate(&env);

    vault_client.propose_admin(&attacker, &new_admin);
}
