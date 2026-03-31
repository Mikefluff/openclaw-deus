-- Migration 041: Self-Tuning Brain
-- 1. Log-space config modulation (no hardcoded ranges)
-- 2. Mode learning via REINFORCE (reward-modulated)
-- 3. Consolidation replay during pause/sleep
-- 4. All remaining hardcodes → config

-- ═══════════════════════════════════════════
-- 1. CONFIG: self-tuning params
-- ═══════════════════════════════════════════

UPDATE kernel_state SET
  -- Log-space sensitivity: how much affect output can shift each param
  -- Higher = more modulation range. 0 = no modulation.
  config.log_sensitivity = config.log_sensitivity ?? 0.3,

  -- Mode learning
  config.mode_lr = config.mode_lr ?? 0.02,
  config.mode_baseline_decay = config.mode_baseline_decay ?? 0.95,
  config.mode_valence_baseline = config.mode_valence_baseline ?? 0.0,

  -- Consolidation
  config.consolidation_replay_count = config.consolidation_replay_count ?? 10,
  config.consolidation_homeostatic_target = config.consolidation_homeostatic_target ?? 0.3,
  config.consolidation_homeostatic_rate = config.consolidation_homeostatic_rate ?? 0.05,

  -- Agency mode thresholds (were hardcoded)
  config.mode_energy_resting = config.mode_energy_resting ?? 0.5,
  config.mode_energy_defensive = config.mode_energy_defensive ?? 0.3,
  config.mode_explore_boost = config.mode_explore_boost ?? 0.2,
  config.mode_exploit_reduction = config.mode_exploit_reduction ?? 0.3,
  config.mode_defensive_reduction = config.mode_defensive_reduction ?? 0.4,
  config.behavioral_mode_default = config.behavioral_mode_default ?? 'explore',

  -- Embedding dimension (was hardcoded 64)
  config.sensory_embedding_dim = config.sensory_embedding_dim ?? 64,

  -- Activation clamp ranges (were hardcoded)
  config.tanh_clamp = config.tanh_clamp ?? 5.0,
  config.softmax_clamp = config.softmax_clamp ?? 10.0,

  -- Store initial defaults for log-space computation
  -- affect output modulates AROUND these values multiplicatively
  config.default_hebbian_lr = config.default_hebbian_lr ?? 0.01,
  config.default_agency_energy_threshold = config.default_agency_energy_threshold ?? 0.15,
  config.default_spread_weight_rate = config.default_spread_weight_rate ?? 0.05,
  config.default_accumulator_valence_threshold = config.default_accumulator_valence_threshold ?? 0.1,
  config.default_reactivation_weight_boost = config.default_reactivation_weight_boost ?? 0.1,
  config.default_trace_freshness_decay = config.default_trace_freshness_decay ?? 0.999;

-- ═══════════════════════════════════════════
-- 2. fn::apply_config_deltas — log-space modulation
-- output tanh in [-1,1] → param = default × exp(tanh × sensitivity)
-- No hardcoded ranges. Sensitivity controls all.
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::apply_config_deltas() {
  LET $cfg = (SELECT * FROM kernel_state LIMIT 1)[0].config ?? {};
  LET $s = $cfg.log_sensitivity ?? 0.3;

  LET $outputs = (SELECT node_id, value FROM nn_node WHERE model = 'affect' AND layer = 'output');

  FOR $o IN $outputs {
    LET $name = string::replace($o.node_id, 'config:', '');
    LET $t = $o.value ?? 0;
    -- Multiplicative modulation: param = default × exp(tanh × sensitivity)
    LET $multiplier = math::pow(math::E, $t * $s);

    IF $name = 'convergence_threshold' {
      LET $d = $cfg.default_accumulator_valence_threshold ?? 0.1;
      UPDATE kernel_state SET config.accumulator_valence_threshold = $d * $multiplier;
    };
    IF $name = 'spread_factor' {
      LET $d = $cfg.default_spread_weight_rate ?? 0.05;
      UPDATE kernel_state SET config.spread_weight_rate = $d * $multiplier;
    };
    IF $name = 'hebbian_lr' {
      LET $d = $cfg.default_hebbian_lr ?? 0.01;
      UPDATE kernel_state SET config.hebbian_lr = $d * $multiplier;
    };
    IF $name = 'energy_threshold' {
      LET $d = $cfg.default_agency_energy_threshold ?? 0.15;
      UPDATE kernel_state SET config.agency_energy_threshold = $d * $multiplier;
    };
    IF $name = 'activation_boost' {
      LET $d = $cfg.default_reactivation_weight_boost ?? 0.1;
      UPDATE kernel_state SET config.reactivation_weight_boost = $d * $multiplier;
    };
    IF $name = 'freshness_decay' {
      -- Special: decay rate stays close to 1, use additive instead
      LET $d = $cfg.default_trace_freshness_decay ?? 0.999;
      LET $shift = (1.0 - $d) * $t * $s;
      UPDATE kernel_state SET config.trace_freshness_decay = $d + $shift;
    };
  };

  RETURN true;
};

-- ═══════════════════════════════════════════
-- 3. fn::affect_forward_output — clamp ranges from config
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::affect_forward_output() {
  LET $cfg = (SELECT * FROM kernel_state LIMIT 1)[0].config ?? {};
  LET $tc = $cfg.tanh_clamp ?? 5.0;
  LET $sc = $cfg.softmax_clamp ?? 10.0;

  -- Config output: hidden → output (tanh activation)
  LET $out_nodes = (SELECT id, node_id, bias FROM nn_node WHERE model = 'affect' AND layer = 'output');
  FOR $o IN $out_nodes {
    LET $ws = (SELECT math::sum(in.value * weight) AS s FROM nn_edge
      WHERE out = $o.id AND in.layer = 'hidden' GROUP ALL)[0].s ?? 0.0;
    LET $raw = $ws + ($o.bias ?? 0);
    LET $clamped = math::clamp($raw, 0.0 - $tc, $tc);
    LET $ex = math::pow(math::E, $clamped);
    LET $enx = math::pow(math::E, 0.0 - $clamped);
    LET $tanh_val = ($ex - $enx) / ($ex + $enx);
    UPDATE nn_node SET value = $tanh_val WHERE id = $o.id;
  };

  -- Mode output: hidden → mode (linear, then softmax)
  LET $mode_nodes = (SELECT id, node_id, bias FROM nn_node WHERE model = 'affect' AND layer = 'mode');
  FOR $m IN $mode_nodes {
    LET $ws = (SELECT math::sum(in.value * weight) AS s FROM nn_edge
      WHERE out = $m.id AND in.layer = 'hidden' GROUP ALL)[0].s ?? 0.0;
    UPDATE nn_node SET value = $ws + ($m.bias ?? 0) WHERE id = $m.id;
  };

  -- Softmax over mode nodes
  LET $modes = (SELECT id, node_id, value FROM nn_node WHERE model = 'affect' AND layer = 'mode');
  -- Find max for numerical stability
  LET $max_v = 0.0;
  FOR $m IN $modes { IF ($m.value ?? 0) > $max_v { LET $max_v = $m.value; }; };

  LET $sum_exp = 0.0;
  FOR $m IN $modes {
    LET $sum_exp = $sum_exp + math::pow(math::E, math::clamp(($m.value ?? 0) - $max_v, 0.0 - $sc, 0.0));
  };
  IF $sum_exp = 0 { LET $sum_exp = 1.0; };

  FOR $m IN $modes {
    LET $prob = math::pow(math::E, math::clamp(($m.value ?? 0) - $max_v, 0.0 - $sc, 0.0)) / $sum_exp;
    UPDATE nn_node SET value = $prob WHERE id = $m.id;
  };

  RETURN true;
};

-- ═══════════════════════════════════════════
-- 4. fn::mode_learn — REINFORCE: reinforce mode that led to good outcomes
-- Called after each action with valence feedback
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::mode_learn($valence: float) {
  LET $cfg = (SELECT * FROM kernel_state LIMIT 1)[0].config ?? {};
  LET $lr = $cfg.mode_lr ?? 0.02;
  LET $baseline_decay = $cfg.mode_baseline_decay ?? 0.95;

  -- Update running baseline
  LET $baseline = $cfg.mode_valence_baseline ?? 0.0;
  LET $new_baseline = $baseline * $baseline_decay + $valence * (1.0 - $baseline_decay);
  UPDATE kernel_state SET config.mode_valence_baseline = $new_baseline;

  -- Advantage = how much better/worse than expected
  LET $advantage = $valence - $baseline;

  -- Get current mode probabilities
  LET $modes = (SELECT id, node_id, value FROM nn_node WHERE model = 'affect' AND layer = 'mode');

  -- Find which mode is active (highest probability)
  LET $best_id = $modes[0].id;
  LET $best_prob = 0.0;
  FOR $m IN $modes {
    IF ($m.value ?? 0) > $best_prob {
      LET $best_id = $m.id;
      LET $best_prob = $m.value;
    };
  };

  -- REINFORCE gradient: Δw = lr × advantage × ∂log(π)/∂w
  -- For softmax: ∂log(π_i)/∂w_ij = (1_{i=selected} - π_i) × input_j
  FOR $m IN $modes {
    LET $is_selected = IF $m.id = $best_id THEN 1.0 ELSE 0.0 END;
    LET $grad_logpi = $is_selected - ($m.value ?? 0.25);

    -- Update edges TO this mode node
    LET $edges = (SELECT id, weight, in.value AS iv FROM nn_edge
      WHERE out = $m.id AND in.layer = 'hidden');
    FOR $e IN $edges {
      LET $dw = $lr * $advantage * $grad_logpi * ($e.iv ?? 0.5);
      UPDATE nn_edge SET
        weight = weight + $dw,
        update_count = (update_count ?? 0) + 1
      WHERE id = $e.id;
    };
  };

  RETURN { advantage: $advantage, baseline: $new_baseline };
};

-- ═══════════════════════════════════════════
-- 5. fn::consolidation_replay — replay recent traces during pause
-- Reactivates memories, fires learn_edge, strengthens strong patterns
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::consolidation_replay() {
  LET $cfg = (SELECT * FROM kernel_state LIMIT 1)[0].config ?? {};
  LET $n = $cfg.consolidation_replay_count ?? 10;

  -- Pick top-N traces by weight × reactivation_count (most important memories)
  LET $traces = (SELECT id, trace_id, weight, emotional_charge, position FROM trace
    WHERE archived = false AND weight > 0.1
    LIMIT $n);

  LET $replayed = 0;
  FOR $t IN $traces {
    -- Replay: reactivate trace (boost weight, refresh)
    UPDATE trace SET
      weight = math::min([1.0, weight + 0.02]),
      freshness = math::min([1.0, freshness + 0.1]),
      reactivation_count = reactivation_count + 1
    WHERE id = $t.id;

    -- Re-fire learn_edge between replayed traces (strengthen associations)
    LET $others = (SELECT id FROM trace WHERE archived = false AND id != $t.id AND weight > 0.1 LIMIT 3);
    FOR $o IN $others {
      IF $o.id IS NOT NONE AND $t.id IS NOT NONE {
        fn::learn_edge($o.id, $t.id, $t.emotional_charge ?? 0, $cfg.consolidation_homeostatic_rate ?? 0.05);
      };
    };
    LET $replayed = $replayed + 1;
  };

  RETURN { replayed: $replayed };
};

-- ═══════════════════════════════════════════
-- 6. fn::synaptic_homeostasis — scale weights toward target mean
-- Preserves relative strength while preventing runaway growth/death
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::synaptic_homeostasis() {
  LET $cfg = (SELECT * FROM kernel_state LIMIT 1)[0].config ?? {};
  LET $target = $cfg.consolidation_homeostatic_target ?? 0.3;
  LET $rate = $cfg.consolidation_homeostatic_rate ?? 0.05;

  -- Get mean edge weight
  LET $stats = (SELECT math::mean(weight) AS mean_w FROM activates WHERE weight > 0.01 GROUP ALL)[0];
  LET $mean_w = $stats.mean_w ?? $target;

  -- Scale factor: pull toward target mean
  IF $mean_w > 0.01 {
    LET $scale = 1.0 + $rate * ($target / $mean_w - 1.0);
    UPDATE activates SET weight = math::clamp(weight * $scale, 0.01, 1.0) WHERE weight > 0.01;
  };

  RETURN { mean_before: $mean_w, target: $target };
};

-- ═══════════════════════════════════════════
-- 7. fn::sleep_consolidation OVERWRITE — now includes replay + homeostasis
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::sleep_consolidation($decay_rate: float) {
  -- Phase 1: Neural weight decay (existing behavior)
  fn::nn_decay_all($decay_rate);

  -- Phase 2: Memory replay — reactivate important traces
  fn::consolidation_replay();

  -- Phase 3: Synaptic homeostasis — normalize edge weights
  fn::synaptic_homeostasis();

  -- Phase 4: Prune weak edges
  fn::prune_dissimilar_edges(0.1);

  RETURN true;
};

-- ═══════════════════════════════════════════
-- 8. fn::agency_tick — all thresholds from config
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::agency_tick($tick: int) {
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  IF $state = NONE OR ($state.running ?? false) = false { RETURN { acted: false }; };
  LET $cfg = $state.config ?? {};

  LET $energy = $state.energy ?? 0;
  IF $energy < ($cfg.agency_energy_threshold ?? 0.15) { RETURN { acted: false, reason: 'low_energy' }; };

  LET $mode = fn::get_behavioral_mode();
  LET $mode_name = $mode.name ?? ($cfg.behavioral_mode_default ?? 'explore');

  -- Mode-specific energy thresholds (all from config)
  IF $mode_name = 'resting' AND $energy < ($cfg.mode_energy_resting ?? 0.5) { RETURN { acted: false, reason: 'resting_mode' }; };
  IF $mode_name = 'defensive' AND $energy < ($cfg.mode_energy_defensive ?? 0.3) { RETURN { acted: false, reason: 'defensive_low_energy' }; };

  LET $dopamine = (SELECT * FROM nn_node WHERE node_id = 'hormone:dopamine' LIMIT 1)[0].value ?? 0.5;
  LET $cortisol = (SELECT * FROM nn_node WHERE node_id = 'hormone:cortisol' LIMIT 1)[0].value ?? 0.5;
  LET $norepinephrine = (SELECT * FROM nn_node WHERE node_id = 'hormone:norepinephrine' LIMIT 1)[0].value ?? 0.5;

  LET $explore_base = math::clamp(
    $dopamine * ($cfg.explore_dopamine_coeff ?? 0.4)
    + $norepinephrine * ($cfg.explore_ne_coeff ?? 0.3)
    - $cortisol * ($cfg.explore_cortisol_coeff ?? 0.2),
    $cfg.explore_min ?? 0.1,
    $cfg.explore_max ?? 0.9
  );

  -- Mode modulation (all from config)
  LET $explore_prob = IF $mode_name = 'explore' THEN math::min([0.95, $explore_base + ($cfg.mode_explore_boost ?? 0.2)])
    ELSE IF $mode_name = 'exploit' THEN math::max([0.05, $explore_base - ($cfg.mode_exploit_reduction ?? 0.3)])
    ELSE IF $mode_name = 'defensive' THEN math::max([0.05, $explore_base - ($cfg.mode_defensive_reduction ?? 0.4)])
    ELSE $explore_base
  END;

  LET $candidates = (SELECT trace_id, weight, content, position FROM trace
    WHERE archived = false AND suppressed = false LIMIT 10);

  IF array::len($candidates) = 0 {
    CREATE kernel_request CONTENT {
      type: 'action', payload: { method: 'explore', target: 'random', explore_prob: $explore_prob, mode: $mode_name },
      status: 'pending', created_at: time::now()
    };
    CREATE brain_action CONTENT { tick: $tick, method: 'explore', target: 'random', mode: $mode_name };
    RETURN { acted: true, method: 'explore', target: 'random', mode: $mode_name };
  };

  LET $target_idx = IF $explore_prob > rand::float() THEN
    math::min([array::len($candidates) - 1, math::floor(rand::float() * array::len($candidates))])
  ELSE 0 END;
  LET $target = $candidates[$target_idx];

  LET $methods = ['touch', 'push', 'look', 'shake', 'drop'];
  LET $method = $methods[math::floor(rand::float() * array::len($methods))];

  CREATE kernel_request CONTENT {
    type: 'action',
    payload: { method: $method, target: $target.trace_id, target_content: $target.content, explore_prob: $explore_prob, dopamine: $dopamine, mode: $mode_name },
    status: 'pending', created_at: time::now()
  };
  CREATE brain_action CONTENT { tick: $tick, method: $method, target: $target.trace_id, dopamine: $dopamine, energy: $energy, mode: $mode_name };

  UPDATE kernel_state SET energy = math::max([0.0, energy - ($cfg.action_energy_cost ?? 0.05)]);
  RETURN { acted: true, method: $method, target: $target.trace_id, explore_prob: $explore_prob, mode: $mode_name };
};

-- ═══════════════════════════════════════════
-- 9. fn::process_sensory — trigger mode learning after valence events
-- ═══════════════════════════════════════════

-- Add mode learning to the end of process_sensory when there's a significant valence
-- (not overwriting the whole function — just need to call fn::mode_learn after actions with valence)
-- This is done in the membrane (multi-session.ts) after each action consequence.

-- ═══════════════════════════════════════════
-- 10. fn::brain_tick — add consolidation replay on LOW frequency
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

    -- HIGH: hormone phasic decay + output layer + config deltas + backward
    IF $x % $freq_high = 0 {
      fn::hormone_decay_tick();
      fn::affect_forward_output();
      fn::apply_config_deltas();
      fn::affect_backward_targeted($cfg.affect_lr ?? 0.05);
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

    -- LOW: neural decay + consolidation + replay + homeostasis + vector pruning
    IF $x % $freq_low = 0 {
      fn::nn_decay_all($cfg.nn_decay_rate ?? 0.001);
      fn::consolidate_episodic($cfg.consolidation_min_count ?? 3);
      fn::consolidation_replay();
      IF $x % ($freq_low * ($cfg.prune_freq_multiplier ?? 3)) = 0 {
        fn::prune_dissimilar_edges($cfg.prune_min_similarity ?? 0.15);
        fn::synaptic_homeostasis();
      };
    };

    -- DEEP: world model + introspection
    IF $x % $freq_deep = 0 { fn::build_world_model(); fn::introspect(); };
  };

  RETURN (SELECT * FROM kernel_state LIMIT 1)[0];
};
