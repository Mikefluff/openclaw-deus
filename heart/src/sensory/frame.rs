//! SensoryFrame — one unit of sensory input.

use serde::{Deserialize, Serialize};

pub const NUM_CHANNELS: usize = 16;
pub const NUM_SPEECH: usize = 16;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SensoryFrame {
    pub action_id: i32,
    pub object_idx: i32,
    pub channels: [f32; NUM_CHANNELS],
    pub speech: [f32; NUM_SPEECH],
    pub valence: f32,
    pub is_consequence: bool,
}

impl Default for SensoryFrame {
    fn default() -> Self {
        Self {
            action_id: 4,
            object_idx: -1,
            channels: [0.0; NUM_CHANNELS],
            speech: [0.0; NUM_SPEECH],
            valence: 0.0,
            is_consequence: false,
        }
    }
}

/// Sensory channel semantic indices.
pub mod ch {
    pub const POS_X: usize = 0;
    pub const POS_Y: usize = 1;
    pub const POS_Z: usize = 2;
    pub const VEL_X: usize = 3;
    pub const VEL_Y: usize = 4;
    pub const VEL_Z: usize = 5;
    pub const CONTACT_FORCE: usize = 6;
    pub const NEAREST_DIST: usize = 7;
    pub const HARDNESS: usize = 8;
    pub const SMOOTHNESS: usize = 9;
    pub const SOUND: usize = 10;
    pub const DEFORMATION: usize = 11;
    pub const BREAKAGE: usize = 12;
    pub const IS_CONTAINED: usize = 13;
    pub const IS_STACKED: usize = 14;
    pub const AGENT_DIST: usize = 15;
}
