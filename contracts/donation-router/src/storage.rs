use soroban_sdk::{contracttype, Address, Env};

/// Storage keys for the Donation Router.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Current admin. Can be an EOA (`G...`) or a smart account (`C...`).
    Admin,
    /// Address proposed as the next admin (pending acceptance).
    PendingAdmin,
    /// Treasury address that receives platform fees.
    Treasury,
    /// Platform fee in basis points (1 bps = 0.01%).
    FeeBps,
    /// Address of the Campaign Vault contract.
    CampaignVault,
}

const INSTANCE_TTL_THRESHOLD: u32 = 518_400; // ~30 days
const INSTANCE_TTL_EXTEND_TO: u32 = 1_036_800; // ~60 days

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

// --- Treasury ---

pub fn set_treasury(env: &Env, treasury: &Address) {
    env.storage().instance().set(&DataKey::Treasury, treasury);
}

pub fn get_treasury(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::Treasury)
}

// --- Fee ---

pub fn set_fee_bps(env: &Env, fee_bps: u32) {
    env.storage().instance().set(&DataKey::FeeBps, &fee_bps);
}

pub fn get_fee_bps(env: &Env) -> u32 {
    env.storage().instance().get(&DataKey::FeeBps).unwrap_or(0)
}

// --- Campaign Vault ---

pub fn set_campaign_vault(env: &Env, vault: &Address) {
    env.storage().instance().set(&DataKey::CampaignVault, vault);
}

pub fn get_campaign_vault(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::CampaignVault)
}
