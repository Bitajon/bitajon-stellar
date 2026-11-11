use soroban_sdk::{contracttype, BytesN, Env, Vec};

/// Storage keys for the Governance Account.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Set of Ed25519 public keys authorized to sign.
    Signers,
    /// Minimum number of valid signatures required to authorize an action.
    Threshold,
}

const INSTANCE_TTL_THRESHOLD: u32 = 518_400; // ~30 days
const INSTANCE_TTL_EXTEND_TO: u32 = 1_036_800; // ~60 days

/// Extends the contract instance TTL to prevent archival during quiet periods.
///
/// Critical for a smart account: if the instance is archived, no
/// `require_auth()` call from other contracts can be validated, and the
/// governance account becomes temporarily unusable until restored.
pub fn extend_instance_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
}

pub fn set_signers(env: &Env, signers: &Vec<BytesN<32>>) {
    env.storage().instance().set(&DataKey::Signers, signers);
}

pub fn get_signers(env: &Env) -> Vec<BytesN<32>> {
    env.storage()
        .instance()
        .get(&DataKey::Signers)
        .expect("signers not initialized")
}

pub fn set_threshold(env: &Env, threshold: u32) {
    env.storage().instance().set(&DataKey::Threshold, &threshold);
}

pub fn get_threshold(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::Threshold)
        .expect("threshold not initialized")
}
