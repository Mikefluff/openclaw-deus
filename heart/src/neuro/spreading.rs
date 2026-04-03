//! Spreading Activation — normalized STI diffusion.
//!
//! OpenCog ImportanceDiffusion: spread proportional to edge weight,
//! normalized by sum of outgoing weights. Conservation: source loses
//! exactly what targets gain.

use crate::core::config::LearningConfig;
use crate::memory::MemoryStore;

pub trait SpreadingActivation {
    fn spread(&self, memory: &mut dyn MemoryStore, config: &LearningConfig);
}

pub struct NormalizedSpreading;

impl SpreadingActivation for NormalizedSpreading {
    fn spread(&self, memory: &mut dyn MemoryStore, cfg: &LearningConfig) {
        let edge_count = memory.edge_count();
        let trace_count = memory.trace_count();
        if edge_count == 0 || trace_count == 0 { return; }

        // Compute deltas (can't mutate while iterating)
        let mut deltas: Vec<f64> = vec![0.0; trace_count];

        for edge in memory.edges() {
            if edge.weight < 0.01 { continue; }
            let src_sti = memory.get_trace(edge.from).map(|t| t.sti).unwrap_or(0.0);
            if src_sti < 0.1 { continue; }

            // Normalized: divide by sum of outgoing weights
            let norm = memory.outgoing_weight_sum(edge.from).max(0.001);
            let spread = src_sti * cfg.spread_rate * edge.weight / norm;

            deltas[edge.to.0] += spread;
            deltas[edge.from.0] -= spread; // conservation
        }

        // Apply deltas
        for (i, delta) in deltas.iter().enumerate() {
            if let Some(trace) = memory.get_trace_mut(crate::memory::TraceRef(i)) {
                trace.sti = (trace.sti + delta).max(0.0);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::memory::*;

    #[test]
    fn spreading_conserves_total_sti() {
        let spreader = NormalizedSpreading;
        let mut store = VecMemoryStore::new();
        let cfg = LearningConfig::default();

        let mut t1 = Trace::new("a".into(), vec![]); t1.sti = 10.0;
        let mut t2 = Trace::new("b".into(), vec![]); t2.sti = 0.0;
        let a = store.insert_trace("a".into(), t1);
        let b = store.insert_trace("b".into(), t2);

        store.insert_edge(Edge { from: a, to: b, weight: 0.5, eligibility: 0.0, co_activation: 0 });

        let total_before: f64 = store.traces().iter().map(|t| t.sti).sum();
        spreader.spread(&mut store, &cfg);
        let total_after: f64 = store.traces().iter().map(|t| t.sti).sum();

        assert!((total_before - total_after).abs() < 1e-10,
            "STI not conserved: before={total_before} after={total_after}");
    }

    #[test]
    fn spreading_normalizes_by_outgoing_sum() {
        let spreader = NormalizedSpreading;
        let mut store = VecMemoryStore::new();
        let cfg = LearningConfig { spread_rate: 1.0, ..Default::default() };

        let mut t1 = Trace::new("a".into(), vec![]); t1.sti = 10.0;
        let mut t2 = Trace::new("b".into(), vec![]); t2.sti = 0.0;
        let mut t3 = Trace::new("c".into(), vec![]); t3.sti = 0.0;
        let a = store.insert_trace("a".into(), t1);
        let b = store.insert_trace("b".into(), t2);
        let c = store.insert_trace("c".into(), t3);

        // Two outgoing edges from a: b(weight 0.6) and c(weight 0.4)
        store.insert_edge(Edge { from: a, to: b, weight: 0.6, eligibility: 0.0, co_activation: 0 });
        store.insert_edge(Edge { from: a, to: c, weight: 0.4, eligibility: 0.0, co_activation: 0 });

        spreader.spread(&mut store, &cfg);

        let sti_b = store.get_trace(b).unwrap().sti;
        let sti_c = store.get_trace(c).unwrap().sti;

        // b should get 60% of spread, c should get 40%
        assert!(sti_b > sti_c, "b should get more than c: b={sti_b} c={sti_c}");
        assert!((sti_b / sti_c - 1.5).abs() < 0.1, "ratio should be ~1.5: {}", sti_b / sti_c);
    }
}
