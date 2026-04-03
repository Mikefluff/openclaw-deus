//! Rate constants — named slot indices for the scheduler.

use std::time::Duration;

pub const VITALS: usize = 0;
pub const ATTENTION: usize = 1;
pub const AGENCY: usize = 2;
pub const HORMONES: usize = 3;
pub const SPREADING: usize = 4;
pub const PLASTICITY: usize = 5;
pub const DEEP: usize = 6;

pub fn default_rates() -> Vec<(&'static str, Duration)> {
    vec![
        ("vitals",     Duration::from_millis(1)),
        ("attention",  Duration::from_millis(1)),
        ("agency",     Duration::from_millis(2)),
        ("hormones",   Duration::from_millis(5)),
        ("spreading",  Duration::from_millis(50)),
        ("plasticity", Duration::from_millis(500)),
        ("deep",       Duration::from_secs(5)),
    ]
}
