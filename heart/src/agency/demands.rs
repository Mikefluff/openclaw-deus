//! OpenPsi-inspired demand system.
//!
//! Demands drive action selection. Each demand has urgency [0,1].
//! The most urgent demand determines behavioral mode.

use serde::{Deserialize, Serialize};
use crate::core::state::{AccumulatorState, HormoneState, acc};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DemandState {
    pub curiosity: f64,
    pub comfort: f64,
    pub social: f64,
    pub competence: f64,
}

impl Default for DemandState {
    fn default() -> Self {
        Self { curiosity: 0.5, comfort: 0.5, social: 0.3, competence: 0.3 }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum DemandMode { Explore, AvoidPain, Social, Learn }

pub trait DemandSystem {
    fn update(&self, demands: &mut DemandState, acc: &AccumulatorState, hormones: &HormoneState);
    fn most_urgent(&self, demands: &DemandState) -> (f64, DemandMode);
}

pub struct OpenPsiDemands;

impl DemandSystem for OpenPsiDemands {
    fn update(&self, d: &mut DemandState, a: &AccumulatorState, h: &HormoneState) {
        let hc = h.combined();
        d.curiosity = (0.5 + hc[0] * 0.3 - hc[2] * 0.2).clamp(0.0, 1.0);
        d.comfort = (1.0 - a.values[acc::PAIN] * 0.2).clamp(0.0, 1.0);
        d.competence = (1.0 - a.values[acc::PRED_ERROR] * 0.15).clamp(0.0, 1.0);
        d.social = (0.3 + hc[3] * 0.2).clamp(0.0, 1.0);
    }

    fn most_urgent(&self, d: &DemandState) -> (f64, DemandMode) {
        let options = [
            (d.curiosity, DemandMode::Explore),
            (1.0 - d.comfort, DemandMode::AvoidPain),
            (d.social, DemandMode::Social),
            (1.0 - d.competence, DemandMode::Learn),
        ];
        options.into_iter()
            .max_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal))
            .unwrap_or((0.5, DemandMode::Explore))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn high_pain_drives_avoid() {
        let sys = OpenPsiDemands;
        let mut d = DemandState::default();
        let mut a = AccumulatorState::default();
        a.values[acc::PAIN] = 4.0;
        let h = HormoneState::default();

        sys.update(&mut d, &a, &h);
        let (_, mode) = sys.most_urgent(&d);
        assert_eq!(mode, DemandMode::AvoidPain);
    }
}
