//! Trace — in-memory unit of experience.

/// Opaque handle into trace store.
#[derive(Copy, Clone, Debug, Eq, PartialEq, Hash)]
pub struct TraceRef(pub usize);

/// A single trace (memory unit).
#[derive(Clone, Debug)]
pub struct Trace {
    pub id: String,
    pub sti: f64,           // Short-Term Importance (attention)
    pub weight: f64,        // long-term strength
    pub freshness: f64,     // recency
    pub position: Vec<f32>, // 64-dim sensory signature
}

impl Trace {
    pub fn new(id: String, position: Vec<f32>) -> Self {
        Self {
            id,
            sti: 8.0,
            weight: 0.5,
            freshness: 1.0,
            position,
        }
    }
}
