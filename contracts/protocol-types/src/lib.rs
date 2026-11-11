#![no_std]

//! Shared domain types, error codes, and constants for the Bitajón protocol.
//!
//! This crate is the single source of truth for all data structures exchanged
//! between contracts, frontend, and off-chain services. Any change to a struct,
//! enum, or error code here propagates atomically to the rest of the workspace.
//!
//! # Design Principles
//! * **Stable discriminants**: Error codes MUST NOT be renumbered. External
//!   consumers (frontend, indexers, monitoring) rely on numeric stability.
//! * **Explicit state**: Every field is documented with its unit and lifecycle.
//! * **No brand coupling**: Types describe the protocol, not the product name.

use soroban_sdk::{contracterror, contracttype, Address, Bytes, String};

/// Lifecycle states of a nonprofit organization within the registry.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum NonprofitStatus {
    /// Registered but not yet approved by the admin.
    Pending,
    /// Approved by the admin and authorized to create campaigns.
    Approved,
    /// Approval revoked; cannot create new campaigns.
    Revoked,
}

/// Verified identity and legal profile of a nonprofit organization.
///
/// # Privacy
/// Personal data (email, RUT) is stored off-chain. On-chain we keep only
/// cryptographic hashes so the profile is verifiable without exposing PII.
/// This aligns with Colombia's Ley 1581 de 2012 (Habeas Data).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NonprofitProfile {
    /// Legal name of the organization.
    pub legal_name: String,
    /// Tax identification number (NIT in Colombia). Public by nature.
    pub tax_id: String,
    /// SHA-256 hash of the RUT document stored off-chain.
    pub rut_hash: Bytes,
    /// SHA-256 hash of the contact email stored off-chain.
    pub email_hash: Bytes,
    /// Whether the organization holds a special tax retention certificate.
    pub retention_certificate: bool,
    /// Whether the organization consented to data processing (Habeas Data).
    pub data_consent: bool,
    /// Current approval state.
    pub status: NonprofitStatus,
}

/// Lifecycle states of a fundraising campaign.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CampaignStatus {
    /// Accepting donations and within the deadline.
    Active,
    /// Target reached and evidence validated; no further actions possible.
    Completed,
    /// Cancelled by the nonprofit before the initial release.
    Cancelled,
}

/// Metadata and financial goal of a fundraising campaign.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Campaign {
    /// Address of the nonprofit that owns the campaign.
    pub nonprofit: Address,
    /// Human-readable campaign name.
    pub name: String,
    /// Description of the campaign's purpose.
    pub description: String,
    /// Geographic location where the campaign operates.
    pub location: String,
    /// Funding goal in the smallest unit of `token_address`.
    ///
    /// **Important**: This amount is expressed in NET terms (what the vault
    /// must accumulate after platform fees). The frontend is responsible for
    /// computing the gross amount the donor must pay.
    pub target_amount: i128,
    /// SEP-41 token used for donations (USDC, EURC, or any SAC).
    pub token_address: Address,
    /// Unix timestamp after which the campaign no longer accepts deposits.
    pub deadline: u64,
    /// Percentage of `target_amount` released upon reaching the goal.
    ///
    /// Must be in `MIN_MILESTONE_PERCENTAGE..=MAX_MILESTONE_PERCENTAGE`
    /// (currently `1..=90`). The upper bound guarantees that at least 10% of
    /// the target remains tied to evidence validation, preserving the
    /// "Payment by Progress" accountability model.
    pub milestone_percentage: u32,
    /// Current lifecycle state.
    pub status: CampaignStatus,
}

/// Custody and release state for a specific campaign's funds.
///
/// Immutable fields (`target_amount`, `deadline`, `token_address`,
/// `milestone_percentage`) are cached at vault creation to eliminate
/// cross-contract calls on the hot path (`deposit`).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VaultState {
    /// ID of the campaign this vault belongs to.
    pub campaign_id: u64,
    /// Address of the nonprofit that receives released funds.
    pub nonprofit: Address,
    /// SEP-41 token held in custody.
    pub token_address: Address,
    /// Campaign goal, cached from the registry.
    pub target_amount: i128,
    /// Campaign deadline, cached from the registry.
    pub deadline: u64,
    /// Percentage released on initial milestone, cached from the registry.
    pub milestone_percentage: u32,
    /// Address authorized to validate evidence and release final funds.
    /// Can be an EOA (`G...`) or a smart account (`C...`).
    pub verifier: Address,
    /// Sum of all net deposits received so far.
    pub total_deposited: i128,
    /// Whether the initial milestone has been released.
    pub initial_release_done: bool,
    /// Hash of the latest evidence submitted by the nonprofit.
    pub evidence_hash: Option<Bytes>,
    /// Whether the final release has been executed.
    pub final_release_done: bool,
    /// Emergency pause flag. When true, deposits are blocked.
    pub paused: bool,
}

/// Shared error codes used across all contracts in the workspace.
///
/// # Stability Contract
/// Error codes **must not be renumbered**. External consumers (frontend,
/// indexers, monitoring dashboards, audit reports) rely on stable numeric
/// discriminants. Gaps in the sequence indicate reserved codes. New codes
/// MUST be appended at the end.
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
    /// The milestone percentage is outside the allowed range
    /// (`MIN_MILESTONE_PERCENTAGE..=MAX_MILESTONE_PERCENTAGE`).
    ///
    /// The upper bound (90%) guarantees that at least 10% of the target
    /// remains tied to evidence validation.
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
    NotAuthorizedRouter = 26,

    // --- Refunds & Governance (27-32) ---
    /// Refund not available: campaign still active or initial release done.
    RefundNotAvailable = 27,
    /// The donor has no contribution to refund.
    NothingToRefund = 28,
    /// Provided evidence hash does not match the stored one.
    InvalidEvidenceHash = 29,
    /// Caller is not the configured verifier.
    NotVerifier = 30,
    /// Caller is not the pending admin.
    NotPendingAdmin = 31,
    /// The vault is paused; deposits are blocked.
    VaultPaused = 32,
}

// --- Milestone constants ---

/// Minimum allowed milestone percentage.
///
/// A value of 1 means the nonprofit receives 1% of `target_amount` when the
/// goal is reached, and 99% upon evidence validation. Low values increase
/// working-capital pressure on nonprofits but maximize evidence-based
/// accountability.
pub const MIN_MILESTONE_PERCENTAGE: u32 = 1;

/// Maximum allowed milestone percentage.
///
/// **At least 10% of `target_amount` MUST remain tied to evidence
/// validation.** Allowing 100% (or even 99%) would reduce the evidence
/// review to a symbolic step with no meaningful financial weight. The 90%
/// cap preserves the core "Payment by Progress" transparency model: a
/// nonprofit that fails to provide acceptable evidence loses a substantive
/// fraction of the funds.
pub const MAX_MILESTONE_PERCENTAGE: u32 = 90;

/// Recommended milestone percentage for new campaigns.
///
/// This is what the frontend should suggest by default. It balances working
/// capital (the nonprofit receives 50% immediately upon reaching the goal)
/// with evidence pressure (50% remains tied to validation). The contract
/// does NOT enforce this value; campaigns can choose any value in
/// `MIN_MILESTONE_PERCENTAGE..=MAX_MILESTONE_PERCENTAGE`.
pub const RECOMMENDED_MILESTONE_PERCENTAGE: u32 = 50;

/// Hard cap for the platform fee (1000 basis points = 10%).
pub const MAX_FEE_BPS: u32 = 1000;
