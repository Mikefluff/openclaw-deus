//! Accumulators — sensory signal integrators.
//!
//! 7 channels that accumulate sensory signals and decay over time.
//! Drive hormone dynamics and demand urgencies.

// Re-export state types — algorithms use core::state directly.
// This module exists for symmetry; accumulator logic is in AccumulatorState methods.
