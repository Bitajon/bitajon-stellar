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

/// Emitted when a campaign is cancelled.
#[contractevent]
pub struct CampaignCancelled {
    #[topic]
    pub campaign_id: u64,
    pub nonprofit: Address,
}
