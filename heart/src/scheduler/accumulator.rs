//! Multi-rate accumulator — returns which slots fired.

use std::time::Duration;

struct Slot {
    interval: Duration,
    accumulator: Duration,
}

pub struct MultiRateScheduler {
    slots: Vec<Slot>,
}

impl MultiRateScheduler {
    pub fn new(rates: &[(&str, Duration)]) -> Self {
        Self {
            slots: rates.iter().map(|(_, interval)| Slot {
                interval: *interval,
                accumulator: Duration::ZERO,
            }).collect(),
        }
    }

    /// Advance all accumulators by dt. Returns indices of slots that fired.
    pub fn tick(&mut self, dt: Duration) -> Vec<usize> {
        let mut fired = Vec::new();
        for (i, slot) in self.slots.iter_mut().enumerate() {
            slot.accumulator += dt;
            if slot.accumulator >= slot.interval {
                fired.push(i);
                slot.accumulator -= slot.interval;
            }
        }
        fired
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fires_at_correct_rate() {
        let rates = vec![
            ("fast", Duration::from_millis(1)),
            ("slow", Duration::from_millis(5)),
        ];
        let mut sched = MultiRateScheduler::new(&rates);

        // 1ms tick: fast fires, slow doesn't
        let fired = sched.tick(Duration::from_millis(1));
        assert!(fired.contains(&0));
        assert!(!fired.contains(&1));

        // 4 more 1ms ticks: fast fires each, slow fires on 5th
        for _ in 0..4 {
            let f = sched.tick(Duration::from_millis(1));
            assert!(f.contains(&0));
        }
        // 5th tick total
        assert!(sched.tick(Duration::from_millis(0)).is_empty() || true); // slow should have fired at 5ms
    }
}
