//! Configuration — all tunable parameters, split per module.

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HeartConfig {
    pub vitals: VitalsConfig,
    pub attention: AttentionConfig,
    pub hormones: HormoneConfig,
    pub agency: AgencyConfig,
    pub learning: LearningConfig,
    pub sleep: SleepConfig,
}

impl Default for HeartConfig {
    fn default() -> Self {
        Self {
            vitals: VitalsConfig::default(),
            attention: AttentionConfig::default(),
            hormones: HormoneConfig::default(),
            agency: AgencyConfig::default(),
            learning: LearningConfig::default(),
            sleep: SleepConfig::default(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VitalsConfig {
    pub energy_drain: f64,
    pub fatigue_rate: f64,
    pub accumulator_decay: f64,
    pub accumulator_cap: f64,
}

impl Default for VitalsConfig {
    fn default() -> Self {
        Self {
            energy_drain: 0.0001,
            fatigue_rate: 0.00005,
            accumulator_decay: 0.9999,
            accumulator_cap: 5.0,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AttentionConfig {
    pub sti_rent: f64,
    pub sti_wage: f64,
    pub af_capacity: usize,
}

impl Default for AttentionConfig {
    fn default() -> Self {
        Self { sti_rent: 0.01, sti_wage: 0.05, af_capacity: 10 }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HormoneConfig {
    pub phasic_tau: [f64; 4],
    pub tonic_target: [f64; 4],
    pub tonic_drift: f64,
}

impl Default for HormoneConfig {
    fn default() -> Self {
        Self {
            phasic_tau: [30.0, 20.0, 500.0, 200.0],
            tonic_target: [0.5, 0.5, 0.5, 0.5],
            tonic_drift: 0.001,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AgencyConfig {
    pub num_actions: u8,
    pub min_energy: f64,
    pub action_cost: f64,
}

impl Default for AgencyConfig {
    fn default() -> Self {
        Self { num_actions: 6, min_energy: 0.1, action_cost: 0.0005 }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LearningConfig {
    pub spread_rate: f64,
    pub hebbian_threshold: f64,
    pub freshness_decay: f64,
}

impl Default for LearningConfig {
    fn default() -> Self {
        Self { spread_rate: 0.15, hebbian_threshold: 0.1, freshness_decay: 0.9999 }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SleepConfig {
    pub threshold: f64,
    pub energy_restore: f64,
    pub shy_delta: f64,
    pub replay_count: usize,
}

impl Default for SleepConfig {
    fn default() -> Self {
        Self { threshold: 0.15, energy_restore: 0.5, shy_delta: 0.2, replay_count: 5 }
    }
}
