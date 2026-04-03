//! Brain — in-memory cognitive state + tick loop.
//!
//! Everything here runs in RAM at native speed.
//! SurrealDB is only for persistence (via db::sync_to_db).

use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};

/// Hormone state — phasic/tonic neuromodulators.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Hormones {
    pub dopamine: f64,
    pub norepinephrine: f64,
    pub cortisol: f64,
    pub serotonin: f64,
}

impl Default for Hormones {
    fn default() -> Self {
        Self { dopamine: 0.5, norepinephrine: 0.5, cortisol: 0.5, serotonin: 0.5 }
    }
}

/// Accumulators — sensory signal integrators.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Accumulators {
    pub pred_error: f64,
    pub tension: f64,
    pub pain: f64,
    pub convergence: f64,
    pub reward: f64,
    pub novelty: f64,
    pub stability: f64,
}

impl Default for Accumulators {
    fn default() -> Self {
        Self { pred_error: 0.0, tension: 0.0, pain: 0.0, convergence: 0.0, reward: 0.0, novelty: 0.0, stability: 0.0 }
    }
}

/// Shared state — what gets synced to SurrealDB + reported.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrainState {
    pub cycle: u64,
    pub energy: f64,
    pub fatigue: f64,
    pub hormones: Hormones,
    pub accumulators: Accumulators,
    pub trace_count: u32,
    pub edge_count: u32,
    pub ticks_per_sec: u64,
    pub running: bool,
    // Dirty flags for DB sync
    pub dirty_vitals: bool,
    pub dirty_hormones: bool,
    pub dirty_accumulators: bool,
}

impl Default for BrainState {
    fn default() -> Self {
        Self {
            cycle: 0, energy: 1.0, fatigue: 0.0,
            hormones: Hormones::default(),
            accumulators: Accumulators::default(),
            trace_count: 0, edge_count: 0, ticks_per_sec: 0,
            running: true,
            dirty_vitals: false, dirty_hormones: false, dirty_accumulators: false,
        }
    }
}

/// Brain — the cognitive runtime.
pub struct Brain {
    state: Arc<Mutex<BrainState>>,
    // Config (loaded from SurrealDB)
    energy_drain: f64,
    fatigue_rate: f64,
    sleep_threshold: f64,
    sleep_restore: f64,
    accumulator_decay: f64,
    accumulator_cap: f64,
    hormone_decay_rate: f64,
}

impl Brain {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(BrainState::default())),
            energy_drain: 0.002,
            fatigue_rate: 0.005,
            sleep_threshold: 0.15,
            sleep_restore: 0.5,
            accumulator_decay: 0.9995,
            accumulator_cap: 5.0,
            hormone_decay_rate: 0.001,
        }
    }

    pub fn shared_state(&self) -> Arc<Mutex<BrainState>> {
        self.state.clone()
    }

    pub fn trace_count(&self) -> u32 {
        self.state.lock().unwrap().trace_count
    }

    pub fn set_tps(&self, tps: u64) {
        self.state.lock().unwrap().ticks_per_sec = tps;
    }

    pub async fn load_from_db(&mut self, db: &crate::db::Db) {
        if let Some(state) = crate::db::load_state(db).await {
            let mut s = self.state.lock().unwrap();
            s.cycle = state.cycle;
            s.energy = state.energy;
            s.fatigue = state.fatigue;

            // Load config
            if let Some(cfg) = state.config {
                self.energy_drain = cfg.get("energy_drain_rate").and_then(|v| v.as_f64()).unwrap_or(0.002);
                self.fatigue_rate = cfg.get("fatigue_rate").and_then(|v| v.as_f64()).unwrap_or(0.005);
                self.sleep_threshold = cfg.get("sleep_threshold").and_then(|v| v.as_f64()).unwrap_or(0.15);
                self.sleep_restore = cfg.get("sleep_energy_restore").and_then(|v| v.as_f64()).unwrap_or(0.5);
                self.accumulator_decay = cfg.get("accumulator_decay").and_then(|v| v.as_f64()).unwrap_or(0.9995);
                self.accumulator_cap = cfg.get("accumulator_cap").and_then(|v| v.as_f64()).unwrap_or(5.0);
            }
        }

        // Load counts
        if let Some((traces, edges)) = crate::db::load_counts(db).await {
            let mut s = self.state.lock().unwrap();
            s.trace_count = traces;
            s.edge_count = edges;
        }
    }

    /// Main tick — all circuits in one call, frequency division by modulo.
    pub fn tick(&self) {
        let mut s = self.state.lock().unwrap();
        let t = (s.cycle / 100) % 100;

        // ── ALWAYS: Vitals ──────────────────
        let drain = self.energy_drain * (1.0 + s.fatigue);
        s.energy = (s.energy - drain).max(0.0);
        s.fatigue = (s.fatigue + self.fatigue_rate).min(1.0);
        s.cycle += 100;

        // Sleep
        if s.energy < self.sleep_threshold {
            s.energy = (s.energy + self.sleep_restore).min(1.5);
            s.fatigue = (s.fatigue * 0.5).max(0.0);
        }

        s.dirty_vitals = true;

        // ── ALWAYS: Accumulator decay ───────
        let decay = self.accumulator_decay;
        let cap = self.accumulator_cap;
        s.accumulators.pred_error = (s.accumulators.pred_error * decay).min(cap);
        s.accumulators.tension = (s.accumulators.tension * decay).min(cap);
        s.accumulators.pain = (s.accumulators.pain * decay).min(cap);
        s.accumulators.convergence = (s.accumulators.convergence * decay).min(cap);
        s.accumulators.reward = (s.accumulators.reward * decay).min(cap);
        s.accumulators.novelty = (s.accumulators.novelty * decay).min(cap);
        s.accumulators.stability = (s.accumulators.stability * decay).min(cap);

        // ── EVERY 5th: Hormone dynamics ─────
        if t % 5 == 0 {
            let a = s.accumulators.clone();
            let h = &mut s.hormones;

            // Hormone drives from accumulators
            if a.pain > 0.5 || a.tension > 0.5 {
                h.cortisol = (h.cortisol + (a.pain + a.tension) * 0.02).min(1.5);
            }
            if a.stability > 0.5 && a.pain < 0.3 {
                h.serotonin = (h.serotonin + a.stability * 0.01).min(1.5);
            }
            if a.novelty > 0.3 || a.tension > 0.5 {
                h.norepinephrine = (h.norepinephrine + (a.novelty + a.tension) * 0.015).min(1.5);
            }
            if a.reward > 0.3 {
                h.dopamine = (h.dopamine + a.reward * 0.01).min(1.5);
            }

            // Decay toward baseline (0.5)
            let rate = self.hormone_decay_rate;
            h.dopamine += (0.5 - h.dopamine) * rate;
            h.norepinephrine += (0.5 - h.norepinephrine) * rate;
            h.cortisol += (0.5 - h.cortisol) * rate;
            h.serotonin += (0.5 - h.serotonin) * rate;

            s.dirty_hormones = true;
        }

        s.dirty_accumulators = true;
    }
}
