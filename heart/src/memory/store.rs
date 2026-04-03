//! MemoryStore — trait + VecMemoryStore implementation.

use std::collections::HashMap;
use super::{Trace, TraceRef, Edge};

/// Trait for in-memory trace/edge storage.
pub trait MemoryStore {
    fn find_trace(&self, key: &str) -> Option<TraceRef>;
    fn insert_trace(&mut self, key: String, trace: Trace) -> TraceRef;
    fn get_trace(&self, idx: TraceRef) -> Option<&Trace>;
    fn get_trace_mut(&mut self, idx: TraceRef) -> Option<&mut Trace>;
    fn trace_count(&self) -> usize;
    fn traces(&self) -> &[Trace];
    fn traces_mut(&mut self) -> &mut [Trace];

    fn find_edge(&self, from: TraceRef, to: TraceRef) -> Option<usize>;
    fn insert_edge(&mut self, edge: Edge);
    fn edges(&self) -> &[Edge];
    fn edges_mut(&mut self) -> &mut Vec<Edge>;
    fn retain_edges(&mut self, f: Box<dyn FnMut(&Edge) -> bool>);
    fn edge_count(&self) -> usize;

    /// Cached sum of outgoing weights for normalized spreading.
    fn outgoing_weight_sum(&self, from: TraceRef) -> f64;
}

/// Vec-backed memory store.
pub struct VecMemoryStore {
    traces: Vec<Trace>,
    trace_map: HashMap<String, TraceRef>,
    edges: Vec<Edge>,
    outgoing_cache: HashMap<usize, f64>,
    cache_dirty: bool,
}

impl VecMemoryStore {
    pub fn new() -> Self {
        Self {
            traces: Vec::new(),
            trace_map: HashMap::new(),
            edges: Vec::new(),
            outgoing_cache: HashMap::new(),
            cache_dirty: true,
        }
    }

    fn rebuild_outgoing_cache(&mut self) {
        self.outgoing_cache.clear();
        for edge in &self.edges {
            *self.outgoing_cache.entry(edge.from.0).or_insert(0.0) += edge.weight.abs();
        }
        self.cache_dirty = false;
    }
}

impl MemoryStore for VecMemoryStore {
    fn find_trace(&self, key: &str) -> Option<TraceRef> {
        self.trace_map.get(key).copied()
    }

    fn insert_trace(&mut self, key: String, trace: Trace) -> TraceRef {
        let idx = TraceRef(self.traces.len());
        self.traces.push(trace);
        self.trace_map.insert(key, idx);
        idx
    }

    fn get_trace(&self, idx: TraceRef) -> Option<&Trace> {
        self.traces.get(idx.0)
    }

    fn get_trace_mut(&mut self, idx: TraceRef) -> Option<&mut Trace> {
        self.traces.get_mut(idx.0)
    }

    fn trace_count(&self) -> usize { self.traces.len() }
    fn traces(&self) -> &[Trace] { &self.traces }
    fn traces_mut(&mut self) -> &mut [Trace] { &mut self.traces }

    fn find_edge(&self, from: TraceRef, to: TraceRef) -> Option<usize> {
        self.edges.iter().position(|e| e.from == from && e.to == to)
    }

    fn insert_edge(&mut self, edge: Edge) {
        self.edges.push(edge);
        self.cache_dirty = true;
    }

    fn edges(&self) -> &[Edge] { &self.edges }
    fn edges_mut(&mut self) -> &mut Vec<Edge> { self.cache_dirty = true; &mut self.edges }
    fn retain_edges(&mut self, mut f: Box<dyn FnMut(&Edge) -> bool>) { self.edges.retain(|e| f(e)); self.cache_dirty = true; }
    fn edge_count(&self) -> usize { self.edges.len() }

    fn outgoing_weight_sum(&self, from: TraceRef) -> f64 {
        if self.cache_dirty {
            // Can't rebuild here (immutable self). Return computed value.
            self.edges.iter()
                .filter(|e| e.from == from)
                .map(|e| e.weight.abs())
                .sum()
        } else {
            self.outgoing_cache.get(&from.0).copied().unwrap_or(0.0)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn insert_and_find_trace() {
        let mut store = VecMemoryStore::new();
        let tr = Trace::new("test".into(), vec![0.0; 64]);
        let idx = store.insert_trace("test".into(), tr);
        assert_eq!(store.find_trace("test"), Some(idx));
        assert_eq!(store.trace_count(), 1);
    }

    #[test]
    fn outgoing_weight_sum_correct() {
        let mut store = VecMemoryStore::new();
        let a = store.insert_trace("a".into(), Trace::new("a".into(), vec![]));
        let b = store.insert_trace("b".into(), Trace::new("b".into(), vec![]));
        let c = store.insert_trace("c".into(), Trace::new("c".into(), vec![]));

        store.insert_edge(Edge { from: a, to: b, weight: 0.5, eligibility: 0.0, co_activation: 0 });
        store.insert_edge(Edge { from: a, to: c, weight: 0.3, eligibility: 0.0, co_activation: 0 });

        let sum = store.outgoing_weight_sum(a);
        assert!((sum - 0.8).abs() < 1e-10);
    }
}
