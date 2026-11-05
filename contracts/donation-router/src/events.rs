use soroban_sdk::{contractevent, Address};

/// Emitted on every successful donation routed through this contract.
#[contractevent]
pub struct DonationRouted {
    #[topic]
    pub campaign_id: u64,
    pub donor: Address,
    pub gross_amount: i128,
    pub fee_amount: i128,
    pub net_amount: i128,
}

/// Emitted when the platform fee is updated.
#[contractevent]
pub struct FeeBpsUpdated {
    pub old_fee_bps: u32,
    pub new_fee_bps: u32,
}

/// Emitted when the treasury address is updated.
#[contractevent]
pub struct TreasuryUpdated {
    pub old_treasury: Address,
    pub new_treasury: Address,
}
