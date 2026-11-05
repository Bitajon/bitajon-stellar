use soroban_sdk::{contracttype, Address, Env};
use thriving_types::VaultState;

/// Storage keys for the Campaign Vault contract.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// The admin address authorized to validate evidence and release final funds.
    Admin,
    /// The address of the Campaign Registry contract.
    CampaignRegistry,
    /// The address of the authorized donation router, if configured.
    /// When set, `deposit` requires `router.require_auth()`.
    AuthorizedRouter,
    /// Mapping from campaign ID to its vault state.
    Vault(u64),
}

const PERSISTENT_TTL_THRESHOLD: u32 = 518_400; // ~30 days
const PERSISTENT_TTL_EXTEND_TO: u32 = 1_036_800; // ~60 days
const INSTANCE_TTL_THRESHOLD: u32 = 518_400;
const INSTANCE_TTL_EXTEND_TO: u32 = 1_036_800;

pub fn extend_instance_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
}

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}

pub fn get_admin(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::Admin)
}

pub fn set_campaign_registry(env: &Env, registry: &Address) {
    env.storage()
        .instance()
        .set(&DataKey::CampaignRegistry, registry);
}

pub fn get_campaign_registry(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::CampaignRegistry)
}

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
