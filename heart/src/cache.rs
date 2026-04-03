//! IndexCache — hot-path caching for spreading activation.
//!
//! Adjacent activation passes select ~70-100% same trace IDs.
//! Skip recomputation, reuse previous result.
//! Cuts DB queries by ~75%.
//!
//! Inspired by THUDM/IndexCache (arXiv:2603.12201).

/// Cached set of "hot" trace IDs from a spreading activation pass.
#[derive(Clone, Debug)]
pub struct HotSet {
    /// Trace IDs sorted by STI descending
    pub trace_ids: Vec<String>,
    /// STI values at time of selection
    pub sti_values: Vec<f64>,
    /// Which pass produced this
    pub source_pass: usize,
}

/// IndexCache configuration — which passes are Full vs Shared.
#[derive(Clone)]
pub struct IndexCacheConfig {
    /// How often to do a full recompute (1 = every pass, 4 = every 4th)
    pub freq: usize,
}

impl Default for IndexCacheConfig {
    fn default() -> Self {
        Self { freq: 4 } // recompute every 4th pass
    }
}

impl IndexCacheConfig {
    /// Should this pass compute fresh indices?
    pub fn is_full_pass(&self, pass: usize) -> bool {
        if self.freq <= 1 { return true; }
        pass % self.freq == 0
    }
}

/// IndexCache state — holds the last computed hot set.
pub struct IndexCache {
    pub config: IndexCacheConfig,
    pub cached: Option<HotSet>,
    pub hits: u64,
    pub misses: u64,
}

impl IndexCache {
    pub fn new(freq: usize) -> Self {
        Self {
            config: IndexCacheConfig { freq },
            cached: None,
            hits: 0,
            misses: 0,
        }
    }

    /// Get hot set for this pass — either cached or fresh.
    /// Returns (hot_set, needs_recompute).
    pub fn get_or_recompute(&mut self, pass: usize) -> (Option<&HotSet>, bool) {
        if self.config.is_full_pass(pass) {
            self.misses += 1;
            (None, true) // caller must compute fresh
        } else if let Some(ref cached) = self.cached {
            self.hits += 1;
            (Some(cached), false) // reuse
        } else {
            self.misses += 1;
            (None, true) // no cache yet, must compute
        }
    }

    /// Store freshly computed hot set.
    pub fn store(&mut self, hot_set: HotSet) {
        self.cached = Some(hot_set);
    }

    /// Force invalidate (external stimulus injected high-STI trace).
    pub fn invalidate(&mut self) {
        self.cached = None;
    }

    /// Cache hit rate.
    pub fn hit_rate(&self) -> f64 {
        let total = self.hits + self.misses;
        if total == 0 { 0.0 } else { self.hits as f64 / total as f64 }
    }
}
