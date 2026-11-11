#![cfg(test)]

//! End-to-end integration between `governance-account` and the contracts
//! that consume it as `admin` or `verifier`.
//!
//! # Threshold testing caveat
//!
//! Soroban's test environment (`env.mock_all_auths()`) bypasses signature
//! verification. This means the `__check_auth` threshold logic of the
//! governance account is not exercised here; it is validated only at
//! runtime on Testnet/Mainnet with real signatures.
//!
//! What these tests DO validate:
//! * The governance account can be configured (signers, threshold).
//! * The governance account can act as `admin` of `nonprofit-registry`
//!   end-to-end.
//! * The governance account's configuration can be changed through its own
//!   auth-gated functions (add_signer, update_threshold, remove_signer).
//!
//! Threshold enforcement is the subject of `governance-account/src/test.rs`
//! (configuration) and real on-chain transactions.

use protocol_types::{NonprofitProfile, NonprofitStatus};
use soroban_sdk::{testutils::Address as _, Address, Bytes, Env, String, Vec};

use governance_account::{GovernanceAccountContract, GovernanceAccountContractClient};
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

/// A 2-of-3 governance account can administer the nonprofit registry
/// end-to-end.
#[test]
fn test_governance_account_administers_nonprofit_registry() {
    let env = Env::default();
    env.mock_all_auths();

    // 1. Create a 2-of-3 governance account.
    let signer1 = Address::generate(&env);
    let signer2 = Address::generate(&env);
    let signer3 = Address::generate(&env);
    let mut signers = Vec::new(&env);
    signers.push_back(signer1);
    signers.push_back(signer2);
    signers.push_back(signer3);
    let governance_id = env.register(GovernanceAccountContract, (&signers, 2u32));
    let governance_client = GovernanceAccountContractClient::new(&env, &governance_id);

    assert_eq!(governance_client.get_threshold(), 2);
    assert_eq!(governance_client.get_signers().len(), 3);

    // 2. Deploy nonprofit-registry with the governance account as admin.
    let np_id = env.register(NonprofitRegistryContract, (&governance_id,));
    let np_client = NonprofitRegistryContractClient::new(&env, &np_id);

    // 3. Register and approve a nonprofit.
    let nonprofit = Address::generate(&env);
    let profile = create_mock_profile(&env);
    np_client.register_nonprofit(&nonprofit, &profile);
    np_client.approve_nonprofit(&governance_id, &nonprofit);

    // 4. Verify.
    assert!(np_client.is_approved(&nonprofit));
    assert_eq!(
        np_client.get_profile(&nonprofit).status,
        NonprofitStatus::Approved
    );
}

/// The governance account can rotate its own signers, provided the current
/// threshold authorizes it. With `mock_all_auths`, the current threshold
/// is bypassed, but the state changes are still validated.
#[test]
fn test_governance_account_manages_itself() {
    let env = Env::default();
    env.mock_all_auths();

    let signer1 = Address::generate(&env);
    let signer2 = Address::generate(&env);
    let mut signers = Vec::new(&env);
    signers.push_back(signer1);
    signers.push_back(signer2);
    let governance_id = env.register(GovernanceAccountContract, (&signers, 2u32));
    let governance_client = GovernanceAccountContractClient::new(&env, &governance_id);

    // Add a signer.
    let signer3 = Address::generate(&env);
    governance_client.add_signer(&signer3);
    assert_eq!(governance_client.get_signers().len(), 3);

    // Update the threshold to 3-of-3.
    governance_client.update_threshold(&3u32);
    assert_eq!(governance_client.get_threshold(), 3);

    // Remove a signer; threshold auto-adjusts from 3 to 2.
    governance_client.remove_signer(&signer3);
    assert_eq!(governance_client.get_signers().len(), 2);
    assert_eq!(governance_client.get_threshold(), 2);
}

/// Mutations on the governance account require authorization.
///
/// Without `mock_all_auths`, an arbitrary address cannot call
/// `add_signer`. The test asserts the presence of the auth guard, not
/// the specific error code (which is `HostError: Error(Auth, ...)` from
/// the Soroban host, not a `contracterror`).
#[test]
#[should_panic]
fn test_governance_account_rejects_unauthorized_mutation() {
    let env = Env::default();
    // Intentionally NOT calling env.mock_all_auths().

    let signer1 = Address::generate(&env);
    let signer2 = Address::generate(&env);
    let mut signers = Vec::new(&env);
    signers.push_back(signer1);
    signers.push_back(signer2);
    let governance_id = env.register(GovernanceAccountContract, (&signers, 2u32));
    let governance_client = GovernanceAccountContractClient::new(&env, &governance_id);

    let attacker = Address::generate(&env);
    governance_client.add_signer(&attacker);
}
