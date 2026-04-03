//! Cycle counter + TPS tracking.

use std::time::Instant;

pub struct CycleCounter {
    pub cycle: u64,
    tick_count: u64,
    last_tps: Instant,
    pub tps: u64,
}

impl CycleCounter {
    pub fn new(initial_cycle: u64) -> Self {
        Self {
            cycle: initial_cycle,
            tick_count: 0,
            last_tps: Instant::now(),
            tps: 0,
        }
    }

    pub fn tick(&mut self) {
        self.cycle += 1;
        self.tick_count += 1;
    }

    /// Update TPS counter. Returns true if TPS was updated.
    pub fn update_tps(&mut self) -> bool {
        let elapsed = self.last_tps.elapsed();
        if elapsed.as_secs_f64() >= 1.0 {
            self.tps = (self.tick_count as f64 / elapsed.as_secs_f64()) as u64;
            self.tick_count = 0;
            self.last_tps = Instant::now();
            true
        } else {
            false
        }
    }
}
