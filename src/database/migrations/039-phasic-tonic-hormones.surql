-- Migration 039: Phasic/Tonic Neuromodulator Dynamics
-- Each hormone = tonic baseline + phasic spike that decays exponentially.
-- Events trigger spikes. Tonic drifts slowly toward forward-pass target.
-- value = tonic + phasic (this is what brain reads)
--
-- Based on: Schultz RPE, Friston precision weighting,
-- Frémaux & Gerstner eligibility traces, HPA axis ODE.

-- ═══════════════════════════════════════════
-- 1. CONFIG: per-hormone dynamics
-- ═══════════════════════════════════════════

UPDATE kernel_state SET
  -- Phasic decay rates (per brain tick, higher = faster decay)
  -- τ in ticks: phasic *= exp(-1/τ), so τ=50 = ~50 ticks to decay
  config.tau_dopamine = config.tau_dopamine ?? 30,
  config.tau_norepinephrine = config.tau_norepinephrine ?? 20,
  config.tau_serotonin = config.tau_serotonin ?? 200,
  config.tau_cortisol = config.tau_cortisol ?? 500,

  -- Tonic drift rate (how fast baseline follows target)
  config.tonic_drift_rate = config.tonic_drift_rate ?? 0.005,

  -- Spike magnitudes per event type
  config.da_spike_reward = config.da_spike_reward ?? 0.2,
  config.da_spike_novelty = config.da_spike_novelty ?? 0.1,
  config.da_spike_neg_on_pain = config.da_spike_neg_on_pain ?? -0.15,
  config.ne_spike_pred_error = config.ne_spike_pred_error ?? 0.25,
  config.ne_spike_novelty = config.ne_spike_novelty ?? 0.15,
  config.cortisol_spike_pain = config.cortisol_spike_pain ?? 0.4,
  config.cortisol_spike_pred_error = config.cortisol_spike_pred_error ?? 0.1,
  config.serotonin_spike_convergence = config.serotonin_spike_convergence ?? 0.03,
  config.serotonin_spike_stability = config.serotonin_spike_stability ?? 0.02,

  -- Tonic baseline targets (what forward pass computes → tonic drifts toward)
  config.da_tonic_base = config.da_tonic_base ?? 0.5,
  config.ne_tonic_base = config.ne_tonic_base ?? 0.3,
  config.serotonin_tonic_base = config.serotonin_tonic_base ?? 0.5,
  config.cortisol_tonic_base = config.cortisol_tonic_base ?? 0.2,

  -- Clamp range
  config.hormone_min = config.hormone_min ?? 0.0,
  config.hormone_max = config.hormone_max ?? 1.2,
  config.phasic_cap = config.phasic_cap ?? 0.5;

-- ═══════════════════════════════════════════
-- 2. Add phasic/tonic fields to nn_node schema + seed
-- ═══════════════════════════════════════════

DEFINE FIELD IF NOT EXISTS phasic ON nn_node TYPE option<float> DEFAULT 0;
DEFINE FIELD IF NOT EXISTS tonic ON nn_node TYPE option<float> DEFAULT 0;
DEFINE FIELD IF NOT EXISTS tau ON nn_node TYPE option<int> DEFAULT 50;

UPDATE nn_node SET
  phasic = 0,
  tonic = value,
  tau = 30
WHERE node_id = 'hormone:dopamine';

UPDATE nn_node SET
  phasic = 0,
  tonic = value,
  tau = 20
WHERE node_id = 'hormone:norepinephrine';

UPDATE nn_node SET
  phasic = 0,
  tonic = value,
  tau = 200
WHERE node_id = 'hormone:serotonin';

UPDATE nn_node SET
  phasic = 0,
  tonic = value,
  tau = 500
WHERE node_id = 'hormone:cortisol';

-- ═══════════════════════════════════════════
-- 3. fn::hormone_spike — inject phasic spike into a specific hormone
-- Called by process_sensory on events
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::hormone_spike($hormone_name: string, $magnitude: float) {
  LET $cfg = (SELECT * FROM kernel_state LIMIT 1)[0].config ?? {};
  LET $phasic_cap = $cfg.phasic_cap ?? 0.5;
  LET $hmax = $cfg.hormone_max ?? 1.5;
  LET $hmin = $cfg.hormone_min ?? 0.0;
  LET $node_id = 'hormone:' + $hormone_name;

  -- Phasic is CAPPED: can't accumulate beyond phasic_cap
  -- Positive spikes: max(current, current+magnitude) capped at phasic_cap
  -- Negative spikes: min(current, current+magnitude) capped at -phasic_cap
  UPDATE nn_node SET
    phasic = math::clamp((phasic ?? 0) + $magnitude, 0.0 - $phasic_cap, $phasic_cap),
    value = math::clamp((tonic ?? 0.5) + math::clamp((phasic ?? 0) + $magnitude, 0.0 - $phasic_cap, $phasic_cap), $hmin, $hmax)
  WHERE node_id = $node_id;

  RETURN true;
};

-- ═══════════════════════════════════════════
-- 4. fn::hormone_decay_tick — phasic decay + tonic drift
-- Called every HIGH frequency tick
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::hormone_decay_tick() {
  LET $cfg = (SELECT * FROM kernel_state LIMIT 1)[0].config ?? {};
  LET $drift = $cfg.tonic_drift_rate ?? 0.005;
  LET $hmax = $cfg.hormone_max ?? 1.5;
  LET $hmin = $cfg.hormone_min ?? 0.0;

  -- Read all hormones
  LET $hormones = (SELECT id, node_id, phasic, tonic, tau FROM nn_node
    WHERE model = 'affect' AND layer = 'hidden');

  FOR $h IN $hormones {
    LET $tau = $h.tau ?? 50;
    -- Phasic decay: exponential toward 0
    -- exp(-1/τ) approximated as 1 - 1/τ for small steps (faster than math::pow)
    LET $decay_factor = 1.0 - 1.0 / $tau;
    LET $new_phasic = ($h.phasic ?? 0) * $decay_factor;

    -- Tonic drift toward forward-pass target
    -- Target comes from nn_edge weighted sum (the "mood" component)
    LET $ws = (SELECT math::sum(in.value * weight) AS s FROM nn_edge
      WHERE out = $h.id AND in.layer = 'input' GROUP ALL)[0].s ?? 0.0;
    LET $target = fn::sigmoid($ws + 0); -- bias=0 for now
    LET $new_tonic = ($h.tonic ?? 0.5) + $drift * ($target - ($h.tonic ?? 0.5));

    -- Effective value = tonic + phasic
    LET $new_value = math::clamp($new_tonic + $new_phasic, $hmin, $hmax);

    UPDATE nn_node SET
      phasic = $new_phasic,
      tonic = $new_tonic,
      value = $new_value
    WHERE id = $h.id;
  };

  RETURN true;
};

-- ═══════════════════════════════════════════
-- 5. fn::process_sensory — trigger hormone spikes on events
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::process_sensory(
  $action_id: int, $channels: array, $speech: array, $valence: float, $object_idx: int
) {
  LET $cfg = (SELECT * FROM kernel_state LIMIT 1)[0].config ?? {};

  LET $position = array::concat($channels, $speech);
  LET $padded = IF array::len($position) < 64 THEN
    array::concat($position, [0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f])
  ELSE $position END;
  LET $pos64 = array::slice($padded, 0, 64);

  LET $trace_key = type::string($action_id) + ':' + type::string($object_idx);
  LET $existing = (SELECT * FROM trace WHERE content = $trace_key AND archived = false LIMIT 1)[0];
  LET $cycle = (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0;
  LET $cap = $cfg.accumulator_cap ?? 5.0;

  IF $existing != NONE {
    -- REACTIVATION: brain has seen this before
    LET $old_charge = $existing.emotional_charge ?? 0;

    UPDATE trace SET
      weight = math::min([1.0, weight + ($cfg.reactivation_weight_boost ?? 0.1) + math::abs($valence) * ($cfg.reactivation_valence_scale ?? 0.2)]),
      freshness = 1.0,
      reactivation_count = reactivation_count + 1,
      last_reactivated_cycle = $cycle,
      position = $pos64,
      emotional_charge = emotional_charge * ($cfg.emotional_blend_old ?? 0.7) + $valence * ($cfg.emotional_blend_new ?? 0.3)
    WHERE trace_id = $existing.trace_id;

    -- Accumulators: convergence + stability (familiar = stable)
    UPDATE nn_node SET value = math::min([$cap, value + ($cfg.acc_convergence_boost ?? 0.1)]) WHERE node_id = 'acc:convergence';
    UPDATE nn_node SET value = math::min([$cap, value + ($cfg.acc_stability_boost ?? 0.15)]) WHERE node_id = 'acc:stability';

    -- Reactivation: NO phasic spikes for serotonin or dopamine
    -- Serotonin is TONIC ONLY: rises from convergence/stability via forward-pass drift
    -- Dopamine only spikes on NEW traces and explicit reward (Schultz RPE model)

    -- Valence flip = surprise → NE spike + tension
    IF ($old_charge > 0 AND $valence < 0) OR ($old_charge < 0 AND $valence > 0) {
      fn::hormone_spike('norepinephrine', $cfg.ne_spike_pred_error ?? 0.35);
      UPDATE nn_node SET value = math::min([$cap, value + ($cfg.acc_tension_on_valence_flip ?? 0.3)]) WHERE node_id = 'acc:tension';
      UPDATE nn_node SET value = math::min([$cap, value + ($cfg.acc_pred_error_boost ?? 0.3)]) WHERE node_id = 'acc:pred_error';
    };

    -- Reward/pain from valence → specific hormone spikes
    IF $valence > ($cfg.accumulator_valence_threshold ?? 0.1) {
      UPDATE nn_node SET value = math::min([$cap, value + $valence]) WHERE node_id = 'acc:reward';
      fn::hormone_spike('dopamine', $valence * ($cfg.da_spike_reward ?? 0.4));
    };
    IF $valence < (0.0 - ($cfg.accumulator_valence_threshold ?? 0.1)) {
      UPDATE nn_node SET value = math::min([$cap, value + math::abs($valence)]) WHERE node_id = 'acc:pain';
      fn::hormone_spike('cortisol', math::abs($valence) * ($cfg.cortisol_spike_pain ?? 0.5));
      fn::hormone_spike('dopamine', $valence * ($cfg.da_spike_neg_on_pain ?? -0.3));
    };

    RETURN { trace_id: $existing.trace_id, is_new: false };
  };

  -- NEW TRACE: never seen before
  LET $trace_id = 'T' + rand::string(8);
  CREATE trace CONTENT {
    trace_id: $trace_id, source_type: 'event', source_id: type::string($action_id),
    content: $trace_key,
    weight: ($cfg.initial_trace_weight ?? 0.5) + math::abs($valence) * ($cfg.initial_trace_valence_scale ?? 0.3),
    initial_weight: $cfg.initial_trace_weight ?? 0.5,
    freshness: 1.0, confidence: 0.5, emotional_charge: $valence,
    reactivation_count: 0, reactivation_history: [],
    created_at_cycle: $cycle, last_reactivated_cycle: $cycle,
    position: $pos64,
    velocity: [0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f],
    suppressed: false, archived: false
  };

  -- Accumulators: novelty + pred_error (new = surprising)
  UPDATE nn_node SET value = math::min([$cap, value + ($cfg.acc_novelty_boost ?? 0.2)]) WHERE node_id = 'acc:novelty';
  UPDATE nn_node SET value = math::min([$cap, value + ($cfg.acc_pred_error_boost ?? 0.3)]) WHERE node_id = 'acc:pred_error';

  -- Hormone spikes on new trace
  -- Dopamine: novelty is rewarding
  fn::hormone_spike('dopamine', $cfg.da_spike_novelty ?? 0.15);
  -- Norepinephrine: new = unexpected
  fn::hormone_spike('norepinephrine', $cfg.ne_spike_novelty ?? 0.2);

  IF $valence > ($cfg.accumulator_valence_threshold ?? 0.1) {
    UPDATE nn_node SET value = math::min([$cap, value + $valence]) WHERE node_id = 'acc:reward';
    fn::hormone_spike('dopamine', $valence * ($cfg.da_spike_reward ?? 0.4));
  };
  IF $valence < (0.0 - ($cfg.accumulator_valence_threshold ?? 0.1)) {
    UPDATE nn_node SET value = math::min([$cap, value + math::abs($valence)]) WHERE node_id = 'acc:pain';
    fn::hormone_spike('cortisol', math::abs($valence) * ($cfg.cortisol_spike_pain ?? 0.5));
    fn::hormone_spike('dopamine', $valence * ($cfg.da_spike_neg_on_pain ?? -0.3));
  };

  RETURN { trace_id: $trace_id, is_new: true };
};

-- ═══════════════════════════════════════════
-- 6. fn::brain_tick — hormone_decay_tick replaces forward pass for hormones
-- Backward still trains tonic targets via edge weights
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::brain_tick($n: int) {
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  LET $cfg = $state.config ?? {};

  LET $freq_crit = $cfg.freq_critical ?? 100;
  LET $freq_high = $cfg.freq_high ?? 100;
  LET $freq_trace = $cfg.freq_trace_decay ?? 50;
  LET $freq_agency = $cfg.freq_agency ?? 200;
  LET $freq_med = $cfg.freq_medium ?? 500;
  LET $freq_low = $cfg.freq_low ?? 2000;
  LET $freq_deep = $cfg.freq_deep ?? 5000;

  FOR $x IN 0..$n {
    -- CRITICAL: energy + sleep
    IF $x % $freq_crit = 0 {
      UPDATE kernel_state SET
        cycle = (cycle ?? 0) + $freq_crit,
        energy = math::max([0.0, (energy ?? 1.0) - ($cfg.energy_drain_rate ?? 0.002) * $freq_crit * (1.0 + (fatigue ?? 0.0))]),
        fatigue = math::min([1.0, (fatigue ?? 0.0) + ($cfg.fatigue_rate ?? 0.001) * $freq_crit]);
      LET $e = (SELECT * FROM kernel_state LIMIT 1)[0].energy ?? 0;
      IF $e < ($cfg.sleep_threshold ?? 0.1) {
        fn::sleep_consolidation($cfg.nn_decay_rate ?? 0.001);
        UPDATE kernel_state SET energy = math::min([($cfg.sleep_energy_cap ?? 1.5), energy + ($cfg.sleep_energy_restore ?? 0.8)]), fatigue = 0.0;
      };
    };

    -- HIGH: hormone phasic decay + tonic drift + backward learning
    IF $x % $freq_high = 0 {
      -- Phasic decay + tonic drift toward forward-pass target
      fn::hormone_decay_tick();

      -- Targeted backward: edge weights learn to predict correct tonic targets
      fn::affect_backward_targeted($cfg.affect_lr ?? 0.05);

      -- Decay accumulators
      UPDATE nn_node SET value = value * ($cfg.accumulator_decay ?? 0.99) WHERE model = 'affect' AND layer = 'input';
    };

    -- Trace decay
    IF $x % $freq_trace = 0 {
      UPDATE trace SET
        weight = weight * ($cfg.trace_weight_decay ?? 0.999),
        freshness = freshness * ($cfg.trace_freshness_decay ?? 0.999)
      WHERE archived = false AND weight > ($cfg.trace_decay_min_weight ?? 0.05);
    };

    -- AGENCY
    IF $x % $freq_agency = 0 { fn::agency_tick($x); };

    -- MEDIUM: cosine-weighted inference + forget + eligibility decay
    IF $x % $freq_med = 0 {
      fn::active_inference($cfg.active_inference_threshold ?? 0.3, $cfg.active_inference_limit ?? 10);
      fn::forget_traces($cfg.forget_weight_threshold ?? 0.02, $cfg.forget_freshness_threshold ?? 0.03);
      fn::decay_eligibility();
    };

    -- LOW: neural decay + consolidation + vector pruning
    IF $x % $freq_low = 0 {
      fn::nn_decay_all($cfg.nn_decay_rate ?? 0.001);
      fn::consolidate_episodic($cfg.consolidation_min_count ?? 3);
      IF $x % ($freq_low * ($cfg.prune_freq_multiplier ?? 3)) = 0 {
        fn::prune_dissimilar_edges($cfg.prune_min_similarity ?? 0.15);
      };
    };

    -- DEEP: world model + introspection
    IF $x % $freq_deep = 0 { fn::build_world_model(); fn::introspect(); };
  };

  RETURN (SELECT * FROM kernel_state LIMIT 1)[0];
};
