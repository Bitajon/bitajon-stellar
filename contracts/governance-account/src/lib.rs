#![no_std]

//! Governance Account — Multisig Smart Account for Bitajón protocol governance.
//!
//! This contract implements an M-of-N threshold multisig using Soroban's
//! native `CustomAccountInterface`. It can be used as the `admin` of
//! `nonprofit-registry`, `campaign-registry`, `campaign-vault`, and
//! `donation-router`, or as the `verifier` of a vault.
//!
//! # Signer model
//!
//! Signers are **Ed25519 public keys** (`BytesN<32>`), not Stellar addresses.
//! The contract verifies each signature cryptographically against the
//! `signature_payload` provided by the Soroban host. This is the same model
//! used by OpenZeppelin's `stellar-accounts` and the official Soroban
//! examples for multisig smart accounts.
//!
//! # Testability
//!
//! The signature-verification logic is exposed as a public `verify_signatures`
//! function so it can be exercised directly by tests and by off-chain clients
//! that want to pre-check a proof set before submitting a transaction.
//! `__check_auth` and `verify_signatures` share the same internal routine,
//! keeping the two paths in sync.
//!
//! `verify_signatures` accepts the payload as `BytesN<32>` (raw hash bytes),
//! not `Hash<32>`, because Soroban only allows `Hash<32>` in the
//! `__check_auth` trait parameter. Both paths internally convert to `Bytes`,
//! which is what `ed25519_verify` expects.
//!
//! # Model
//! * **Signers**: `Vec<BytesN<32>>` of Ed25519 public keys.
//! * **Threshold**: minimum number of valid signatures required.
//! * **Any-signer**: any subset of signers whose count reaches the threshold
//!   can authorize an action. No specific signer is privileged.
//! * **Atomic**: authorization is validated inside a single `__check_auth`
//!   call. If it succeeds, all the invocations that required this account's
//!   authorization execute atomically. If it fails, the entire transaction
//!   reverts.
//!
//! # Security
//! * Duplicate signers are counted once.
//! * Removing a signer auto-lowers the threshold if necessary to keep the
//!   account usable (emits `ThresholdAutoAdjusted`).
//! * The last signer cannot be removed (the account would be bricked).
//! * Threshold must always be `1..=signers.len()`.
//! * Configuration changes require the current threshold.
//! * Instance TTL extended on every entry point.
//!
//! # Standards
//! * **SEP-45 (planned)**: A future adapter can support WebAuthn signers by
//!   extending the `SignerProof` enum. The current model is Ed25519 only.
//! * **SEP-53**: The payload is the `HashIdPreimage::SorobanAuthorization`
//!   hash, which the Stellar SDK signs transparently.

mod events;
mod storage;
#[cfg(test)]
mod test;

use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contracterror, contractimpl, contracttype,
    crypto::Hash,
    panic_with_error,
    Bytes, BytesN, Env, Vec,
};

use crate::events::{
    SignerAdded, SignerRemoved, ThresholdAutoAdjusted, ThresholdUpdated,
};
use crate::storage::{
    extend_instance_ttl, get_signers, get_threshold, set_signers, set_threshold,
};

/// A single signature submitted for authorization.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SignerProof {
    pub public_key: BytesN<32>,
    pub signature: BytesN<64>,
}

/// Errors returned by the governance account.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum GovernanceError {
    /// The provided threshold is 0 or greater than the number of signers.
    InvalidThreshold = 1,
    /// The public key is not in the signers set.
    NotASigner = 2,
    /// The public key is already in the signers set.
    AlreadySigner = 3,
    /// Fewer valid signatures than the threshold were provided.
    ThresholdNotMet = 4,
    /// The account must have at least one signer.
    NoSigners = 5,
}

#[contract]
pub struct GovernanceAccountContract;

#[contractimpl]
impl GovernanceAccountContract {
    /// Initializes the governance account with an initial set of signers
    /// and a threshold.
    ///
    /// # Arguments
    /// * `signers` - Initial set of Ed25519 public keys. Must be non-empty.
    /// * `threshold` - Minimum number of valid signatures. Must be
    ///   `1..=signers.len()`.
    ///
    /// # Errors
    /// * `NoSigners` if `signers` is empty.
    /// * `InvalidThreshold` if `threshold` is out of range.
    pub fn __constructor(env: Env, signers: Vec<BytesN<32>>, threshold: u32) {
        if signers.is_empty() {
            panic_with_error!(&env, GovernanceError::NoSigners);
        }
        if threshold == 0 || threshold > signers.len() {
            panic_with_error!(&env, GovernanceError::InvalidThreshold);
        }
        set_signers(&env, &signers);
        set_threshold(&env, threshold);
    }

    // --- Reads ---

    /// Returns the current set of signer public keys.
    pub fn get_signers(env: Env) -> Vec<BytesN<32>> {
        get_signers(&env)
    }

    /// Returns the current threshold.
    pub fn get_threshold(env: Env) -> u32 {
        get_threshold(&env)
    }

    /// Returns `true` if `public_key` is a current signer.
    pub fn is_signer(env: Env, public_key: BytesN<32>) -> bool {
        get_signers(&env).contains(&public_key)
    }

    /// Verifies a set of `SignerProof` against the current signers and
    /// threshold.
    ///
    /// This is a pure read-only helper exposed both for off-chain pre-checks
    /// and for tests. It does not mutate state. It returns `Ok(())` when the
    /// proofs meet the threshold, `ThresholdNotMet` when they do not, and
    /// panics (host trap) when any provided signature is cryptographically
    /// invalid for the payload.
    ///
    /// `signature_payload` is the 32-byte hash of the
    /// `HashIdPreimage::SorobanAuthorization` envelope, exactly as
    /// `__check_auth` receives it.
    pub fn verify_signatures(
        env: Env,
        signature_payload: BytesN<32>,
        signatures: Vec<SignerProof>,
    ) -> Result<(), GovernanceError> {
        let arr = signature_payload.to_array();
        let payload_bytes = Bytes::from_slice(&env, &arr);
        let signers = get_signers(&env);
        let threshold = get_threshold(&env);
        verify_signatures_inner(env, payload_bytes, signatures, signers, threshold)
    }

    // --- Mutations (all require the current threshold) ---

    /// Adds a new signer.
    ///
    /// The current threshold must authorize this change.
    ///
    /// # Errors
    /// * `AlreadySigner` if the public key is already in the set.
    pub fn add_signer(env: Env, new_signer: BytesN<32>) {
        extend_instance_ttl(&env);
        env.current_contract_address().require_auth();

        let mut signers = get_signers(&env);
        if signers.contains(&new_signer) {
            panic_with_error!(&env, GovernanceError::AlreadySigner);
        }
        signers.push_back(new_signer.clone());
        set_signers(&env, &signers);

        SignerAdded { signer: new_signer }.publish(&env);
    }

    /// Removes an existing signer.
    ///
    /// The current threshold must authorize this change.
    ///
    /// # Auto-adjustment
    /// If removing `signer` makes `threshold > signers.len()`, the threshold
    /// is automatically lowered to `signers.len()` to keep the account usable.
    /// A `ThresholdAutoAdjusted` event is emitted in that case.
    ///
    /// # Errors
    /// * `NotASigner` if the public key is not in the set.
    /// * `NoSigners` if `signer` is the last one (cannot brick the account).
    pub fn remove_signer(env: Env, signer: BytesN<32>) {
        extend_instance_ttl(&env);
        env.current_contract_address().require_auth();

        let signers = get_signers(&env);
        if !signers.contains(&signer) {
            panic_with_error!(&env, GovernanceError::NotASigner);
        }

        let mut new_signers = Vec::new(&env);
        for s in signers.iter() {
            if s != signer {
                new_signers.push_back(s);
            }
        }

        if new_signers.is_empty() {
            panic_with_error!(&env, GovernanceError::NoSigners);
        }

        set_signers(&env, &new_signers);
        SignerRemoved {
            signer: signer.clone(),
        }
        .publish(&env);

        let current_threshold = get_threshold(&env);
        if current_threshold > new_signers.len() {
            let new_threshold = new_signers.len();
            set_threshold(&env, new_threshold);
            ThresholdAutoAdjusted {
                old_threshold: current_threshold,
                new_threshold,
            }
            .publish(&env);
        }
    }

    /// Updates the threshold.
    ///
    /// The current threshold must authorize this change.
    ///
    /// # Errors
    /// * `InvalidThreshold` if `new_threshold` is 0 or greater than the
    ///   current number of signers.
    pub fn update_threshold(env: Env, new_threshold: u32) {
        extend_instance_ttl(&env);
        env.current_contract_address().require_auth();

        let signers = get_signers(&env);
        if new_threshold == 0 || new_threshold > signers.len() {
            panic_with_error!(&env, GovernanceError::InvalidThreshold);
        }

        let old_threshold = get_threshold(&env);
        set_threshold(&env, new_threshold);

        ThresholdUpdated {
            old_threshold,
            new_threshold,
        }
        .publish(&env);
    }
}

/// Internal verification routine shared by `verify_signatures` and
/// `__check_auth`.
///
/// Panics if any provided signature is cryptographically invalid for the
/// payload. That is the SDK's `ed25519_verify` behavior and it is the
/// intended fail-fast semantics: a client that submits a broken signature
/// has a bug, and the entire transaction should revert.
fn verify_signatures_inner(
    env: Env,
    payload_bytes: Bytes,
    signatures: Vec<SignerProof>,
    signers: Vec<BytesN<32>>,
    threshold: u32,
) -> Result<(), GovernanceError> {
    let mut valid_count: u32 = 0;
    let mut seen: Vec<BytesN<32>> = Vec::new(&env);

    for proof in signatures.iter() {
        if seen.contains(&proof.public_key) {
            continue;
        }
        if !signers.contains(&proof.public_key) {
            continue;
        }

        env.crypto().ed25519_verify(
            &proof.public_key,
            &payload_bytes,
            &proof.signature,
        );

        seen.push_back(proof.public_key);
        valid_count += 1;
    }

    if valid_count < threshold {
        return Err(GovernanceError::ThresholdNotMet);
    }
    Ok(())
}

#[contractimpl]
impl CustomAccountInterface for GovernanceAccountContract {
    type Error = GovernanceError;
    type Signature = Vec<SignerProof>;

    fn __check_auth(
        env: Env,
        signature_payload: Hash<32>,
        signatures: Vec<SignerProof>,
        _auth_contexts: Vec<Context>,
    ) -> Result<(), Self::Error> {
        let arr = signature_payload.to_array();
        let payload_bytes = Bytes::from_slice(&env, &arr);
        let signers = get_signers(&env);
        let threshold = get_threshold(&env);
        verify_signatures_inner(env, payload_bytes, signatures, signers, threshold)
    }
}
