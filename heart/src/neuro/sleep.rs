//! Sleep — Tononi SHY (Synaptic Homeostasis Hypothesis).
//!
//! Uniform downscaling: ALL edges w *= (1 - delta).
//! Weak edges drop below threshold → pruned.
//! Strong edges survive → relative differences preserved.
//! Replay: top-N traces get STI boost.

use crate::core::config::SleepConfig;
use crate::core::state::VitalsState;
use crate::memory::{MemoryStore, TraceRef};

pub trait SleepSystem {
    fn should_sleep(&self, vitals: &VitalsState, config: &SleepConfig) -> bool;
    fn sleep(&self, vitals: &mut VitalsState, memory: &mut dyn MemoryStore, config: &SleepConfig);
}

pub struct ShyConsolidation;

impl SleepSystem for ShyConsolidation {
    fn should_sleep(&self, vitals: &VitalsState, cfg: &SleepConfig) -> bool {
        vitals.energy < cfg.threshold
    }

    fn sleep(&self, vitals: &mut VitalsState, memory: &mut dyn MemoryStore, cfg: &SleepConfig) {
        vitals.sleep_count += 1;
        vitals.energy = (vitals.energy + cfg.energy_restore).min(1.5);
        vitals.fatigue = (vitals.fatigue * 0.5).max(0.0);

        // Tononi SHY: uniform downscaling for ALL edges
        let factor = 1.0 - cfg.shy_delta;
        for edge in memory.edges_mut() {
            edge.weight *= factor;
        }

        // Prune dead edges (weight below threshold after scaling)
        memory.retain_edges(Box::new(|e| e.weight > 0.005 || e.co_activation > 2));

        // Replay: boost top-N traces by weight
        let mut top: Vec<(TraceRef, f64)> = memory.traces().iter().enumerate()
            .map(|(i, t)| (TraceRef(i), t.weight))
            .collect();
        top.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        for (idx, _) in top.iter().take(cfg.replay_count) {
            if let Some(trace) = memory.get_trace_mut(*idx) {
                trace.sti += 3.0;
                trace.freshness = (trace.freshness + 0.1).min(1.0);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::memory::*;

    #[test]
    fn shy_scales_all_edges_uniformly() {
        let sleep = ShyConsolidation;
        let mut store = VecMemoryStore::new();
        let cfg = SleepConfig { shy_delta: 0.2, ..Default::default() };
        let mut vitals = VitalsState { energy: 0.1, fatigue: 0.5, sleep_count: 0 };

        let a = store.insert_trace("a".into(), Trace::new("a".into(), vec![]));
        let b = store.insert_trace("b".into(), Trace::new("b".into(), vec![]));
        let c = store.insert_trace("c".into(), Trace::new("c".into(), vec![]));

        store.insert_edge(Edge { from: a, to: b, weight: 0.8, eligibility: 0.0, co_activation: 5 });
        store.insert_edge(Edge { from: a, to: c, weight: 0.2, eligibility: 0.0, co_activation: 5 });

        sleep.sleep(&mut vitals, &mut store, &cfg);

        let w1 = store.edges()[0].weight;
        let w2 = store.edges()[1].weight;

        // Both should be scaled by same factor (0.8)
        assert!((w1 - 0.64).abs() < 1e-10, "edge1 should be 0.8*0.8=0.64, got {w1}");
        assert!((w2 - 0.16).abs() < 1e-10, "edge2 should be 0.2*0.8=0.16, got {w2}");
    }

    #[test]
    fn sleep_restores_energy() {
        let sleep = ShyConsolidation;
        let mut store = VecMemoryStore::new();
        let cfg = SleepConfig::default();
        let mut vitals = VitalsState { energy: 0.1, fatigue: 0.8, sleep_count: 0 };

        sleep.sleep(&mut vitals, &mut store, &cfg);

        assert!(vitals.energy > 0.5);
        assert!(vitals.fatigue < 0.8);
        assert_eq!(vitals.sleep_count, 1);
    }
}
