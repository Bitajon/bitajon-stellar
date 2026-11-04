use soroban_sdk::{contractevent, Address, String};

/// Emitted when a new nonprofit is registered in a pending state.
#[contractevent]
pub struct NonprofitRegistered {
    #[topic]
    pub nonprofit: Address,
    pub legal_name: String,
}

/// Emitted when a nonprofit is approved by the admin.
#[contractevent]
pub struct NonprofitApproved {
    #[topic]
    pub nonprofit: Address,
}

/// Emitted when a nonprofit is revoked by the admin.
#[contractevent]
pub struct NonprofitRevoked {
    #[topic]
    pub nonprofit: Address,
}
