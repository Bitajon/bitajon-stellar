use protocol_types::VaultState;
use soroban_sdk::{contracttype, Address, Env};

/// Storage keys for the Campaign Vault contract.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Admin address (can be an EOA `G...` or a smart account `C...`).
    Admin,
    /// Address proposed as the next admin (pending acceptance).
    PendingAdmin,
    /// Address of the Campaign Registry contract.
    CampaignRegistry,
    /// Authorized donation router, if any. When set, `deposit` requires
    /// the router's authorization.
    AuthorizedRouter,
    /// Per-campaign custody state.
    Vault(u64),
    /// Net contribution of a specific donor to a specific campaign.
    /// Used for pull-based refunds (H1). Stored as a single i128 per
    /// (campaign, donor) pair, not a Vec, so deposit cost is O(1).
    Contribution(u64, Address),
}

const PERSISTENT_TTL_THRESHOLD: u32 = 518_400; // ~30 days
const PERSISTENT_TTL_EXTEND_TO: u32 = 1_036_800; // ~60 days
const INSTANCE_TTL_THRESHOLD: u32 = 518_400;
const INSTANCE_TTL_EXTEND_TO: u32 = 1_036_800;

/// Extends the contract instance TTL to prevent archival during quiet periods.
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

// --- Campaign Registry ---

pub fn set_campaign_registry(env: &Env, registry: &Address) {
    env.storage()
        .instance()
        .set(&DataKey::CampaignRegistry, registry);
}

pub fn get_campaign_registry(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::CampaignRegistry)
}

// --- Authorized Router ---

pub fn set_authorized_router(env: &Env, router: &Address) {
    env.storage()
        .instance()
        .set(&DataKey::AuthorizedRouter, router);
}

pub fn clear_authorized_router(env: &Env) {
    env.storage().instance().remove(&DataKey::AuthorizedRouter);
}

pub fn get_authorized_router(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::AuthorizedRouter)
}

// --- Vault state ---

pub fn save_vault_state(env: &Env, campaign_id: u64, state: &VaultState) {
    let key = DataKey::Vault(campaign_id);
    env.storage().persistent().set(&key, state);
    env.storage().persistent().extend_ttl(
        &key,
        PERSISTENT_TTL_THRESHOLD,
        PERSISTENT_TTL_EXTEND_TO,
    );
}

pub fn get_vault_state(env: &Env, campaign_id: u64) -> Option<VaultState> {
    let key = DataKey::Vault(campaign_id);
    if let Some(state) = env.storage().persistent().get(&key) {
        env.storage().persistent().extend_ttl(
            &key,
            PERSISTENT_TTL_THRESHOLD,
            PERSISTENT_TTL_EXTEND_TO,
        );
        Some(state)
    } else {
        None
    }
}

// --- Contributions (for pull refunds) ---

/// Returns the net contribution of a donor to a campaign, or `0` if none.
/// Extends the TTL on read to keep the record alive.
pub fn get_contribution(env: &Env, campaign_id: u64, donor: &Address) -> i128 {
    let key = DataKey::Contribution(campaign_id, donor.clone());
    if let Some(amount) = env.storage().persistent().get(&key) {
        env.storage().persistent().extend_ttl(
            &key,
            PERSISTENT_TTL_THRESHOLD,
            PERSISTENT_TTL_EXTEND_TO,
        );
        amount
    } else {
        0
    }
}

/// Persists a donor's contribution for a campaign.
pub fn set_contribution(env: &Env, campaign_id: u64, donor: &Address, amount: i128) {
    let key = DataKey::Contribution(campaign_id, donor.clone());
    env.storage().persistent().set(&key, &amount);
    env.storage().persistent().extend_ttl(
        &key,
        PERSISTENT_TTL_THRESHOLD,
        PERSISTENT_TTL_EXTEND_TO,
    );
}
