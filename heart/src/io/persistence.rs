//! Persistence trait — abstracts DB backend.

use crate::core::state::Snapshot;
use crate::core::config::HeartConfig;
use crate::error::PersistenceError;

#[async_trait::async_trait]
pub trait Persistence: Send + Sync {
    async fn load_config(&self) -> Result<HeartConfig, PersistenceError>;
    async fn load_initial_state(&self) -> Result<InitialDbState, PersistenceError>;
    async fn sync_snapshot(&self, snapshot: &Snapshot) -> Result<(), PersistenceError>;
}

#[derive(Debug, Default)]
pub struct InitialDbState {
    pub cycle: u64,
    pub energy: f64,
    pub fatigue: f64,
}
