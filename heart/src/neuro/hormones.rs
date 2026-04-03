//! Phasic/Tonic neuromodulator dynamics.
//!
//! Phasic: rapid spike + exponential decay (tau per channel).
//! Tonic: slow drift toward target baseline.
//! Drives from accumulators modulate tonic component.

use crate::core::config::HormoneConfig;
use crate::core::state::{HormoneState, AccumulatorState, acc};

/// Hormone channel indices.
pub mod ch {
    pub const DA: usize = 0;        // dopamine
    pub const NE: usize = 1;        // norepinephrine
    pub const CORTISOL: usize = 2;
    pub const SEROTONIN: usize = 3;
}

pub trait Neuromodulator {
    fn tick(&self, state: &mut HormoneState, accumulators: &AccumulatorState, config: &HormoneConfig);
}

pub struct PhasicTonicSystem;

impl Neuromodulator for PhasicTonicSystem {
    fn tick(&self, state: &mut HormoneState, acc_state: &AccumulatorState, cfg: &HormoneConfig) {
        let a = &acc_state.values;

        for i in 0..4 {
            // Phasic decay: exp(-1/tau)
            let decay = 1.0 - 1.0 / cfg.phasic_tau[i];
            state.phasic[i] *= decay;

            // Tonic drift toward target
            state.tonic[i] += (cfg.tonic_target[i] - state.tonic[i]) * cfg.tonic_drift;

            // Accumulator-driven tonic modulation
            match i {
                ch::DA => {
                    if a[acc::REWARD] > 0.3 { state.tonic[i] += a[acc::REWARD] * 0.001; }
                }
                ch::NE => {
                    if a[acc::NOVELTY] > 0.3 || a[acc::TENSION] > 0.5 {
                        state.tonic[i] += (a[acc::NOVELTY] + a[acc::TENSION]) * 0.001;
                    }
                }
                ch::CORTISOL => {
                    if a[acc::PAIN] > 0.5 || a[acc::TENSION] > 0.5 {
                        state.tonic[i] += (a[acc::PAIN] + a[acc::TENSION]) * 0.0005;
                    }
                }
                ch::SEROTONIN => {
                    if a[acc::STABILITY] > 0.5 && a[acc::PAIN] < 0.3 {
                        state.tonic[i] += a[acc::STABILITY] * 0.0005;
                    }
                }
                _ => {}
            }

            // Clamp
            state.phasic[i] = state.phasic[i].clamp(-1.0, 1.5);
            state.tonic[i] = state.tonic[i].clamp(0.0, 1.0);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn phasic_decays_toward_zero() {
        let sys = PhasicTonicSystem;
        let mut state = HormoneState::default();
        state.phasic[ch::DA] = 1.0;
        let acc = AccumulatorState::default();
        let cfg = HormoneConfig::default();

        for _ in 0..100 { sys.tick(&mut state, &acc, &cfg); }

        assert!(state.phasic[ch::DA] < 0.1, "phasic should decay: {}", state.phasic[ch::DA]);
    }

    #[test]
    fn tonic_drifts_to_target() {
        let sys = PhasicTonicSystem;
        let mut state = HormoneState::default();
        state.tonic[ch::DA] = 0.0;
        let acc = AccumulatorState::default();
        let cfg = HormoneConfig::default();

        for _ in 0..10000 { sys.tick(&mut state, &acc, &cfg); }

        assert!((state.tonic[ch::DA] - 0.5).abs() < 0.1, "tonic should drift to 0.5: {}", state.tonic[ch::DA]);
    }

    #[test]
    fn reward_drives_da_tonic() {
        let sys = PhasicTonicSystem;
        let mut state = HormoneState::default();
        let mut acc = AccumulatorState::default();
        acc.values[crate::core::state::acc::REWARD] = 3.0;
        let cfg = HormoneConfig::default();

        let da_before = state.tonic[ch::DA];
        for _ in 0..100 { sys.tick(&mut state, &acc, &cfg); }

        assert!(state.tonic[ch::DA] > da_before, "reward should drive DA up");
    }
}
