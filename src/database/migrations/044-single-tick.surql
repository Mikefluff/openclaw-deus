-- Migration 044: Single-Tick Architecture
-- ONE roundtrip per world tick: fn::world_tick($sensory_events) → action request
-- Eliminates 8 JS roundtrips → 1. All logic inside SurrealDB.
--
-- Also: indexes for hot queries, cached config reads.

-- ═══════════════════════════════════════════
-- 1. INDEXES for hot-path queries
-- ═══════════════════════════════════════════

DEFINE INDEX IF NOT EXISTS idx_trace_content ON trace FIELDS content, archived;
DEFINE INDEX IF NOT EXISTS idx_nn_node_id ON nn_node FIELDS node_id;
DEFINE INDEX IF NOT EXISTS idx_nn_node_model ON nn_node FIELDS model, layer;
DEFINE INDEX IF NOT EXISTS idx_action_value_key ON action_value FIELDS key UNIQUE;
DEFINE INDEX IF NOT EXISTS idx_activates_endpoints ON activates FIELDS in, out;
DEFINE INDEX IF NOT EXISTS idx_cognitive_event_content ON cognitive_event FIELDS outcome_content;
DEFINE INDEX IF NOT EXISTS idx_kernel_request_status ON kernel_request FIELDS type, status;

-- ═══════════════════════════════════════════
-- 2. fn::world_tick — ONE call per world tick
-- Input: array of sensory events [{action_id, channels, speech, valence, object_idx}]
-- Output: {action: {method, target_content, predicted_valence} | null, stats}
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::world_tick($events: array, $brain_ticks: int) {
  LET $cfg = (SELECT * FROM kernel_state LIMIT 1)[0].config ?? {};
  LET $cycle = (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0;

  -- ── Phase 1: PERCEIVE — process all sensory events ──
  LET $new_traces = [];
  FOR $ev IN $events {
    LET $result = fn::process_sensory(
      $ev.action_id ?? 0,
      $ev.channels ?? [],
      $ev.speech ?? [],
      $ev.valence ?? 0,
      $ev.object_idx ?? 0
    );
  };

  -- ── Phase 2: THINK — run brain internal cycles ──
  fn::brain_tick($brain_ticks);

  -- ── Phase 3: ACT — check if brain wants to do something ──
  LET $pending = (SELECT * FROM kernel_request
    WHERE type = 'action' AND status = 'pending' LIMIT 1)[0];

  IF $pending = NONE {
    RETURN { action: NONE, cycle: $cycle };
  };

  -- Mark as processing
  UPDATE kernel_request SET status = 'processing' WHERE id = $pending.id;

  LET $method = $pending.payload.method ?? 'touch';
  LET $target_content = $pending.payload.target_content ?? '';
  LET $predicted_valence = $pending.payload.predicted_valence ?? 0;

  RETURN {
    action: {
      method: $method,
      target_content: $target_content,
      predicted_valence: $predicted_valence,
      request_id: $pending.id
    },
    cycle: (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0
  };
};

-- ═══════════════════════════════════════════
-- 3. fn::action_consequence — process result of brain's action
-- Called AFTER world executes the action and returns consequence
-- Does: process_sensory + cognitive_cycle + mark request done
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::action_consequence(
  $request_id: any,
  $action_method: string,
  $target_content: string,
  $consequence_channels: array,
  $consequence_speech: array,
  $consequence_valence: float,
  $consequence_object_idx: int,
  $consequence_action_id: int
) {
  -- Process the consequence as sensory input
  LET $sensory = fn::process_sensory(
    $consequence_action_id,
    $consequence_channels,
    $consequence_speech,
    $consequence_valence,
    $consequence_object_idx
  );

  -- Run cognitive cycle: appraise → predict → deliberate → commit → learn
  LET $trace_id = $sensory.trace_id ?? '';
  LET $cognitive = fn::cognitive_cycle(
    $trace_id,
    $action_method,
    $target_content,
    $consequence_valence
  );

  -- Mark request completed
  IF $request_id IS NOT NONE {
    UPDATE kernel_request SET status = 'completed' WHERE id = $request_id;
  };

  RETURN {
    trace_id: $trace_id,
    cognitive: $cognitive
  };
};

-- ═══════════════════════════════════════════
-- 4. fn::hormone_decay_tick — BATCHED (no FOR loop)
-- Single UPDATE with computed targets per hormone
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::hormone_decay_tick() {
  LET $cfg = (SELECT * FROM kernel_state LIMIT 1)[0].config ?? {};
  LET $drift = $cfg.tonic_drift_rate ?? 0.005;
  LET $hmax = $cfg.hormone_max ?? 1.2;
  LET $hmin = $cfg.hormone_min ?? 0.0;

  -- Compute all tonic targets in one batch read
  LET $hormones = (SELECT id, node_id, phasic, tonic, tau,
    (SELECT math::sum(in.value * weight) AS s FROM nn_edge
      WHERE out = $parent.id AND in.layer = 'input' GROUP ALL)[0].s AS edge_sum
    FROM nn_node WHERE model = 'affect' AND layer = 'hidden');

  -- Batch update all hormones
  FOR $h IN $hormones {
    LET $tau = $h.tau ?? 50;
    LET $decay_factor = 1.0 - 1.0 / $tau;
    LET $new_phasic = ($h.phasic ?? 0) * $decay_factor;
    LET $target = fn::sigmoid(($h.edge_sum ?? 0) + 0);
    LET $new_tonic = ($h.tonic ?? 0.5) + $drift * ($target - ($h.tonic ?? 0.5));
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
-- 5. fn::affect_forward_output — use $parent for batch edge sums
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::affect_forward_output() {
  LET $cfg = (SELECT * FROM kernel_state LIMIT 1)[0].config ?? {};
  LET $tc = $cfg.tanh_clamp ?? 5.0;
  LET $sc = $cfg.softmax_clamp ?? 10.0;

  -- Config output: batch compute edge sums with $parent
  LET $out_nodes = (SELECT id, node_id, bias,
    (SELECT math::sum(in.value * weight) AS s FROM nn_edge
      WHERE out = $parent.id AND in.layer = 'hidden' GROUP ALL)[0].s AS edge_sum
    FROM nn_node WHERE model = 'affect' AND layer = 'output');

  FOR $o IN $out_nodes {
    LET $raw = ($o.edge_sum ?? 0) + ($o.bias ?? 0);
    LET $clamped = math::clamp($raw, 0.0 - $tc, $tc);
    LET $ex = math::pow(math::E, $clamped);
    LET $enx = math::pow(math::E, 0.0 - $clamped);
    UPDATE nn_node SET value = ($ex - $enx) / ($ex + $enx) WHERE id = $o.id;
  };

  -- Mode output: batch edge sums then softmax
  LET $mode_nodes = (SELECT id, node_id, bias,
    (SELECT math::sum(in.value * weight) AS s FROM nn_edge
      WHERE out = $parent.id AND in.layer = 'hidden' GROUP ALL)[0].s AS edge_sum
    FROM nn_node WHERE model = 'affect' AND layer = 'mode');

  FOR $m IN $mode_nodes {
    UPDATE nn_node SET value = ($m.edge_sum ?? 0) + ($m.bias ?? 0) WHERE id = $m.id;
  };

  -- Softmax using .map()
  LET $modes = (SELECT id, node_id, value FROM nn_node WHERE model = 'affect' AND layer = 'mode');
  LET $vals = $modes.map(|$m| $m.value ?? 0);
  LET $max_v = math::max($vals) ?? 0;
  LET $exps = $vals.map(|$v| math::pow(math::E, math::clamp($v - $max_v, 0.0 - $sc, 0.0)));
  LET $sum_exp = math::sum($exps) ?? 1.0;
  IF $sum_exp = 0 { LET $sum_exp = 1.0; };

  FOR $i IN 0..array::len($modes) {
    LET $prob = math::max([0.0, $exps[$i] / $sum_exp]);
    UPDATE nn_node SET value = $prob WHERE id = $modes[$i].id;
  };

  RETURN true;
};

-- ═══════════════════════════════════════════
-- 6. fn::apply_config_deltas — single batch UPDATE
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::apply_config_deltas() {
  LET $cfg = (SELECT * FROM kernel_state LIMIT 1)[0].config ?? {};
  LET $s = $cfg.log_sensitivity ?? 0.3;

  -- Read ALL output values in one query
  LET $outputs = (SELECT node_id, value FROM nn_node WHERE model = 'affect' AND layer = 'output');

  -- Build multipliers using .map() — no FOR loop
  LET $convergence_t = 0.0;
  LET $spread_t = 0.0;
  LET $lr_t = 0.0;
  LET $energy_t = 0.0;
  LET $activation_t = 0.0;
  LET $freshness_t = 0.0;
  LET $endurance_t = 0.0;
  LET $sleep_t = 0.0;

  -- SurrealDB LET doesn't mutate in FOR, so we extract directly
  LET $conv_node = (SELECT * FROM nn_node WHERE node_id = 'config:convergence_threshold' LIMIT 1)[0].value ?? 0;
  LET $spread_node = (SELECT * FROM nn_node WHERE node_id = 'config:spread_factor' LIMIT 1)[0].value ?? 0;
  LET $lr_node = (SELECT * FROM nn_node WHERE node_id = 'config:hebbian_lr' LIMIT 1)[0].value ?? 0;
  LET $energy_node = (SELECT * FROM nn_node WHERE node_id = 'config:energy_threshold' LIMIT 1)[0].value ?? 0;
  LET $activation_node = (SELECT * FROM nn_node WHERE node_id = 'config:activation_boost' LIMIT 1)[0].value ?? 0;
  LET $freshness_node = (SELECT * FROM nn_node WHERE node_id = 'config:freshness_decay' LIMIT 1)[0].value ?? 0;
  LET $endurance_node = (SELECT * FROM nn_node WHERE node_id = 'config:endurance' LIMIT 1)[0].value ?? 0;
  LET $sleep_node = (SELECT * FROM nn_node WHERE node_id = 'config:sleep_need' LIMIT 1)[0].value ?? 0;

  -- Single UPDATE with all config deltas at once
  UPDATE kernel_state SET
    config.accumulator_valence_threshold = ($cfg.default_accumulator_valence_threshold ?? 0.1) * math::pow(math::E, $conv_node * $s),
    config.spread_weight_rate = ($cfg.default_spread_weight_rate ?? 0.05) * math::pow(math::E, $spread_node * $s),
    config.hebbian_lr = ($cfg.default_hebbian_lr ?? 0.01) * math::pow(math::E, $lr_node * $s),
    config.agency_energy_threshold = ($cfg.default_agency_energy_threshold ?? 0.15) * math::pow(math::E, $energy_node * $s),
    config.reactivation_weight_boost = ($cfg.default_reactivation_weight_boost ?? 0.1) * math::pow(math::E, $activation_node * $s),
    config.trace_freshness_decay = ($cfg.default_trace_freshness_decay ?? 0.999) + (1.0 - ($cfg.default_trace_freshness_decay ?? 0.999)) * $freshness_node * $s,
    config.energy_drain_rate = ($cfg.default_energy_drain_rate ?? 0.01) * math::pow(math::E, 0.0 - $endurance_node * $s),
    config.fatigue_rate = ($cfg.default_fatigue_rate ?? 0.005) * math::pow(math::E, 0.0 - $endurance_node * $s),
    config.sleep_threshold = ($cfg.default_sleep_threshold ?? 0.3) * math::pow(math::E, $sleep_node * $s);

  RETURN true;
};
