use soroban_sdk::{contractevent, BytesN};

/// Emitted when a new signer is added.
#[contractevent]
pub struct SignerAdded {
    #[topic]
    pub signer: BytesN<32>,
}

/// Emitted when a signer is removed.
#[contractevent]
pub struct SignerRemoved {
    #[topic]
    pub signer: BytesN<32>,
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
