use soroban_sdk::{contracttype, Address, Env};
use thriving_types::Campaign;

/// Storage keys for the Campaign Registry contract.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// The admin address authorized to manage the registry.
    Admin,
    /// The address of the Nonprofit Registry contract.
    NonprofitRegistry,
    /// The next campaign ID to be assigned.
    NextCampaignId,
    /// Mapping from campaign ID to campaign metadata.
    Campaign(u64),
}

/// TTL constants for persistent storage entries (campaigns).
/// Approximately 30 days at 5-second ledger close time.
const PERSISTENT_TTL_THRESHOLD: u32 = 518_400;
const PERSISTENT_TTL_EXTEND_TO: u32 = 1_036_800;

/// TTL constants for the contract instance.
const INSTANCE_TTL_THRESHOLD: u32 = 518_400;
const INSTANCE_TTL_EXTEND_TO: u32 = 1_036_800;

/// Extends the TTL of the contract instance to prevent archival during inactivity.
pub fn extend_instance_ttl(env: &Env) {
    env.storage().instance().extend_ttl(
        INSTANCE_TTL_THRESHOLD,
        INSTANCE_TTL_EXTEND_TO,
    );
}

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}

pub fn get_admin(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::Admin)
}

pub fn set_nonprofit_registry(env: &Env, registry: &Address) {
    env.storage().instance().set(&DataKey::NonprofitRegistry, registry);
}

pub fn get_nonprofit_registry(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::NonprofitRegistry)
}

pub fn get_next_campaign_id(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get(&DataKey::NextCampaignId)
        .unwrap_or(1)
}

pub fn increment_campaign_id(env: &Env) {
    let next_id = get_next_campaign_id(env) + 1;
    env.storage().instance().set(&DataKey::NextCampaignId, &next_id);
}

pub fn save_campaign(env: &Env, campaign_id: u64, campaign: &Campaign) {
    let key = DataKey::Campaign(campaign_id);
    env.storage().persistent().set(&key, campaign);
    env.storage().persistent().extend_ttl(
        &key,
        PERSISTENT_TTL_THRESHOLD,
        PERSISTENT_TTL_EXTEND_TO,
    );
}

/// Retrieves a campaign and extends its TTL to prevent archival on read.
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
