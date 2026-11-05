#![no_std]

//! Shared domain types, error codes, and constants for the Thriving Stellar ecosystem.
//! This crate is designed to be imported by contracts and interfaces to ensure
//! consistent data representation across the protocol.

use soroban_sdk::{contracterror, contracttype, Address, Bytes, String};

/// Defines the lifecycle states of a nonprofit organization within the registry.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum NonprofitStatus {
    Pending,
    Approved,
    Revoked,
}

/// Represents the verified identity and legal profile of a nonprofit organization.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NonprofitProfile {
    pub legal_name: String,
    pub tax_id: String,
    pub rut_hash: Bytes,
    pub retention_certificate: bool,
    pub email: String,
    pub data_consent: bool,
    pub status: NonprofitStatus,
}

/// Defines the lifecycle states of a fundraising campaign.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CampaignStatus {
    Active,
    Completed,
    Cancelled,
}

/// Represents the metadata and financial goal of a specific fundraising campaign.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Campaign {
    pub nonprofit: Address,
    pub name: String,
    pub description: String,
    pub location: String,
    pub target_amount: i128,
    pub token_address: Address,
    pub deadline: u64,
    pub milestone_percentage: u32,
    pub status: CampaignStatus,
}

/// Defines the custody and release state for a specific campaign's funds.
///
/// Immutable fields (`target_amount`, `deadline`, `token_address`) are cached
/// at vault creation to avoid repeated cross-contract calls on the hot path
/// (`deposit`).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VaultState {
    pub campaign_id: u64,
    pub nonprofit: Address,
    pub token_address: Address,
    pub target_amount: i128,
    pub deadline: u64,
    pub total_deposited: i128,
    pub initial_release_done: bool,
    pub evidence_hash: Option<Bytes>,
    pub final_release_done: bool,
}

/// Defines the shared error codes used across all smart contracts in the workspace.
///
/// Error codes **must not be renumbered**: external consumers (frontend, indexers,
/// monitoring, audit reports) rely on stable discriminants. Gaps in the sequence
/// indicate reserved codes. New codes MUST be appended at the end.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    // --- Authorization & Identity (1-4) ---
    Unauthorized = 1,
    NonprofitNotFound = 2,
    NonprofitNotApproved = 3,
    NonprofitAlreadyRegistered = 4,

    // --- Campaign Lifecycle (5-6, 8) ---
    CampaignNotFound = 5,
    CampaignNotActive = 6,
    // 7: reserved
    EvidenceNotSubmitted = 8,
    // 9: reserved
    // 10: reserved

    // --- Input Validation (11-13) ---
    InvalidAmount = 11,
    InvalidDeadline = 12,
    InvalidMilestonePercentage = 13,
    // 14: reserved

    // --- Vault Release State (16, 18) ---
    // 15: reserved
    FinalAlreadyReleased = 16,
    // 17: reserved
    NotVaultAdmin = 18,

    // --- Vault-Specific (19-26) ---
    DepositExceedsTarget = 19,
    CampaignAlreadyExists = 20,
    InitialReleaseNotDone = 21,
    CampaignExpired = 22,
    VaultFinalized = 23,
    InvalidEvidence = 24,
    InvalidFeeBps = 25,
    /// The vault is configured with an `authorized_router` and the immediate
    /// caller is not that router. Direct deposits are rejected.
    NotAuthorizedRouter = 26,
}

/// The default percentage of funds released immediately upon reaching the target amount.
pub const DEFAULT_MILESTONE_PERCENTAGE: u32 = 50;

/// Maximum allowed fee in basis points (1000 bps = 10%).
/// Hard cap to prevent governance abuse.
pub const MAX_FEE_BPS: u32 = 1000;
