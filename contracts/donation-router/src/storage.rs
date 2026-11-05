use soroban_sdk::{contracttype, Address, Env};

/// Storage keys for the Donation Router contract.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// The admin address authorized to update fee and treasury.
    Admin,
    /// The treasury address where platform fees are routed.
    Treasury,
    /// Platform fee in basis points (1 bps = 0.01%).
    FeeBps,
    /// The address of the Campaign Vault contract.
    CampaignVault,
}

const INSTANCE_TTL_THRESHOLD: u32 = 518_400;
const INSTANCE_TTL_EXTEND_TO: u32 = 1_036_800;

pub fn extend_instance_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
}

pub fn write_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}

pub fn read_admin(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::Admin)
}

pub fn write_treasury(env: &Env, treasury: &Address) {
    env.storage().instance().set(&DataKey::Treasury, treasury);
}

pub fn read_treasury(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::Treasury)
}

pub fn write_fee_bps(env: &Env, fee_bps: u32) {
    env.storage().instance().set(&DataKey::FeeBps, &fee_bps);
}

pub fn read_fee_bps(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::FeeBps)
        .unwrap_or(0)
}

pub fn write_campaign_vault(env: &Env, vault: &Address) {
    env.storage().instance().set(&DataKey::CampaignVault, vault);
}

pub fn read_campaign_vault(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::CampaignVault)
}
