//! Sensory encoder/decoder — abstracted for future Unreal Engine.
//!
//! Traits define the interface. Default impl: built-in rapier3d world.
//! Future: gRPC/WebSocket adapter for UE5 sends same SensoryFrame.

use serde::{Deserialize, Serialize};

/// 16 sensory channels — what brain receives.
/// Channels 0-12: spatial/physical. 13-15: relational/meta.
pub const NUM_CHANNELS: usize = 16;

/// 16 speech channels — phonetic encoding.
pub const NUM_SPEECH: usize = 16;

/// One frame of sensory input.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SensoryFrame {
    /// Action that produced this frame (-1 = speech event, 0-5 = physical action)
    pub action_id: i32,
    /// Which object this frame is about
    pub object_idx: i32,
    /// Sensory channels
    pub channels: [f32; NUM_CHANNELS],
    /// Speech channels (phonetic encoding)
    pub speech: [f32; NUM_SPEECH],
    /// World-computed valence (pleasure/pain)
    pub valence: f32,
    /// Is this a consequence of brain's action?
    pub is_consequence: bool,
}

impl Default for SensoryFrame {
    fn default() -> Self {
        Self {
            action_id: 4, // look
            object_idx: -1,
            channels: [0.0; NUM_CHANNELS],
            speech: [0.0; NUM_SPEECH],
            valence: 0.0,
            is_consequence: false,
        }
    }
}

/// Motor command — what brain outputs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MotorCommand {
    /// Action ID (0-5)
    pub action_id: u8,
    /// Target object (if known)
    pub target_object: Option<i32>,
}

/// Channel indices — semantic meaning of each sensory channel.
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

/// Encode Russian text to speech channels (same encoding as TS version).
pub fn encode_speech(text: &str) -> [f32; NUM_SPEECH] {
    let mut out = [0.0f32; NUM_SPEECH];
    for (i, ch) in text.chars().take(NUM_SPEECH).enumerate() {
        let cp = ch as u32;
        if (0x0430..=0x044f).contains(&cp) {
            out[i] = (cp - 0x0430 + 1) as f32 / 32.0;
        }
    }
    out
}

/// Trait for sensory input source (world).
/// Implement for: rapier3d world, UE5 adapter, test harness.
pub trait SensorySource {
    /// Advance world by one tick, return ambient sensory frames.
    fn tick(&mut self) -> Vec<SensoryFrame>;

    /// Execute a motor command in the world, return consequence frame.
    fn act(&mut self, cmd: &MotorCommand) -> SensoryFrame;

    /// Get world snapshot for dashboard.
    fn snapshot(&self) -> WorldSnapshot;
}

/// Snapshot for dashboard visualization.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorldSnapshot {
    pub objects: Vec<ObjectState>,
    pub relations: Vec<Relation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObjectState {
    pub idx: i32,
    pub name: String,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub color: String,
    pub broken: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Relation {
    pub subject: i32,
    pub relation: String,
    pub object: i32,
}
