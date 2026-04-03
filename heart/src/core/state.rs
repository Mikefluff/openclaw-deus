//! State types — domain-specific, each module owns its own state.

use serde::{Deserialize, Serialize};

/// Snapshot for observers (dashboard, DB sync).
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Snapshot {
    pub cycle: u64,
    pub tps: u64,
    pub vitals: VitalsState,
    pub hormones: HormoneState,
    pub accumulators: AccumulatorState,
    pub memory: MemoryStats,
    pub agency: AgencyStats,
}

/// Owned by vitals tick.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VitalsState {
    pub energy: f64,
    pub fatigue: f64,
    pub sleep_count: u32,
}

impl Default for VitalsState {
    fn default() -> Self {
        Self { energy: 1.0, fatigue: 0.0, sleep_count: 0 }
    }
}

/// Owned by hormone tick.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HormoneState {
    pub phasic: [f64; 4],
    pub tonic: [f64; 4],
}

impl Default for HormoneState {
    fn default() -> Self {
        Self { phasic: [0.0; 4], tonic: [0.5, 0.5, 0.5, 0.5] }
    }
}

impl HormoneState {
    pub fn combined(&self) -> [f64; 4] {
        std::array::from_fn(|i| self.phasic[i] + self.tonic[i])
    }
    pub fn da(&self) -> f64 { self.phasic[0] + self.tonic[0] }
    pub fn ne(&self) -> f64 { self.phasic[1] + self.tonic[1] }
    pub fn cortisol(&self) -> f64 { self.phasic[2] + self.tonic[2] }
    pub fn serotonin(&self) -> f64 { self.phasic[3] + self.tonic[3] }

    pub fn spike(&mut self, channel: usize, amount: f64) {
        if channel < 4 {
            self.phasic[channel] = (self.phasic[channel] + amount).max(-1.0).min(1.5);
        }
    }
}

/// Owned by accumulator system.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct AccumulatorState {
    pub values: [f64; 7],
}

/// Named indices for accumulator channels.
pub mod acc {
    pub const PRED_ERROR: usize = 0;
    pub const TENSION: usize = 1;
    pub const PAIN: usize = 2;
    pub const CONVERGENCE: usize = 3;
    pub const REWARD: usize = 4;
    pub const NOVELTY: usize = 5;
    pub const STABILITY: usize = 6;
}

impl AccumulatorState {
    pub fn accumulate(&mut self, channel: usize, amount: f64, cap: f64) {
        if channel < 7 {
            self.values[channel] = (self.values[channel] + amount).min(cap);
        }
    }

    pub fn decay(&mut self, rate: f64, cap: f64) {
        for v in &mut self.values {
            *v = (*v * rate).min(cap);
        }
    }
}

/// Memory statistics for snapshot.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct MemoryStats {
    pub trace_count: u32,
    pub edge_count: u32,
    pub af_size: u32,
}

/// Agency statistics.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct AgencyStats {
    pub actions_taken: u64,
    pub sensory_processed: u64,
}
