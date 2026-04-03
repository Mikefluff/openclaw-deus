//! ECAN — Economic Attention Network.
//!
//! STI rent for all traces. Wages for AF (Attentional Focus) members.
//! AF = top-N traces by STI. Conservation of attention budget.

use crate::core::config::AttentionConfig;
use crate::memory::{MemoryStore, TraceRef};

/// The current attentional focus.
#[derive(Clone, Debug, Default)]
pub struct AttentionalFocus {
    pub members: Vec<TraceRef>,
}

pub trait AttentionAllocator {
    /// Rent all traces, compute AF, pay wages.
    fn tick(&self, memory: &mut dyn MemoryStore, config: &AttentionConfig) -> AttentionalFocus;
}

pub struct EcanAllocator;

impl AttentionAllocator for EcanAllocator {
    fn tick(&self, memory: &mut dyn MemoryStore, cfg: &AttentionConfig) -> AttentionalFocus {
        // Rent: all traces pay STI
        for trace in memory.traces_mut() {
            trace.sti = (trace.sti - cfg.sti_rent).max(0.0);
        }

        // Compute AF: top-N by STI
        let mut indices: Vec<(usize, f64)> = memory.traces().iter().enumerate()
            .filter(|(_, t)| t.sti > 0.01)
            .map(|(i, t)| (i, t.sti))
            .collect();
        indices.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        let af_members: Vec<TraceRef> = indices.iter()
            .take(cfg.af_capacity)
            .map(|(i, _)| TraceRef(*i))
            .collect();

        // Wages: AF members receive STI
        for &idx in &af_members {
            if let Some(trace) = memory.get_trace_mut(idx) {
                trace.sti += cfg.sti_wage;
            }
        }

        AttentionalFocus { members: af_members }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::memory::{Trace, VecMemoryStore};

    #[test]
    fn af_contains_top_by_sti() {
        let alloc = EcanAllocator;
        let mut store = VecMemoryStore::new();
        let cfg = AttentionConfig { af_capacity: 2, ..Default::default() };

        let mut t1 = Trace::new("a".into(), vec![]); t1.sti = 5.0;
        let mut t2 = Trace::new("b".into(), vec![]); t2.sti = 10.0;
        let mut t3 = Trace::new("c".into(), vec![]); t3.sti = 3.0;

        store.insert_trace("a".into(), t1);
        let b_ref = store.insert_trace("b".into(), t2);
        store.insert_trace("c".into(), t3);

        let af = alloc.tick(&mut store, &cfg);
        assert_eq!(af.members.len(), 2);
        assert_eq!(af.members[0], b_ref); // highest STI
    }

    #[test]
    fn wages_only_for_af_members() {
        let alloc = EcanAllocator;
        let mut store = VecMemoryStore::new();
        let cfg = AttentionConfig { af_capacity: 1, sti_wage: 1.0, sti_rent: 0.0, ..Default::default() };

        let mut t1 = Trace::new("a".into(), vec![]); t1.sti = 10.0;
        let mut t2 = Trace::new("b".into(), vec![]); t2.sti = 1.0;
        store.insert_trace("a".into(), t1);
        store.insert_trace("b".into(), t2);

        alloc.tick(&mut store, &cfg);

        // a should have gotten wage, b should not
        assert!(store.get_trace(TraceRef(0)).unwrap().sti > 10.0);
        assert!(store.get_trace(TraceRef(1)).unwrap().sti <= 1.0);
    }
}
