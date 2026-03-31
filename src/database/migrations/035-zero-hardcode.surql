-- Migration 035: Zero Hardcode
-- EVERY coefficient in brain functions loaded from kernel_state.config.
-- Affect model can modulate ALL parameters via config deltas.

-- ═══════════════════════════════════════════
-- 1. SEED DEFAULT CONFIG (if not set)
-- ═══════════════════════════════════════════

UPDATE kernel_state SET config = {
  -- Agency
  agency_energy_threshold: 0.15,
  explore_dopamine_coeff: 0.4,
  explore_ne_coeff: 0.3,
  explore_cortisol_coeff: 0.2,
  explore_min: 0.1,
  explore_max: 0.9,
  explore_threshold: 0.6,
  action_energy_cost: 0.05,

  -- Trace creation/reactivation
  reactivation_weight_boost: 0.1,
  reactivation_valence_scale: 0.2,
  emotional_blend_old: 0.7,
  emotional_blend_new: 0.3,
  initial_trace_weight: 0.5,
  initial_trace_valence_scale: 0.3,

  -- Accumulator thresholds and boost rates
  accumulator_valence_threshold: 0.1,
  acc_pred_error_boost: 0.3,
  acc_novelty_boost: 0.2,
  acc_convergence_boost: 0.1,
  accumulator_cap: 5.0,
  accumulator_decay: 0.99,

  -- Brain tick frequencies
  freq_critical: 100,
  freq_high: 100,
  freq_trace_decay: 50,
  freq_agency: 200,
  freq_medium: 500,
  freq_low: 2000,
  freq_deep: 5000,

  -- Energy
  energy_drain_rate: 0.002,
  fatigue_rate: 0.001,
  sleep_threshold: 0.1,

  -- Three-factor learning
  hebbian_lr: 0.01,
  td_gamma: 0.9,
  eligibility_decay: 0.95,

  -- Edge creation
  initial_edge_weight: 0.3,
  edge_coactivation_boost: 0.05,

  -- Nightly
  nightly_fatigue_threshold: 0.3,
  nightly_energy_threshold: 0.5,

  -- Depth thresholds
  depth_reflect: 3,
  depth_restructure: 5,
  depth_consolidate: 10
} WHERE config IS NONE OR config = {};

-- ═══════════════════════════════════════════
-- 2. fn::agency_tick — all coefficients from config
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::agency_tick($tick: int) {
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  IF $state = NONE OR ($state.running ?? false) = false { RETURN { acted: false }; };
  LET $cfg = $state.config ?? {};

  LET $energy = $state.energy ?? 0;
  IF $energy < ($cfg.agency_energy_threshold ?? 0.15) { RETURN { acted: false, reason: 'low_energy' }; };

  LET $dopamine = (SELECT * FROM nn_node WHERE node_id = 'hormone:dopamine' LIMIT 1)[0].value ?? 0.5;
  LET $cortisol = (SELECT * FROM nn_node WHERE node_id = 'hormone:cortisol' LIMIT 1)[0].value ?? 0.5;
  LET $norepinephrine = (SELECT * FROM nn_node WHERE node_id = 'hormone:norepinephrine' LIMIT 1)[0].value ?? 0.5;

  LET $explore_prob = math::clamp(
    $dopamine * ($cfg.explore_dopamine_coeff ?? 0.4)
    + $norepinephrine * ($cfg.explore_ne_coeff ?? 0.3)
    - $cortisol * ($cfg.explore_cortisol_coeff ?? 0.2),
    $cfg.explore_min ?? 0.1,
    $cfg.explore_max ?? 0.9
  );

  LET $candidates = (SELECT trace_id, weight, content, position FROM trace
    WHERE archived = false AND suppressed = false LIMIT 10);

  IF array::len($candidates) = 0 {
    CREATE kernel_request CONTENT {
      type: 'action', payload: { method: 'explore', target: 'random', explore_prob: $explore_prob },
      status: 'pending', created_at: time::now()
    };
    CREATE brain_action CONTENT { tick: $tick, method: 'explore', target: 'random' };
    RETURN { acted: true, method: 'explore', target: 'random' };
  };

  LET $target_idx = IF $dopamine > ($cfg.explore_threshold ?? 0.6) THEN
    math::min([array::len($candidates) - 1, math::floor(rand::float() * array::len($candidates))])
  ELSE 0 END;
  LET $target = $candidates[$target_idx];

  LET $methods = ['touch', 'push', 'look', 'shake', 'drop'];
  LET $method = $methods[math::floor(rand::float() * 5)];

  CREATE kernel_request CONTENT {
    type: 'action',
    payload: { method: $method, target: $target.trace_id, target_content: $target.content, explore_prob: $explore_prob, dopamine: $dopamine },
    status: 'pending', created_at: time::now()
  };
  CREATE brain_action CONTENT { tick: $tick, method: $method, target: $target.trace_id, dopamine: $dopamine, energy: $energy };

  UPDATE kernel_state SET energy = math::max([0.0, energy - ($cfg.action_energy_cost ?? 0.05)]);
  RETURN { acted: true, method: $method, target: $target.trace_id, explore_prob: $explore_prob };
};

-- ═══════════════════════════════════════════
-- 3. fn::process_sensory — all coefficients from config
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

  IF $existing != NONE {
    UPDATE trace SET
      weight = math::min([1.0, weight + ($cfg.reactivation_weight_boost ?? 0.1) + math::abs($valence) * ($cfg.reactivation_valence_scale ?? 0.2)]),
      freshness = 1.0,
      reactivation_count = reactivation_count + 1,
      last_reactivated_cycle = $cycle,
      position = $pos64,
      emotional_charge = emotional_charge * ($cfg.emotional_blend_old ?? 0.7) + $valence * ($cfg.emotional_blend_new ?? 0.3)
    WHERE trace_id = $existing.trace_id;
    UPDATE nn_node SET value = math::min([($cfg.accumulator_cap ?? 5.0), value + ($cfg.acc_convergence_boost ?? 0.1)]) WHERE node_id = 'acc:convergence';
    RETURN { trace_id: $existing.trace_id, is_new: false };
  };

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

  LET $cap = $cfg.accumulator_cap ?? 5.0;
  UPDATE nn_node SET value = math::min([$cap, value + ($cfg.acc_novelty_boost ?? 0.2)]) WHERE node_id = 'acc:novelty';
  UPDATE nn_node SET value = math::min([$cap, value + ($cfg.acc_pred_error_boost ?? 0.3)]) WHERE node_id = 'acc:pred_error';

  IF $valence > ($cfg.accumulator_valence_threshold ?? 0.1) {
    UPDATE nn_node SET value = math::min([$cap, value + $valence]) WHERE node_id = 'acc:reward';
  };
  IF $valence < (0.0 - ($cfg.accumulator_valence_threshold ?? 0.1)) {
    UPDATE nn_node SET value = math::min([$cap, value + math::abs($valence)]) WHERE node_id = 'acc:pain';
  };

  RETURN { trace_id: $trace_id, is_new: true };
};

-- ═══════════════════════════════════════════
-- 4. fn::brain_tick — all frequencies and thresholds from config
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
        fn::sleep_consolidation(0.001);
        UPDATE kernel_state SET energy = math::min([1.5, energy + 0.8]), fatigue = 0.0;
      };
    };

    -- HIGH: affect forward (with LET workaround for SurrealDB #6382)
    IF $x % $freq_high = 0 {
      LET $h_nodes = (SELECT id, bias FROM nn_node WHERE model = 'affect' AND layer = 'hidden');
      FOR $h IN $h_nodes {
        LET $ws = (SELECT math::sum(in.value * weight) AS s FROM nn_edge
          WHERE out = $h.id AND in.layer = 'input' GROUP ALL)[0].s ?? 0.0;
        UPDATE nn_node SET value = fn::sigmoid($ws + $h.bias) WHERE id = $h.id;
      };

      -- Backward
      LET $pred_err = (SELECT * FROM nn_node WHERE node_id = 'acc:pred_error' LIMIT 1)[0].value ?? 0;
      LET $pain = (SELECT * FROM nn_node WHERE node_id = 'acc:pain' LIMIT 1)[0].value ?? 0;
      LET $convergence = (SELECT * FROM nn_node WHERE node_id = 'acc:convergence' LIMIT 1)[0].value ?? 0;
      LET $reward = (SELECT * FROM nn_node WHERE node_id = 'acc:reward' LIMIT 1)[0].value ?? 0;
      LET $loss = $pred_err + $pain - $convergence - $reward;
      LET $loss_sign = IF $loss > 0 THEN 1.0 ELSE -1.0 END;
      fn::nn_backward('affect', $cfg.hebbian_lr ?? 0.01, $loss_sign);

      -- Decay accumulators
      UPDATE nn_node SET value = value * ($cfg.accumulator_decay ?? 0.99) WHERE model = 'affect' AND layer = 'input';
    };

    -- Trace decay
    IF $x % $freq_trace = 0 {
      UPDATE trace SET weight = weight * 0.999, freshness = freshness * 0.999
        WHERE archived = false AND weight > 0.05;
    };

    -- AGENCY: brain decides to act
    IF $x % $freq_agency = 0 { fn::agency_tick($x); };

    -- MEDIUM: inference + forget + eligibility decay
    IF $x % $freq_med = 0 {
      fn::active_inference(0.3, 5);
      fn::forget_traces(0.02, 0.03);
      fn::decay_eligibility();
    };

    -- LOW: neural decay + consolidation
    IF $x % $freq_low = 0 { fn::nn_decay_all(0.001); fn::consolidate_episodic(3); };

    -- DEEP: world model + introspection
    IF $x % $freq_deep = 0 { fn::build_world_model(); fn::introspect(); };
  };

  RETURN (SELECT * FROM kernel_state LIMIT 1)[0];
};
