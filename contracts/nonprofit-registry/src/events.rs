use soroban_sdk::{contractevent, Address, String};

/// Emitted when a nonprofit registers its profile in a pending state.
#[contractevent]
pub struct NonprofitRegistered {
    #[topic]
    pub nonprofit: Address,
    pub legal_name: String,
}

/// Emitted when the admin approves a nonprofit.
#[contractevent]
pub struct NonprofitApproved {
    #[topic]
    pub nonprofit: Address,
}

/// Emitted when the admin revokes a previously approved nonprofit.
#[contractevent]
pub struct NonprofitRevoked {
    #[topic]
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
