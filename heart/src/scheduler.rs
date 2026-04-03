//! Brain function scheduler — multi-rate accumulator.
//!
//! Each brain function has its own interval. Scheduler calls functions
//! whose accumulator has elapsed. All on one thread, zero synchronization.
//!
//! Inspired by OpenCog CogServer SimpleRunner:
//!   cycle_count % agent.frequency() == 0

use std::time::Duration;
use crate::brain::Brain;

type BrainFn = fn(&mut Brain);

struct ScheduledFn {
    name: &'static str,
    interval: Duration,
    accumulator: Duration,
    run: BrainFn,
}

pub struct BrainScheduler {
    functions: Vec<ScheduledFn>,
}

impl BrainScheduler {
    pub fn new() -> Self {
        Self {
            functions: vec![
                // ── ALWAYS (every tick, 1ms) ──────────────
                ScheduledFn {
                    name: "vitals",
                    interval: Duration::from_millis(1),
                    accumulator: Duration::ZERO,
                    run: Brain::tick_vitals,
                },
                ScheduledFn {
                    name: "attention",
                    interval: Duration::from_millis(1),
                    accumulator: Duration::ZERO,
                    run: Brain::tick_attention,
                },

                // ── FAST (every 2ms) ──────────────────────
                ScheduledFn {
                    name: "agency",
                    interval: Duration::from_millis(2),
                    accumulator: Duration::ZERO,
                    run: Brain::tick_agency,
                },

                // ── MEDIUM (every 5ms) ────────────────────
                ScheduledFn {
                    name: "hormones",
                    interval: Duration::from_millis(5),
                    accumulator: Duration::ZERO,
                    run: Brain::tick_hormones,
                },

                // ── SLOW (every 50ms) ─────────────────────
                ScheduledFn {
                    name: "learning",
                    interval: Duration::from_millis(50),
                    accumulator: Duration::ZERO,
                    run: Brain::tick_learning,
                },

                // ── DEEP (every 500ms) ────────────────────
                ScheduledFn {
                    name: "plasticity",
                    interval: Duration::from_millis(500),
                    accumulator: Duration::ZERO,
                    run: Brain::tick_plasticity,
                },

                // ── RARE (every 5s) ───────────────────────
                ScheduledFn {
                    name: "deep",
                    interval: Duration::from_secs(5),
                    accumulator: Duration::ZERO,
                    run: Brain::tick_deep,
                },
            ],
        }
    }

    /// Advance all accumulators by dt, fire functions whose interval elapsed.
    pub fn tick(&mut self, dt: Duration, brain: &mut Brain) {
        for func in &mut self.functions {
            func.accumulator += dt;
            if func.accumulator >= func.interval {
                (func.run)(brain);
                func.accumulator -= func.interval;
            }
        }
    }
}
