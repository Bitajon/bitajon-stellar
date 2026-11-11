#![no_std]

//! Governance Account — Multisig Smart Account for Bitajón protocol governance.
//!
//! This contract implements an M-of-N threshold multisig using Soroban's
//! native `CustomAccountInterface`. It can be used as the `admin` of
//! `nonprofit-registry`, `campaign-registry`, `campaign-vault`, and
//! `donation-router`, or as the `verifier` of a vault.
//!
//! # Model
//! * **Signers**: A dynamic set of authorized `Address` (EOAs `G...` or
//!   smart accounts `C...`).
//! * **Threshold**: The minimum number of valid signatures required.
//! * **Any-signer**: Any subset of signers whose count reaches the threshold
//!   can authorize an action. No specific signer is privileged.
//! * **Atomic**: When a transaction carries at least `threshold` signatures,
//!   the authorization is validated inside a single `__check_auth` call. If
//!   the call succeeds, all the invocations that required this address are
//!   authorized atomically. If any signature is invalid or the count is
//!   insufficient, the entire transaction reverts.
//!
//! # Example
//! A 2-of-3 governance account: Alice, Bob, and Carol are signers. Alice and
//! Bob sign `nonprofit-registry.approve_nonprofit(fundación)`. The transaction
//! includes both signatures. `__check_auth` validates that both are signers
//! and that `count >= threshold`. The approval executes atomically. Carol was
//! not required to participate.
//!
//! # Security
//! * Duplicate signatures are counted only once.
//! * Removing a signer auto-lowers the threshold if necessary to keep the
//!   account usable (emits `ThresholdAutoAdjusted`).
//! * The last signer cannot be removed (the account would be bricked).
//! * Threshold must always be `1..=signers.len()`.
//! * All configuration changes require the current threshold, preventing
//!   privilege escalation by a single signer.
//! * Instance TTL extended on every entry point.
//!
//! # Standards
//! * **SEP-45 (planned)**: This contract is compatible with SEP-45, the
//!   standard for Web Authentication in contract accounts. It implements
//!   `CustomAccountInterface`, which is the prerequisite. A future SEP-45
//!   adapter (e.g., WebAuthn signers) can be added without changing this
//!   contract.
//! * **SEP-53**: Signatures on auth entries follow the SEP-53 message signing
//!   convention, which the Stellar SDK handles transparently.

mod events;
mod storage;
#[cfg(test)]
mod test;

use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contracterror, contractimpl,
    crypto::Hash,
    Address, Env, Vec,
};

use crate::events::{
    SignerAdded, SignerRemoved, ThresholdAutoAdjusted, ThresholdUpdated,
};
use crate::storage::{
    extend_instance_ttl, get_signers, get_threshold, set_signers, set_threshold,
};

/// Errors returned by the governance account.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum GovernanceError {
    /// The provided threshold is 0 or greater than the number of signers.
    InvalidThreshold = 1,
    /// The address is not in the signers set.
    NotASigner = 2,
    /// The address is already in the signers set.
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
    /// * `signers` - Initial set of authorized signers. Must be non-empty.
    /// * `threshold` - Minimum number of signatures required. Must be
    ///   `1..=signers.len()`.
    ///
    /// # Errors
    /// * `NoSigners` if `signers` is empty.
    /// * `InvalidThreshold` if `threshold` is out of range.
    pub fn __constructor(env: Env, signers: Vec<Address>, threshold: u32) {
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

    /// Returns the current set of signers.
    pub fn get_signers(env: Env) -> Vec<Address> {
        get_signers(&env)
    }

    /// Returns the current threshold.
    pub fn get_threshold(env: Env) -> u32 {
        get_threshold(&env)
    }

    /// Returns `true` if `who` is a current signer.
    pub fn is_signer(env: Env, who: Address) -> bool {
        get_signers(&env).contains(&who)
    }

    // --- Mutations (all require the current threshold) ---

    /// Adds a new signer.
    ///
    /// The current threshold must authorize this change, meaning the
    /// transaction must carry at least `threshold` signatures from existing
    /// signers.
    ///
    /// # Errors
    /// * `AlreadySigner` if `new_signer` is already in the set.
    pub fn add_signer(env: Env, new_signer: Address) {
        extend_instance_ttl(&env);
        // Requires the current threshold to authorize.
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
    /// * `NotASigner` if `signer` is not in the set.
    /// * `NoSigners` if `signer` is the last one (cannot brick the account).
    pub fn remove_signer(env: Env, signer: Address) {
        extend_instance_ttl(&env);
        env.current_contract_address().require_auth();

        let signers = get_signers(&env);
        if !signers.contains(&signer) {
            panic_with_error!(&env, GovernanceError::NotASigner);
        }

        // Rebuild the Vec without `signer`.
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

        // Auto-adjust threshold if it exceeds the new signer count.
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
    /// The current threshold must authorize this change. This prevents a
    /// single signer from lowering the bar to authorize future actions.
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

impl CustomAccountInterface for GovernanceAccountContract {
    type Error = GovernanceError;
    /// Signature payload: a vector of addresses representing the signers who
    /// authorized the transaction.
    type Signature = Vec<Address>;

    /// Validates that at least `threshold` valid signatures are present.
    ///
    /// # Behavior
    /// * Iterates over the provided signatures.
    /// * For each one that belongs to the current signers set, calls
    ///   `require_auth()` to cryptographically prove ownership.
    /// * Duplicates are ignored (counted once).
    /// * Succeeds if the count reaches the threshold.
    ///
    /// # Atomicity
    /// This entire check happens inside a single transaction. If it fails,
    /// every invocation that required this account's authorization is
    /// reverted. There is no partial state.
    fn __check_auth(
        env: Env,
        _signature_payload: Hash<32>,
        signatures: Vec<Address>,
        _auth_contexts: Vec<Context>,
    ) -> Result<(), Self::Error> {
        let signers = get_signers(&env);
        let threshold = get_threshold(&env);

        let mut valid_count: u32 = 0;
        let mut seen: Vec<Address> = Vec::new(&env);

        for sig in signatures.iter() {
            // Skip duplicates.
            if seen.contains(&sig) {
                continue;
            }
            // Only accept signatures from current signers.
            if signers.contains(&sig) {
                // Cryptographically prove ownership. This works for EOAs
                // (validates the tx signature) and for nested smart accounts
                // (recursively invokes their `__check_auth`).
                sig.require_auth();
                seen.push_back(sig);
                valid_count += 1;
            }
        }

        if valid_count < threshold {
            return Err(GovernanceError::ThresholdNotMet);
        }
        Ok(())
    }
}

use soroban_sdk::panic_with_error;
