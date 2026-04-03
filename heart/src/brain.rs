//! Brain — in-memory cognitive runtime with correct algorithms.
//!
//! Fixes vs JS version:
//! - Spreading: normalized by sum(outgoing_weights)
//! - Hebbian: OpenCog asymmetric formula
//! - ECAN: unified STI, wages for AF members, no weight rent
//! - Sleep: uniform SHY scaling w *= (1-delta) for ALL
//! - Agency: demand-driven with world model

use crate::accel;
use crate::sensory::{SensoryFrame, MotorCommand};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ═══════════════════════════════════════════
// PUBLIC TYPES
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BrainSnapshot {
    pub cycle: u64,
    pub energy: f64,
    pub fatigue: f64,
    pub hormones: [f64; 4],
    pub accumulators: [f64; 7],
    pub tps: u64,
    pub trace_count: u32,
    pub edge_count: u32,
    pub af_size: u32,
    pub sensory_processed: u64,
    pub actions_taken: u64,
    pub sleep_count: u32,
}

pub struct InitialState {
    pub cycle: u64,
    pub energy: f64,
    pub fatigue: f64,
    pub config: BrainConfig,
}

impl Default for InitialState {
    fn default() -> Self {
        Self { cycle: 0, energy: 1.0, fatigue: 0.0, config: BrainConfig::default() }
    }
}

#[derive(Clone)]
pub struct BrainConfig {
    pub energy_drain: f64,
    pub fatigue_rate: f64,
    pub sleep_threshold: f64,
    pub sleep_restore: f64,
    pub sleep_shy_delta: f64,      // uniform SHY scaling factor
    pub accumulator_decay: f64,
    pub accumulator_cap: f64,
    pub sti_budget: f64,           // total STI conservation pool
    pub sti_rent: f64,             // rent per non-AF trace per tick
    pub sti_wage: f64,             // wage per AF member per tick
    pub af_size: usize,            // attentional focus capacity
    pub hebbian_threshold: f64,    // min co-activation for link
    pub spread_rate: f64,          // STI diffusion rate
    pub num_actions: u8,
    pub phasic_tau: [f64; 4],      // DA, NE, cortisol, sero decay time constants
    pub tonic_target: [f64; 4],    // baseline targets
}

impl Default for BrainConfig {
    fn default() -> Self {
        Self {
            energy_drain: 0.0001,
            fatigue_rate: 0.00005,
            sleep_threshold: 0.15,
            sleep_restore: 0.5,
            sleep_shy_delta: 0.2,      // all edges *= 0.8 during sleep
            accumulator_decay: 0.9999,
            accumulator_cap: 5.0,
            sti_budget: 100.0,
            sti_rent: 0.01,
            sti_wage: 0.05,
            af_size: 10,
            hebbian_threshold: 0.1,
            spread_rate: 0.15,
            num_actions: 6,
            phasic_tau: [30.0, 20.0, 500.0, 200.0],  // DA fast, cort slow
            tonic_target: [0.5, 0.5, 0.5, 0.5],
        }
    }
}

// ═══════════════════════════════════════════
// IN-MEMORY TRACE (lightweight, not full SurrealDB record)
// ═══════════════════════════════════════════

#[derive(Clone)]
struct Trace {
    id: String,
    sti: f64,           // Short-Term Importance (attention)
    weight: f64,        // strength
    freshness: f64,
    position: Vec<f32>, // 64-dim sensory vector
}

#[derive(Clone)]
struct Edge {
    from: usize,  // index into traces vec
    to: usize,
    weight: f64,
    eligibility: f64,
    co_activation: u32,
}

// ═══════════════════════════════════════════
// BRAIN
// ═══════════════════════════════════════════

pub struct Brain {
    // Core state
    pub cycle: u64,
    pub energy: f64,
    pub fatigue: f64,
    pub tps: u64,
    pub actions_taken: u64,
    pub sensory_processed: u64,
    pub sleep_count: u32,

    // Hormones: [phasic, tonic] decomposition
    phasic: [f64; 4],
    tonic: [f64; 4],

    // Accumulators
    pub accumulators: [f64; 7],

    // In-memory graph
    traces: Vec<Trace>,
    trace_map: HashMap<String, usize>,  // content → index
    edges: Vec<Edge>,

    // Attentional Focus (indices into traces, sorted by STI desc)
    af: Vec<usize>,

    // Config
    cfg: BrainConfig,

    // Motor output
    pending_motor: Option<MotorCommand>,

    // Demands (OpenPsi-inspired goal system)
    demands: Demands,
}

/// Hormone value = phasic + tonic.
fn hormone_value(phasic: f64, tonic: f64) -> f64 { phasic + tonic }

// ═══════════════════════════════════════════
// DEMANDS (OpenPsi-inspired)
// ═══════════════════════════════════════════

struct Demands {
    curiosity: f64,    // explore novel things
    comfort: f64,      // avoid pain, seek stability
    social: f64,       // respond to mama
    competence: f64,   // reduce prediction error
}

impl Default for Demands {
    fn default() -> Self {
        Self { curiosity: 0.5, comfort: 0.5, social: 0.3, competence: 0.3 }
    }
}

impl Brain {
    pub fn new(init: InitialState) -> Self {
        Self {
            cycle: init.cycle,
            energy: init.energy,
            fatigue: init.fatigue,
            tps: 0,
            actions_taken: 0,
            sensory_processed: 0,
            sleep_count: 0,
            phasic: [0.0; 4],
            tonic: [0.5, 0.5, 0.5, 0.5],
            accumulators: [0.0; 7],
            traces: Vec::new(),
            trace_map: HashMap::new(),
            edges: Vec::new(),
            af: Vec::new(),
            cfg: init.config,
            pending_motor: None,
            demands: Demands::default(),
        }
    }

    pub fn hormones(&self) -> [f64; 4] {
        [
            hormone_value(self.phasic[0], self.tonic[0]),
            hormone_value(self.phasic[1], self.tonic[1]),
            hormone_value(self.phasic[2], self.tonic[2]),
            hormone_value(self.phasic[3], self.tonic[3]),
        ]
    }

    pub fn process_sensory(&mut self, frame: &SensoryFrame) {
        self.sensory_processed += 1;
        let key = format!("{}:{}", frame.action_id, frame.object_idx);
        let valence = frame.valence as f64;

        // Find or create trace
        let idx = if let Some(&idx) = self.trace_map.get(&key) {
            // Reactivation — STI boost
            let tr = &mut self.traces[idx];
            tr.sti += 5.0;
            tr.weight = (tr.weight + 0.1 + valence.abs() * 0.2).min(1.0);
            tr.freshness = 1.0;
            if frame.channels.len() >= 16 {
                tr.position = frame.channels.to_vec();
                tr.position.resize(64, 0.0);
            }
            self.accumulators[3] += 0.1; // convergence
            self.accumulators[6] += 0.15; // stability
            idx
        } else {
            // New trace
            let idx = self.traces.len();
            let mut pos = frame.channels.to_vec();
            pos.resize(64, 0.0);
            self.traces.push(Trace {
                id: key.clone(),
                sti: 8.0, // new = high STI
                weight: 0.5 + valence.abs() * 0.3,
                freshness: 1.0,
                position: pos,
            });
            self.trace_map.insert(key, idx);
            self.accumulators[5] += 0.2; // novelty
            self.accumulators[0] += 0.3; // pred_error (new = unpredicted)
            // DA spike for novelty
            self.phasic[0] += 0.1;
            self.phasic[1] += 0.15; // NE for alertness
            idx
        };

        // Valence → accumulators + hormone spikes
        if valence > 0.1 {
            self.accumulators[4] += valence; // reward
            self.phasic[0] += valence * 0.15; // DA
        }
        if valence < -0.1 {
            self.accumulators[2] += valence.abs(); // pain
            self.phasic[2] += valence.abs() * 0.2; // cortisol
        }
        if frame.channels.get(10).copied().unwrap_or(0.0) > 0.3 {
            self.phasic[1] += 0.1; // NE from sound
        }

        // Update demands from sensory
        self.demands.curiosity = (self.demands.curiosity + self.accumulators[5] * 0.01).min(1.0);
        self.demands.comfort = (1.0 - self.accumulators[2] * 0.1).max(0.0);
        self.demands.competence = (1.0 - self.accumulators[0] * 0.1).max(0.0);

        // Consequence → Hebbian learning on co-active traces
        if frame.is_consequence {
            self.hebbian_bind_af(idx);
        }
    }

    pub fn take_motor_command(&mut self) -> Option<MotorCommand> {
        self.pending_motor.take()
    }

    pub fn set_tps(&mut self, tps: u64) { self.tps = tps; }

    pub fn snapshot(&self) -> BrainSnapshot {
        BrainSnapshot {
            cycle: self.cycle,
            energy: self.energy,
            fatigue: self.fatigue,
            hormones: self.hormones(),
            accumulators: self.accumulators,
            tps: self.tps,
            trace_count: self.traces.len() as u32,
            edge_count: self.edges.len() as u32,
            af_size: self.af.len() as u32,
            sensory_processed: self.sensory_processed,
            actions_taken: self.actions_taken,
            sleep_count: self.sleep_count,
        }
    }

    // ═══════════════════════════════════════════
    // SCHEDULED FUNCTIONS
    // ═══════════════════════════════════════════

    /// Every 1ms: energy, fatigue, sleep.
    pub fn tick_vitals(&mut self) {
        self.cycle += 1;
        let drain = self.cfg.energy_drain * (1.0 + self.fatigue);
        self.energy = (self.energy - drain).max(0.0);
        self.fatigue = (self.fatigue + self.cfg.fatigue_rate).min(1.0);

        if self.energy < self.cfg.sleep_threshold {
            self.sleep();
        }
    }

    /// Every 1ms: ECAN — STI rent + wages + AF update.
    pub fn tick_attention(&mut self) {
        let rent = self.cfg.sti_rent;
        let wage = self.cfg.sti_wage;

        // Rent: all traces pay
        for tr in &mut self.traces {
            tr.sti = (tr.sti - rent).max(0.0);
            tr.freshness *= 0.9999;
        }

        // Update AF: top-N by STI
        self.af.clear();
        let mut indices: Vec<(usize, f64)> = self.traces.iter().enumerate()
            .filter(|(_, t)| t.sti > 0.01)
            .map(|(i, t)| (i, t.sti))
            .collect();
        indices.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        self.af = indices.iter().take(self.cfg.af_size).map(|(i, _)| *i).collect();

        // Wages: AF members receive STI
        for &idx in &self.af {
            self.traces[idx].sti += wage;
        }

        // Accumulator decay
        let decay = self.cfg.accumulator_decay;
        let cap = self.cfg.accumulator_cap;
        for acc in &mut self.accumulators {
            *acc = (*acc * decay).min(cap);
        }
    }

    /// Every 2ms: demand-driven agency.
    pub fn tick_agency(&mut self) {
        if self.energy < 0.1 { return; }

        // Find most urgent demand
        let demands = [
            (self.demands.curiosity, "explore"),
            (1.0 - self.demands.comfort, "avoid_pain"),
            (self.demands.social, "social"),
            (1.0 - self.demands.competence, "learn"),
        ];
        let (urgency, _mode) = demands.iter()
            .max_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal))
            .unwrap();

        // Act if urgency high enough (modulated by DA)
        let da = hormone_value(self.phasic[0], self.tonic[0]);
        let threshold = 0.3 - da * 0.1; // high DA → lower threshold → more action
        if *urgency > threshold || rand::random::<f64>() < 0.1 {
            let action_id = (rand::random::<f64>() * self.cfg.num_actions as f64) as u8;
            self.pending_motor = Some(MotorCommand { action_id, target_object: None });
            self.actions_taken += 1;
            self.energy = (self.energy - 0.0005).max(0.0);
        }
    }

    /// Every 5ms: phasic/tonic hormone dynamics.
    pub fn tick_hormones(&mut self) {
        for i in 0..4 {
            // Phasic decay: exp(-1/tau)
            let decay = 1.0 - 1.0 / self.cfg.phasic_tau[i];
            self.phasic[i] *= decay;

            // Tonic drift toward target
            let target = self.cfg.tonic_target[i];
            self.tonic[i] += (target - self.tonic[i]) * 0.001;

            // Drive from accumulators
            match i {
                0 => { // DA: reward drive
                    if self.accumulators[4] > 0.3 {
                        self.tonic[0] += self.accumulators[4] * 0.001;
                    }
                }
                1 => { // NE: novelty/tension drive
                    if self.accumulators[5] > 0.3 || self.accumulators[1] > 0.5 {
                        self.tonic[1] += (self.accumulators[5] + self.accumulators[1]) * 0.001;
                    }
                }
                2 => { // Cortisol: pain/tension drive
                    if self.accumulators[2] > 0.5 || self.accumulators[1] > 0.5 {
                        self.tonic[2] += (self.accumulators[2] + self.accumulators[1]) * 0.0005;
                    }
                }
                3 => { // Serotonin: stability drive (inverse of pain)
                    if self.accumulators[6] > 0.5 && self.accumulators[2] < 0.3 {
                        self.tonic[3] += self.accumulators[6] * 0.0005;
                    }
                }
                _ => {}
            }

            // Clamp
            self.phasic[i] = self.phasic[i].max(-1.0).min(1.5);
            self.tonic[i] = self.tonic[i].max(0.0).min(1.0);
        }
    }

    /// Every 50ms: STI diffusion + spreading activation.
    /// Uses Accelerate for batch cosine similarity.
    pub fn tick_learning(&mut self) {
        if self.edges.is_empty() || self.traces.is_empty() { return; }

        // STI diffusion: normalized by sum(outgoing_weights)
        let rate = self.cfg.spread_rate;
        let mut sti_deltas: Vec<f64> = vec![0.0; self.traces.len()];

        // Group edges by source for normalization
        let mut outgoing_sum: Vec<f64> = vec![0.0; self.traces.len()];
        for e in &self.edges {
            outgoing_sum[e.from] += e.weight.abs();
        }

        for e in &self.edges {
            if e.weight < 0.01 { continue; }
            let src_sti = self.traces[e.from].sti;
            if src_sti < 0.1 { continue; }

            // Normalized spread (OpenCog ImportanceDiffusion)
            let norm = outgoing_sum[e.from].max(0.001);
            let spread = src_sti * rate * e.weight / norm;

            sti_deltas[e.to] += spread;
            sti_deltas[e.from] -= spread; // conservation
        }

        for (i, delta) in sti_deltas.iter().enumerate() {
            self.traces[i].sti = (self.traces[i].sti + delta).max(0.0);
        }
    }

    /// Every 500ms: structural plasticity — edge sprout/death.
    pub fn tick_plasticity(&mut self) {
        // Sprout: connect AF members if not already connected
        if self.af.len() >= 2 {
            let a = self.af[0];
            for &b in self.af.iter().skip(1).take(3) {
                if a == b { continue; }
                let exists = self.edges.iter().any(|e| e.from == a && e.to == b);
                if !exists {
                    // Cosine similarity gate (Accelerate)
                    let sim = if self.traces[a].position.len() >= 16 && self.traces[b].position.len() >= 16 {
                        accel::cosine_similarity(
                            &self.traces[a].position[..16],
                            &self.traces[b].position[..16],
                        )
                    } else { 0.3 };

                    if sim > 0.1 || rand::random::<f64>() < 0.05 {
                        self.edges.push(Edge {
                            from: a, to: b,
                            weight: 0.1 * sim as f64,
                            eligibility: 0.0,
                            co_activation: 0,
                        });
                    }
                }
            }
        }

        // Death: prune weak edges
        self.edges.retain(|e| e.weight > 0.005 || e.co_activation > 2);
    }

    /// Every 5s: deep introspection.
    pub fn tick_deep(&mut self) {
        // Update demands from current state
        let hormones = self.hormones();
        self.demands.curiosity = (0.5 + hormones[0] * 0.3 - hormones[2] * 0.2).max(0.0).min(1.0);
        self.demands.comfort = (1.0 - self.accumulators[2] * 0.2).max(0.0).min(1.0);
        self.demands.competence = (1.0 - self.accumulators[0] * 0.15).max(0.0).min(1.0);
        self.demands.social = (0.3 + hormones[3] * 0.2).max(0.0).min(1.0);
    }

    // ═══════════════════════════════════════════
    // INTERNAL ALGORITHMS
    // ═══════════════════════════════════════════

    /// Hebbian binding: asymmetric OpenCog formula.
    /// conj = (s_i × s_j) + (s_j - s_i) × |s_j - s_i|
    fn hebbian_bind_af(&mut self, new_idx: usize) {
        let new_sti = self.traces[new_idx].sti;
        if new_sti < self.cfg.hebbian_threshold { return; }

        for &af_idx in &self.af {
            if af_idx == new_idx { continue; }
            let af_sti = self.traces[af_idx].sti;

            // Normalize
            let s_i = new_sti / 10.0;
            let s_j = af_sti / 10.0;

            // OpenCog asymmetric formula
            let conj = (s_i * s_j) + (s_j - s_i) * (s_j - s_i).abs();
            let conj = (conj + 1.0) / 2.0; // normalize to [0, 1]

            if conj < self.cfg.hebbian_threshold { continue; }

            // Find or create edge
            if let Some(edge) = self.edges.iter_mut().find(|e| e.from == new_idx && e.to == af_idx) {
                // EMA update
                edge.weight = 0.1 * conj + 0.9 * edge.weight;
                edge.co_activation += 1;
            } else {
                self.edges.push(Edge {
                    from: new_idx, to: af_idx,
                    weight: conj * 0.3,
                    eligibility: 0.0,
                    co_activation: 1,
                });
            }
        }
    }

    /// Sleep: uniform SHY scaling (Tononi) + replay.
    fn sleep(&mut self) {
        self.sleep_count += 1;
        self.energy = (self.energy + self.cfg.sleep_restore).min(1.5);
        self.fatigue = (self.fatigue * 0.5).max(0.0);

        // Tononi SHY: uniform downscaling for ALL edges
        let factor = 1.0 - self.cfg.sleep_shy_delta;
        for edge in &mut self.edges {
            edge.weight *= factor;
        }

        // Replay: boost top traces
        let mut top: Vec<(usize, f64)> = self.traces.iter().enumerate()
            .map(|(i, t)| (i, t.weight))
            .collect();
        top.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        for (idx, _) in top.iter().take(5) {
            self.traces[*idx].sti += 3.0;
            self.traces[*idx].freshness = (self.traces[*idx].freshness + 0.1).min(1.0);
        }
    }
}
