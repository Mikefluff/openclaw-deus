//! Hebbian Learning — OpenCog asymmetric co-activation formula.
//!
//! conj = (s_i × s_j) + (s_j - s_i) × |s_j - s_i|
//! Asymmetry biases toward the stronger atom, preventing weak traces
//! from parasitically strengthening themselves.

use crate::core::config::LearningConfig;
use crate::memory::{MemoryStore, Edge, TraceRef};
use crate::neuro::attention::AttentionalFocus;

pub trait HebbianLearning {
    /// Bind a newly activated trace to AF members using asymmetric formula.
    fn bind(
        &self,
        new_trace: TraceRef,
        af: &AttentionalFocus,
        memory: &mut dyn MemoryStore,
        config: &LearningConfig,
    );
}

pub struct AsymmetricHebbian;

impl HebbianLearning for AsymmetricHebbian {
    fn bind(
        &self,
        new_trace: TraceRef,
        af: &AttentionalFocus,
        memory: &mut dyn MemoryStore,
        cfg: &LearningConfig,
    ) {
        let new_sti = match memory.get_trace(new_trace) {
            Some(t) => t.sti,
            None => return,
        };

        if new_sti < cfg.hebbian_threshold { return; }

        for &af_idx in &af.members {
            if af_idx == new_trace { continue; }

            let af_sti = match memory.get_trace(af_idx) {
                Some(t) => t.sti,
                None => continue,
            };

            // Normalize STI to [0, 1] range
            let s_i = (new_sti / 10.0).clamp(0.0, 1.0);
            let s_j = (af_sti / 10.0).clamp(0.0, 1.0);

            // OpenCog asymmetric formula
            let diff = s_j - s_i;
            let conj = (s_i * s_j) + diff * diff.abs();
            let conj = (conj + 1.0) / 2.0; // normalize to [0, 1]

            if conj < cfg.hebbian_threshold { continue; }

            // Update or create edge
            if let Some(edge_idx) = memory.find_edge(new_trace, af_idx) {
                let edge = &mut memory.edges_mut()[edge_idx];
                // EMA update: 0.1 * new + 0.9 * old
                edge.weight = 0.1 * conj + 0.9 * edge.weight;
                edge.co_activation += 1;
            } else {
                memory.insert_edge(Edge {
                    from: new_trace,
                    to: af_idx,
                    weight: conj * 0.3,
                    eligibility: 0.0,
                    co_activation: 1,
                });
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::memory::*;

    #[test]
    fn asymmetric_formula_favors_strong() {
        // When s_j (existing) > s_i (new), conj should be higher
        // than when s_i > s_j (symmetric would be equal)

        let s_i_weak: f64 = 0.3;
        let s_j_strong: f64 = 0.8;

        let diff1 = s_j_strong - s_i_weak;
        let conj1 = (s_i_weak * s_j_strong) + diff1 * diff1.abs();

        let diff2 = s_i_weak - s_j_strong;
        let conj2 = (s_j_strong * s_i_weak) + diff2 * diff2.abs();

        // conj1 (weak→strong) should differ from conj2 (strong→weak)
        assert!((conj1 - conj2).abs() > 0.01,
            "formula should be asymmetric: conj1={conj1} conj2={conj2}");

        // Strong target should get higher conjunction
        assert!(conj1 > conj2,
            "weak→strong should be stronger than strong→weak");
    }

    #[test]
    fn hebbian_creates_edge() {
        let hebb = AsymmetricHebbian;
        let mut store = VecMemoryStore::new();
        let cfg = LearningConfig::default();

        let mut t1 = Trace::new("a".into(), vec![]); t1.sti = 5.0;
        let mut t2 = Trace::new("b".into(), vec![]); t2.sti = 8.0;
        let a = store.insert_trace("a".into(), t1);
        let b = store.insert_trace("b".into(), t2);

        let af = AttentionalFocus { members: vec![a, b] };
        hebb.bind(a, &af, &mut store, &cfg);

        assert_eq!(store.edge_count(), 1);
    }
}
