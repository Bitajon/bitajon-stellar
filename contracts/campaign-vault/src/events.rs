use soroban_sdk::{contractevent, Address, Bytes};

/// Emitted when a new vault is created for a campaign.
#[contractevent]
pub struct VaultCreated {
    #[topic]
    pub campaign_id: u64,
    pub nonprofit: Address,
    pub token_address: Address,
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

/// Emitted when the initial 50% is released to the nonprofit.
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

/// Emitted when the final 50% is released to the nonprofit.
#[contractevent]
pub struct FinalFundsReleased {
    #[topic]
    pub campaign_id: u64,
    pub nonprofit: Address,
    pub amount: i128,
}

/// Emitted when the admin updates the authorized router configuration.
/// A `None` value means the vault is in open mode (direct deposits allowed).
#[contractevent]
pub struct AuthorizedRouterUpdated {
    pub authorized_router: Option<Address>,
}
