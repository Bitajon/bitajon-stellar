use soroban_sdk::{contractevent, Address};

/// Emitted when a new signer is added to the governance account.
#[contractevent]
pub struct SignerAdded {
    #[topic]
    pub signer: Address,
}

/// Emitted when a signer is removed from the governance account.
#[contractevent]
pub struct SignerRemoved {
    #[topic]
    pub signer: Address,
}

/// Emitted when the threshold is updated.
#[contractevent]
pub struct ThresholdUpdated {
    pub old_threshold: u32,
    pub new_threshold: u32,
}

/// Emitted when removing a signer forced the threshold to be lowered
/// automatically (to keep the account usable).
#[contractevent]
pub struct ThresholdAutoAdjusted {
    pub old_threshold: u32,
    pub new_threshold: u32,
}
