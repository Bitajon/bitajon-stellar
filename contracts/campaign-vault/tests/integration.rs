#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Address, Bytes, Env, String,
};
use thriving_types::{NonprofitProfile, NonprofitStatus};

use campaign_registry::{CampaignRegistryContract, CampaignRegistryContractClient};
use campaign_vault::{CampaignVaultContract, CampaignVaultContractClient};
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

/// Deploys the full ecosystem and returns all necessary handles.
fn setup_full_ecosystem<'a>() -> (
    Env,
    Address, // Admin
    Address, // Nonprofit
    Address, // Token
    u64,     // Campaign ID
    CampaignVaultContractClient<'a>,
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

    (
        env,
        admin,
        nonprofit,
        token_address,
        campaign_id,
        vault_client,
    )
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

/// Full happy path: deposit to target triggers initial release, evidence and
/// admin validation trigger the final release.
#[test]
fn test_full_happy_path() {
    let (env, admin, nonprofit, token_address, campaign_id, vault_client) =
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

    let vault = vault_client.get_vault(&campaign_id);
    assert!(vault.evidence_hash.is_some());

    vault_client.release_final(&campaign_id, &admin);

    assert_eq!(token_client.balance(&nonprofit), 10_000);
    assert!(vault_client.get_vault(&campaign_id).final_release_done);
}

/// Ensures deposits split across multiple donors accumulate correctly and
/// trigger the initial release exactly when the target is crossed.
#[test]
fn test_multiple_donors_reach_target() {
    let (env, admin, nonprofit, token_address, campaign_id, vault_client) =
        setup_full_ecosystem();

    let token_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    let token_client = soroban_sdk::token::Client::new(&env, &token_address);

    let donor_a = Address::generate(&env);
    let donor_b = Address::generate(&env);

    token_admin_client.mint(&donor_a, &6_000i128);
    token_admin_client.mint(&donor_b, &4_000i128);

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
    vault_client.release_final(&campaign_id, &admin);

    assert_eq!(token_client.balance(&nonprofit), 10_000);
}

/// Documents and validates the overwrite semantics of `submit_evidence`:
/// the latest hash is authoritative.
#[test]
fn test_submit_evidence_overwrites_previous() {
    let (env, _admin, nonprofit, token_address, campaign_id, vault_client) =
        setup_full_ecosystem();
    let donor = Address::generate(&env);
    let token_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin_client.mint(&donor, &10_000i128);
    vault_client.deposit(&campaign_id, &donor, &10_000i128);

    let first_hash = Bytes::from_slice(&env, b"QmFirstEvidence");
    vault_client.submit_evidence(&campaign_id, &nonprofit, &first_hash);

    let second_hash = Bytes::from_slice(&env, b"QmCorrectedEvidence");
    vault_client.submit_evidence(&campaign_id, &nonprofit, &second_hash);

    let vault = vault_client.get_vault(&campaign_id);
    assert_eq!(vault.evidence_hash.unwrap(), second_hash);
}

// ---------------------------------------------------------------------------
// Deposit validation
// ---------------------------------------------------------------------------

/// Ensures deposits exceeding the campaign target are rejected.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #19)")]
fn test_deposit_exceeds_target() {
    let (env, _admin, _nonprofit, token_address, campaign_id, vault_client) =
        setup_full_ecosystem();
    let donor = Address::generate(&env);
    let token_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin_client.mint(&donor, &20_000i128);

    vault_client.deposit(&campaign_id, &donor, &15_000i128);
}

/// Ensures deposits to a non-existent vault are rejected.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #5)")]
fn test_deposit_non_existent_vault() {
    let (env, _admin, _nonprofit, token_address, _campaign_id, vault_client) =
        setup_full_ecosystem();
    let donor = Address::generate(&env);
    let token_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin_client.mint(&donor, &1_000i128);

    vault_client.deposit(&999u64, &donor, &1_000i128);
}

/// Ensures deposits after the campaign deadline are rejected.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #22)")]
fn test_deposit_after_deadline() {
    let (env, _admin, _nonprofit, token_address, campaign_id, vault_client) =
        setup_full_ecosystem();
    let donor = Address::generate(&env);
    let token_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin_client.mint(&donor, &1_000i128);

    let new_ts = env.ledger().timestamp() + 31 * 86_400;
    env.ledger().with_mut(|li| li.timestamp = new_ts);

    vault_client.deposit(&campaign_id, &donor, &1_000i128);
}

/// Ensures deposits after the final release are rejected.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #23)")]
fn test_deposit_after_final_release() {
    let (env, admin, nonprofit, token_address, campaign_id, vault_client) =
        setup_full_ecosystem();
    let donor = Address::generate(&env);
    let token_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin_client.mint(&donor, &11_000i128);

    vault_client.deposit(&campaign_id, &donor, &10_000i128);
    let evidence_hash = Bytes::from_slice(&env, b"QmEvidence");
    vault_client.submit_evidence(&campaign_id, &nonprofit, &evidence_hash);
    vault_client.release_final(&campaign_id, &admin);

    vault_client.deposit(&campaign_id, &donor, &1_000i128);
}

// ---------------------------------------------------------------------------
// Evidence validation
// ---------------------------------------------------------------------------

/// Ensures evidence cannot be submitted before the initial release occurs.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #21)")]
fn test_submit_evidence_before_initial_release() {
    let (env, _admin, nonprofit, token_address, campaign_id, vault_client) =
        setup_full_ecosystem();
    let donor = Address::generate(&env);
    let token_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin_client.mint(&donor, &5_000i128);

    vault_client.deposit(&campaign_id, &donor, &5_000i128);

    let evidence_hash = Bytes::from_slice(&env, b"QmEarlyEvidence");
    vault_client.submit_evidence(&campaign_id, &nonprofit, &evidence_hash);
}

/// Ensures evidence cannot be submitted by a non-owner address.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #1)")]
fn test_submit_evidence_unauthorized() {
    let (env, _admin, _nonprofit, token_address, campaign_id, vault_client) =
        setup_full_ecosystem();
    let donor = Address::generate(&env);
    let attacker = Address::generate(&env);
    let token_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin_client.mint(&donor, &10_000i128);
    vault_client.deposit(&campaign_id, &donor, &10_000i128);

    let evidence_hash = Bytes::from_slice(&env, b"QmEvidence");
    vault_client.submit_evidence(&campaign_id, &attacker, &evidence_hash);
}

/// Ensures an empty evidence hash is rejected.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #24)")]
fn test_submit_evidence_empty_hash() {
    let (env, _admin, nonprofit, token_address, campaign_id, vault_client) =
        setup_full_ecosystem();
    let donor = Address::generate(&env);
    let token_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin_client.mint(&donor, &10_000i128);
    vault_client.deposit(&campaign_id, &donor, &10_000i128);

    let empty = Bytes::new(&env);
    vault_client.submit_evidence(&campaign_id, &nonprofit, &empty);
}

/// Ensures evidence submission to a non-existent vault is rejected.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #5)")]
fn test_submit_evidence_non_existent_vault() {
    let (env, _admin, nonprofit, _token, _campaign_id, vault_client) =
        setup_full_ecosystem();

    let evidence_hash = Bytes::from_slice(&env, b"QmEvidence");
    vault_client.submit_evidence(&999u64, &nonprofit, &evidence_hash);
}

// ---------------------------------------------------------------------------
// Final release validation
// ---------------------------------------------------------------------------

/// Ensures the final release cannot occur without evidence.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #8)")]
fn test_final_release_without_evidence() {
    let (env, admin, _nonprofit, token_address, campaign_id, vault_client) =
        setup_full_ecosystem();
    let donor = Address::generate(&env);
    let token_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin_client.mint(&donor, &10_000i128);
    vault_client.deposit(&campaign_id, &donor, &10_000i128);

    vault_client.release_final(&campaign_id, &admin);
}

/// Ensures only the configured admin can release final funds.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #18)")]
fn test_release_final_not_admin() {
    let (env, _admin, nonprofit, token_address, campaign_id, vault_client) =
        setup_full_ecosystem();
    let donor = Address::generate(&env);
    let attacker = Address::generate(&env);
    let token_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin_client.mint(&donor, &10_000i128);
    vault_client.deposit(&campaign_id, &donor, &10_000i128);

    let evidence_hash = Bytes::from_slice(&env, b"QmEvidence");
    vault_client.submit_evidence(&campaign_id, &nonprofit, &evidence_hash);

    vault_client.release_final(&campaign_id, &attacker);
}

/// Ensures the final release cannot be executed twice.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #16)")]
fn test_release_final_twice() {
    let (env, admin, nonprofit, token_address, campaign_id, vault_client) =
        setup_full_ecosystem();
    let donor = Address::generate(&env);
    let token_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin_client.mint(&donor, &10_000i128);
    vault_client.deposit(&campaign_id, &donor, &10_000i128);

    let evidence_hash = Bytes::from_slice(&env, b"QmEvidence");
    vault_client.submit_evidence(&campaign_id, &nonprofit, &evidence_hash);

    vault_client.release_final(&campaign_id, &admin);
    vault_client.release_final(&campaign_id, &admin);
}

/// Ensures the final release on a non-existent vault is rejected.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #5)")]
fn test_release_final_non_existent_vault() {
    let (_env, admin, _nonprofit, _token, _campaign_id, vault_client) =
        setup_full_ecosystem();

    vault_client.release_final(&999u64, &admin);
}

// ---------------------------------------------------------------------------
// Vault creation validation
// ---------------------------------------------------------------------------

/// Ensures a vault cannot be created for a campaign that does not exist in the
/// campaign-registry. This validates the first line of defense: the cross-contract
/// call to `campaign-registry.get_campaign` must fail with `CampaignNotFound`
/// before any other validation is performed.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #5)")]
fn test_create_vault_non_existent_campaign() {
    let (env, _admin, _nonprofit, _token, _campaign_id, vault_client) =
        setup_full_ecosystem();
    let some_nonprofit = Address::generate(&env);

    vault_client.create_vault(&999u64, &some_nonprofit);
}

/// Ensures a vault cannot be created twice for the same campaign.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #20)")]
fn test_create_vault_twice_panics() {
    let (_env, _admin, nonprofit, _token, campaign_id, vault_client) =
        setup_full_ecosystem();

    vault_client.create_vault(&campaign_id, &nonprofit);
}

/// Ensures a vault cannot be created for a campaign that has been cancelled.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_create_vault_for_cancelled_campaign() {
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

    vault_client.create_vault(&campaign_id, &nonprofit);
}

/// Ensures a vault cannot be created for a campaign owned by another nonprofit.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #1)")]
fn test_create_vault_unauthorized_for_new_campaign() {
    let (env, admin, _nonprofit, token_address, _campaign_id, _vault_client) =
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
    vault_client.create_vault(&campaign_id, &attacker);
}

// ---------------------------------------------------------------------------
// Router bypass protection
// ---------------------------------------------------------------------------

/// Verifies that when an authorized router is configured on the vault, a
/// direct deposit from a donor fails because the router's authorization is
/// absent. This closes the platform-fee bypass.
///
/// The test overrides the blanket `mock_all_auths()` from the setup with a
/// targeted `mock_auths` that grants ONLY the donor's authorization. Because
/// the vault requires `router.require_auth()` when a router is configured,
/// and that authorization is not mocked, the call must fail.
#[test]
#[should_panic]
fn test_direct_deposit_blocked_when_router_configured() {
    use soroban_sdk::testutils::{MockAuth, MockAuthInvoke};
    use soroban_sdk::IntoVal;

    let (env, admin, _nonprofit, token_address, campaign_id, vault_client) =
        setup_full_ecosystem();

    // Configure an authorized router on the vault.
    let router = Address::generate(&env);
    vault_client.set_authorized_router(&admin, &Some(router));

    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &1_000i128);

    // Override the blanket auth mocks: authorize ONLY the donor for the
    // `deposit` call. The router is NOT authorized, so `router.require_auth()`
    // inside the vault must fail.
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

/// Ensures the admin can configure and clear the authorized router.
#[test]
fn test_admin_can_set_and_clear_authorized_router() {
    let (env, admin, _nonprofit, _token, _campaign_id, vault_client) =
        setup_full_ecosystem();

    assert_eq!(vault_client.get_authorized_router(), None);

    let router = Address::generate(&env);
    vault_client.set_authorized_router(&admin, &Some(router.clone()));
    assert_eq!(vault_client.get_authorized_router(), Some(router));

    vault_client.set_authorized_router(&admin, &None);
    assert_eq!(vault_client.get_authorized_router(), None);
}

/// Ensures non-admin callers cannot change the authorized router configuration.
#[test]
#[should_panic(expected = "HostError: Error(Contract, #1)")]
fn test_set_authorized_router_not_admin() {
    let (env, _admin, _nonprofit, _token, _campaign_id, vault_client) =
        setup_full_ecosystem();
    let attacker = Address::generate(&env);
    let router = Address::generate(&env);

    vault_client.set_authorized_router(&attacker, &Some(router));
}

/// Ensures that after clearing the router, direct deposits work again.
#[test]
fn test_deposit_works_after_clearing_router() {
    let (env, admin, _nonprofit, token_address, campaign_id, vault_client) =
        setup_full_ecosystem();

    let router = Address::generate(&env);
    vault_client.set_authorized_router(&admin, &Some(router));
    vault_client.set_authorized_router(&admin, &None);

    let donor = Address::generate(&env);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);
    token_admin.mint(&donor, &1_000i128);

    vault_client.deposit(&campaign_id, &donor, &1_000i128);

    let vault = vault_client.get_vault(&campaign_id);
    assert_eq!(vault.total_deposited, 1_000);
}
