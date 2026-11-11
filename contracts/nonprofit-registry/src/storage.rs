use protocol_types::NonprofitProfile;
use soroban_sdk::{contracttype, Address, Env};

/// Storage keys for the Nonprofit Registry contract.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Current admin address. Can be an EOA (`G...`) or a smart account (`C...`).
    Admin,
    /// Address proposed as the next admin (pending acceptance).
    PendingAdmin,
    /// Per-nonprofit legal profile.
    Profile(Address),
}

const INSTANCE_TTL_THRESHOLD: u32 = 518_400; // ~30 days
const INSTANCE_TTL_EXTEND_TO: u32 = 1_036_800; // ~60 days
const PERSISTENT_TTL_THRESHOLD: u32 = 518_400;
const PERSISTENT_TTL_EXTEND_TO: u32 = 1_036_800;

/// Extends the contract instance TTL to prevent archival during quiet periods.
///
/// Called on every entry point. This is the only way to keep the contract
/// callable if no mutations happen for a long time (e.g., a nonprofit that
/// nobody touches for months).
pub fn extend_instance_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
}

// --- Admin management ---

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}

pub fn get_admin(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::Admin)
}

pub fn set_pending_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::PendingAdmin, admin);
}

pub fn get_pending_admin(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::PendingAdmin)
}

pub fn clear_pending_admin(env: &Env) {
    env.storage().instance().remove(&DataKey::PendingAdmin);
}

// --- Profiles ---

pub fn has_profile(env: &Env, nonprofit: &Address) -> bool {
    env.storage()
        .persistent()
        .has(&DataKey::Profile(nonprofit.clone()))
}

pub fn save_profile(env: &Env, nonprofit: &Address, profile: &NonprofitProfile) {
    let key = DataKey::Profile(nonprofit.clone());
    env.storage().persistent().set(&key, profile);
    env.storage().persistent().extend_ttl(
        &key,
        PERSISTENT_TTL_THRESHOLD,
        PERSISTENT_TTL_EXTEND_TO,
    );
}

/// Retrieves a profile and extends its TTL on read.
///
/// Reading without extending would let active profiles expire if nobody
/// mutates them. Since reads are cheap and TTL extension is idempotent,
/// this is the safest default.
pub fn get_profile(env: &Env, nonprofit: &Address) -> Option<NonprofitProfile> {
    let key = DataKey::Profile(nonprofit.clone());
    if let Some(profile) = env.storage().persistent().get(&key) {
        env.storage().persistent().extend_ttl(
            &key,
            PERSISTENT_TTL_THRESHOLD,
            PERSISTENT_TTL_EXTEND_TO,
        );
        Some(profile)
    } else {
        None
    }
}
