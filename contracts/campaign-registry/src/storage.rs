use protocol_types::Campaign;
use soroban_sdk::{contracttype, Address, Env};

/// Storage keys for the Campaign Registry contract.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Current admin address. Can be an EOA (`G...`) or a smart account (`C...`).
    Admin,
    /// Address proposed as the next admin (pending acceptance).
    PendingAdmin,
    /// Address of the Nonprofit Registry contract.
    NonprofitRegistry,
    /// Next campaign ID to assign.
    NextCampaignId,
    /// Per-campaign metadata.
    Campaign(u64),
}

const INSTANCE_TTL_THRESHOLD: u32 = 518_400; // ~30 days
const INSTANCE_TTL_EXTEND_TO: u32 = 1_036_800; // ~60 days
const PERSISTENT_TTL_THRESHOLD: u32 = 518_400;
const PERSISTENT_TTL_EXTEND_TO: u32 = 1_036_800;

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

// --- Nonprofit Registry ---

pub fn set_nonprofit_registry(env: &Env, registry: &Address) {
    env.storage()
        .instance()
        .set(&DataKey::NonprofitRegistry, registry);
}

pub fn get_nonprofit_registry(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::NonprofitRegistry)
}

// --- Campaign IDs ---

pub fn get_next_campaign_id(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get(&DataKey::NextCampaignId)
        .unwrap_or(1)
}

pub fn increment_campaign_id(env: &Env) {
    let next = get_next_campaign_id(env) + 1;
    env.storage().instance().set(&DataKey::NextCampaignId, &next);
}

// --- Campaigns ---

pub fn save_campaign(env: &Env, campaign_id: u64, campaign: &Campaign) {
    let key = DataKey::Campaign(campaign_id);
    env.storage().persistent().set(&key, campaign);
    env.storage().persistent().extend_ttl(
        &key,
        PERSISTENT_TTL_THRESHOLD,
        PERSISTENT_TTL_EXTEND_TO,
    );
}

/// Retrieves a campaign and extends its TTL on read.
///
/// Reads from frontend simulations do not persist TTL extension, but reads
/// from within submitted transactions (cross-contract calls from the vault)
/// do extend it. Keeping the extension here is defensive and idempotent.
pub fn get_campaign(env: &Env, campaign_id: u64) -> Option<Campaign> {
    let key = DataKey::Campaign(campaign_id);
    if let Some(campaign) = env.storage().persistent().get(&key) {
        env.storage().persistent().extend_ttl(
            &key,
            PERSISTENT_TTL_THRESHOLD,
            PERSISTENT_TTL_EXTEND_TO,
        );
        Some(campaign)
    } else {
        None
    }
}
