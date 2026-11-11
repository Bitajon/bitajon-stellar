use soroban_sdk::{contractevent, Address, Bytes};

/// Emitted when a new vault is created for a campaign.
#[contractevent]
pub struct VaultCreated {
    #[topic]
    pub campaign_id: u64,
    pub nonprofit: Address,
    pub token_address: Address,
    pub verifier: Address,
}

/// Emitted when a donation is deposited into a campaign's vault.
#[contractevent]
pub struct DonationDeposited {
    #[topic]
    pub campaign_id: u64,
    pub donor: Address,
    pub amount: i128,
    pub total_deposited: i128,
}

/// Emitted when the initial milestone (the configured percentage of
/// `target_amount`) is released to the nonprofit upon reaching the goal.
#[contractevent]
pub struct InitialFundsReleased {
    #[topic]
    pub campaign_id: u64,
    pub nonprofit: Address,
    pub amount: i128,
}

/// Emitted when evidence is submitted for the final milestone.
#[contractevent]
pub struct EvidenceSubmitted {
    #[topic]
    pub campaign_id: u64,
    pub nonprofit: Address,
    pub evidence_hash: Bytes,
}

/// Emitted when the final balance (target minus the initial milestone) is
/// released to the nonprofit after evidence validation.
#[contractevent]
pub struct FinalFundsReleased {
    #[topic]
    pub campaign_id: u64,
    pub nonprofit: Address,
    pub amount: i128,
}

/// Emitted when a donor claims a refund after a campaign expires or is
/// cancelled without reaching the initial milestone.
#[contractevent]
pub struct RefundClaimed {
    #[topic]
    pub campaign_id: u64,
    pub donor: Address,
    pub amount: i128,
}

/// Emitted when the admin configures or clears the authorized router.
#[contractevent]
pub struct AuthorizedRouterUpdated {
    pub authorized_router: Option<Address>,
}

/// Emitted when the admin pauses a vault (emergency brake).
#[contractevent]
pub struct VaultPaused {
    #[topic]
    pub campaign_id: u64,
}

/// Emitted when the admin unpauses a vault.
#[contractevent]
pub struct VaultUnpaused {
    #[topic]
    pub campaign_id: u64,
}

/// Emitted when the admin changes the verifier of a campaign.
#[contractevent]
pub struct VerifierUpdated {
    #[topic]
    pub campaign_id: u64,
    pub new_verifier: Address,
}

/// Emitted when the current admin proposes a new admin.
#[contractevent]
pub struct AdminProposed {
    pub current: Address,
    pub proposed: Address,
}

/// Emitted when the proposed admin accepts the role.
#[contractevent]
pub struct AdminAccepted {
    pub new_admin: Address,
}
