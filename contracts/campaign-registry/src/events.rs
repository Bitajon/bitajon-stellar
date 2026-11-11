use soroban_sdk::{contractevent, Address, String};

/// Emitted when a new campaign is created.
#[contractevent]
pub struct CampaignCreated {
    #[topic]
    pub campaign_id: u64,
    pub nonprofit: Address,
    pub name: String,
    pub target_amount: i128,
}

/// Emitted when a campaign is cancelled by its nonprofit.
#[contractevent]
pub struct CampaignCancelled {
    #[topic]
    pub campaign_id: u64,
    pub nonprofit: Address,
}

/// Emitted when the current admin proposes a successor.
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
