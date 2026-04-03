//! Action selection — demand-driven with hormone modulation.

use crate::core::config::AgencyConfig;
use crate::core::state::{VitalsState, HormoneState};
use super::demands::DemandState;
use super::motor::MotorCommand;

pub trait ActionSelector {
    fn select(
        &self,
        demands: &DemandState,
        hormones: &HormoneState,
        vitals: &VitalsState,
        config: &AgencyConfig,
    ) -> Option<MotorCommand>;
}

pub struct DemandDrivenSelector;

impl ActionSelector for DemandDrivenSelector {
    fn select(
        &self,
        demands: &DemandState,
        hormones: &HormoneState,
        vitals: &VitalsState,
        cfg: &AgencyConfig,
    ) -> Option<MotorCommand> {
        if vitals.energy < cfg.min_energy { return None; }

        // Most urgent demand
        let urgency = [demands.curiosity, 1.0 - demands.comfort, demands.social, 1.0 - demands.competence];
        let max_urgency = urgency.iter().cloned().fold(0.0_f64, f64::max);

        // DA modulates action threshold
        let da = hormones.da();
        let threshold = (0.3 - da * 0.1).max(0.05);

        if max_urgency > threshold || rand::random::<f64>() < 0.1 {
            let action_id = (rand::random::<f64>() * cfg.num_actions as f64) as u8;
            Some(MotorCommand { action_id, target_object: None })
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_action_when_low_energy() {
        let sel = DemandDrivenSelector;
        let d = DemandState { curiosity: 1.0, ..Default::default() };
        let h = HormoneState::default();
        let v = VitalsState { energy: 0.01, ..Default::default() };
        let cfg = AgencyConfig::default();

        assert!(sel.select(&d, &h, &v, &cfg).is_none());
    }
}
