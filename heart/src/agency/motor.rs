//! Motor command — what brain outputs to the world.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MotorCommand {
    pub action_id: u8,
    pub target_object: Option<i32>,
}
