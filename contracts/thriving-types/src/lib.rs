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

/// Defines the shared error codes used across all smart contracts in the workspace.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    /// The caller is not authorized to perform the operation.
    Unauthorized = 1,
    /// The requested nonprofit profile does not exist.
    NonprofitNotFound = 2,
    /// The nonprofit is not in an approved state.
    NonprofitNotApproved = 3,
    /// The nonprofit is already registered in the system.
    NonprofitAlreadyRegistered = 4,
    /// The campaign does not exist.
    CampaignNotFound = 5,
    /// The campaign is not active.
    CampaignNotActive = 6,
    /// The target amount has not been reached.
    TargetNotReached = 7,
    /// Evidence has not been submitted for the milestone.
    EvidenceNotSubmitted = 8,
    /// The requested release has already been executed.
    AlreadyReleased = 9,
    /// Insufficient funds for the operation.
    InsufficientFunds = 10,
    /// The target amount must be strictly greater than zero.
    InvalidAmount = 11,
    /// The deadline must be a timestamp in the future.
    InvalidDeadline = 12,
    /// The milestone percentage must be between 1 and 100.
    InvalidMilestonePercentage = 13,
}

/// The default percentage of funds released immediately upon reaching the target amount.
pub const DEFAULT_MILESTONE_PERCENTAGE: u32 = 50;
