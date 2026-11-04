use soroban_sdk::{contracttype, Address, Env};
use thriving_types::NonprofitProfile;

/// Storage keys for the Nonprofit Registry contract.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Profile(Address),
}

/// The default TTL threshold for persistent storage entries (in ledgers).
/// Approximately 30 days at 5-second ledger close time.
const PERSISTENT_TTL_THRESHOLD: u32 = 518_400;
/// The default TTL extension for persistent storage entries.
const PERSISTENT_TTL_EXTEND_TO: u32 = 1_036_800;

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}

pub fn get_admin(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::Admin)
}

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

pub fn get_profile(env: &Env, nonprofit: &Address) -> Option<NonprofitProfile> {
    env.storage()
        .persistent()
        .get(&DataKey::Profile(nonprofit.clone()))
}
