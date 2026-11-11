#![cfg(test)]

//! Real-signature tests for the governance account's threshold logic.
//!
//! These tests exercise `verify_signatures`, which is the public read-only
//! entry point that `__check_auth` delegates to. Using `verify_signatures`
//! avoids the host-level auth dispatch (which is not exercisable in
//! `cargo test` without constructing real `SorobanAuthorizationEntry`
//! values), while still running the full Ed25519 verification path.
//!
//! # `try_verify_signatures` return shape (SDK 29.0.1)
//!
//! The generated client's `try_*` returns:
//!
//! ```text
//! Result<Result<(), ConversionError>, Result<GovernanceError, InvokeError>>
//! ```
//!
//! * `Ok(Ok(()))` → success
//! * `Ok(Err(ConversionError))` → return value could not be deserialized
//! * `Err(Ok(GovernanceError))` → contract returned a typed error
//! * `Err(Err(InvokeError))` → host trapped (panic, auth failure, ...)

use ed25519_dalek::Signer as _;
use soroban_sdk::{crypto::Hash, Bytes, BytesN, Env, Vec};

use governance_account::{
    GovernanceAccountContract, GovernanceAccountContractClient, GovernanceError, SignerProof,
};

// ============================================================================
// Outcome type
// ============================================================================

#[derive(Debug)]
enum VerifyOutcome {
    Success,
    ConversionError,
    ContractError(GovernanceError),
    HostPanic,
}

// ============================================================================
// Helpers
// ============================================================================

fn signing_key(seed: u8) -> ed25519_dalek::SigningKey {
    let mut bytes = [0u8; 32];
    bytes[0] = seed;
    ed25519_dalek::SigningKey::from_bytes(&bytes)
}

fn pubkey_bytes(kp: &ed25519_dalek::SigningKey) -> [u8; 32] {
    kp.verifying_key().to_bytes()
}

fn sign_proof(env: &Env, kp: &ed25519_dalek::SigningKey, payload: &[u8; 32]) -> SignerProof {
    let sig = kp.sign(payload);
    SignerProof {
        public_key: BytesN::from_array(env, &pubkey_bytes(kp)),
        signature: BytesN::from_array(env, &sig.to_bytes()),
    }
}

fn setup<'a>(
    env: &Env,
    signer_seeds: &[u8],
    threshold: u32,
) -> GovernanceAccountContractClient<'a> {
    let mut pks = Vec::new(env);
    for s in signer_seeds {
        pks.push_back(BytesN::from_array(env, &pubkey_bytes(&signing_key(*s))));
    }
    let id = env.register(GovernanceAccountContract, (&pks, threshold));
    GovernanceAccountContractClient::new(env, &id)
}

fn hash_payload(env: &Env, data: &[u8]) -> Hash<32> {
    let raw = Bytes::from_slice(env, data);
    env.crypto().sha256(&raw)
}

fn invoke_verify(
    env: &Env,
    client: &GovernanceAccountContractClient,
    payload_hash: Hash<32>,
    proofs: Vec<SignerProof>,
) -> VerifyOutcome {
    let arr = payload_hash.to_array();
    let payload = BytesN::from_array(env, &arr);

    match client.try_verify_signatures(&payload, &proofs) {
        Ok(Ok(())) => VerifyOutcome::Success,
        Ok(Err(_conv)) => VerifyOutcome::ConversionError,
        Err(Ok(e)) => VerifyOutcome::ContractError(e),
        Err(Err(_)) => VerifyOutcome::HostPanic,
    }
}

// ============================================================================
// Tests
// ============================================================================

#[test]
fn test_valid_signatures_meet_threshold() {
    let env = Env::default();
    let client = setup(&env, &[1, 2, 3], 2);

    let payload = hash_payload(&env, b"auth-test-payload");
    let payload_arr = payload.to_array();

    let p1 = sign_proof(&env, &signing_key(1), &payload_arr);
    let p2 = sign_proof(&env, &signing_key(2), &payload_arr);
    let proofs = Vec::from_array(&env, [p1, p2]);

    let outcome = invoke_verify(&env, &client, payload, proofs);
    assert!(
        matches!(outcome, VerifyOutcome::Success),
        "expected Success, got {:?}",
        outcome,
    );
}

#[test]
fn test_insufficient_signatures() {
    let env = Env::default();
    let client = setup(&env, &[1, 2, 3], 2);

    let payload = hash_payload(&env, b"auth-test-payload");
    let payload_arr = payload.to_array();

    let p1 = sign_proof(&env, &signing_key(1), &payload_arr);
    let proofs = Vec::from_array(&env, [p1]);

    match invoke_verify(&env, &client, payload, proofs) {
        VerifyOutcome::ContractError(e) => assert_eq!(e, GovernanceError::ThresholdNotMet),
        other => panic!("expected ThresholdNotMet, got {:?}", other),
    }
}

#[test]
fn test_non_signer_proofs_are_skipped() {
    let env = Env::default();
    let client = setup(&env, &[1, 2, 3], 2);

    let payload = hash_payload(&env, b"auth-test-payload");
    let payload_arr = payload.to_array();

    let p1 = sign_proof(&env, &signing_key(1), &payload_arr);
    let p99 = sign_proof(&env, &signing_key(99), &payload_arr);
    let proofs = Vec::from_array(&env, [p1, p99]);

    match invoke_verify(&env, &client, payload, proofs) {
        VerifyOutcome::ContractError(e) => assert_eq!(e, GovernanceError::ThresholdNotMet),
        other => panic!("expected ThresholdNotMet, got {:?}", other),
    }
}

#[test]
fn test_duplicate_signatures_counted_once() {
    let env = Env::default();
    let client = setup(&env, &[1, 2, 3], 2);

    let payload = hash_payload(&env, b"auth-test-payload");
    let payload_arr = payload.to_array();

    let p1a = sign_proof(&env, &signing_key(1), &payload_arr);
    let p1b = sign_proof(&env, &signing_key(1), &payload_arr);
    let proofs = Vec::from_array(&env, [p1a, p1b]);

    match invoke_verify(&env, &client, payload, proofs) {
        VerifyOutcome::ContractError(e) => assert_eq!(e, GovernanceError::ThresholdNotMet),
        other => panic!("expected ThresholdNotMet, got {:?}", other),
    }
}

#[test]
fn test_more_than_threshold_succeeds() {
    let env = Env::default();
    let client = setup(&env, &[1, 2, 3], 2);

    let payload = hash_payload(&env, b"auth-test-payload");
    let payload_arr = payload.to_array();

    let p1 = sign_proof(&env, &signing_key(1), &payload_arr);
    let p2 = sign_proof(&env, &signing_key(2), &payload_arr);
    let p3 = sign_proof(&env, &signing_key(3), &payload_arr);
    let proofs = Vec::from_array(&env, [p1, p2, p3]);

    let outcome = invoke_verify(&env, &client, payload, proofs);
    assert!(
        matches!(outcome, VerifyOutcome::Success),
        "expected Success, got {:?}",
        outcome,
    );
}

#[test]
fn test_wrong_payload_fails_verification() {
    let env = Env::default();
    let client = setup(&env, &[1, 2, 3], 2);

    let payload_a = hash_payload(&env, b"payload-A");
    let payload_a_arr = payload_a.to_array();

    let p1 = sign_proof(&env, &signing_key(1), &payload_a_arr);
    let p2 = sign_proof(&env, &signing_key(2), &payload_a_arr);
    let proofs = Vec::from_array(&env, [p1, p2]);

    let payload_b = hash_payload(&env, b"payload-B");

    let outcome = invoke_verify(&env, &client, payload_b, proofs);
    assert!(
        matches!(outcome, VerifyOutcome::HostPanic),
        "expected HostPanic from invalid signature, got {:?}",
        outcome,
    );
}

#[test]
fn test_invalid_signature_panics_entire_check() {
    let env = Env::default();
    let client = setup(&env, &[1, 2, 3], 2);

    let payload = hash_payload(&env, b"auth-test-payload");
    let payload_arr = payload.to_array();

    let p1_valid = sign_proof(&env, &signing_key(1), &payload_arr);

    let payload_wrong = hash_payload(&env, b"wrong-payload");
    let p2_invalid = sign_proof(&env, &signing_key(2), &payload_wrong.to_array());

    let proofs = Vec::from_array(&env, [p1_valid, p2_invalid]);
    let outcome = invoke_verify(&env, &client, payload, proofs);
    assert!(
        matches!(outcome, VerifyOutcome::HostPanic),
        "expected HostPanic from invalid signature, got {:?}",
        outcome,
    );
}

#[test]
fn test_single_signer_threshold_one() {
    let env = Env::default();
    let client = setup(&env, &[1], 1);

    let payload = hash_payload(&env, b"auth-test-payload");
    let payload_arr = payload.to_array();

    let p1 = sign_proof(&env, &signing_key(1), &payload_arr);
    let proofs = Vec::from_array(&env, [p1]);

    let outcome = invoke_verify(&env, &client, payload, proofs);
    assert!(
        matches!(outcome, VerifyOutcome::Success),
        "expected Success, got {:?}",
        outcome,
    );
}

#[test]
fn test_empty_proofs_fails_threshold() {
    let env = Env::default();
    let client = setup(&env, &[1, 2, 3], 2);

    let payload = hash_payload(&env, b"auth-test-payload");
    let proofs: Vec<SignerProof> = Vec::new(&env);

    match invoke_verify(&env, &client, payload, proofs) {
        VerifyOutcome::ContractError(e) => assert_eq!(e, GovernanceError::ThresholdNotMet),
        other => panic!("expected ThresholdNotMet, got {:?}", other),
    }
}
