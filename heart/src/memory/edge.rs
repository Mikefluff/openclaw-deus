//! Edge — associative connection between traces.

use super::TraceRef;

#[derive(Clone, Debug)]
pub struct Edge {
    pub from: TraceRef,
    pub to: TraceRef,
    pub weight: f64,
    pub eligibility: f64,
    pub co_activation: u32,
}
