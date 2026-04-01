-- Migration 056: Fix naivety in sheaves + predictor
-- 1. Sheaves: real PMI computed inline, connector-pattern similarity (not target IDs)
-- 2. Predictor: 13-dim sensory channels, real predict→observe→learn per action,
--    cognitive_cycle uses THIS action's prediction error

-- ═══════════════════════════════════════════
-- 1. PREDICTOR: Resize 8→13 sensory dims, 8→6 action dims
-- Old: pos_dim:0..7 (8) + action_dim:0..7 (8) → delta_dim:0..7 (8)
-- New: sens_dim:0..12 (13) + act_dim:0..5 (6) → pred_dim:0..12 (13)
-- ═══════════════════════════════════════════

-- Config
UPDATE kernel_state SET
  config.predictor_sens_dims = 13,
  config.predictor_act_dims = 6,
  config.predictor_lr = config.predictor_lr ?? 0.01;

-- Clean old predictor nodes (will be re-seeded)
DELETE nn_node WHERE model = 'predictor';
DELETE nn_edge WHERE out.model = 'predictor' OR in.model = 'predictor';

-- Seed new predictor: 13 sensory + 6 action → 13 delta
-- (nodes created here, edges must be seeded separately via TS because SurrealDB
--  can't do Xavier random init in stored procs — use fixed small weights)

-- Sensory input nodes (13 channels)
CREATE nn_node CONTENT { node_id: 'sens:0',  model: 'predictor', layer: 'input', value: 0, bias: 0, activation: 'none' };
CREATE nn_node CONTENT { node_id: 'sens:1',  model: 'predictor', layer: 'input', value: 0, bias: 0, activation: 'none' };
CREATE nn_node CONTENT { node_id: 'sens:2',  model: 'predictor', layer: 'input', value: 0, bias: 0, activation: 'none' };
CREATE nn_node CONTENT { node_id: 'sens:3',  model: 'predictor', layer: 'input', value: 0, bias: 0, activation: 'none' };
CREATE nn_node CONTENT { node_id: 'sens:4',  model: 'predictor', layer: 'input', value: 0, bias: 0, activation: 'none' };
CREATE nn_node CONTENT { node_id: 'sens:5',  model: 'predictor', layer: 'input', value: 0, bias: 0, activation: 'none' };
CREATE nn_node CONTENT { node_id: 'sens:6',  model: 'predictor', layer: 'input', value: 0, bias: 0, activation: 'none' };
CREATE nn_node CONTENT { node_id: 'sens:7',  model: 'predictor', layer: 'input', value: 0, bias: 0, activation: 'none' };
CREATE nn_node CONTENT { node_id: 'sens:8',  model: 'predictor', layer: 'input', value: 0, bias: 0, activation: 'none' };
CREATE nn_node CONTENT { node_id: 'sens:9',  model: 'predictor', layer: 'input', value: 0, bias: 0, activation: 'none' };
CREATE nn_node CONTENT { node_id: 'sens:10', model: 'predictor', layer: 'input', value: 0, bias: 0, activation: 'none' };
CREATE nn_node CONTENT { node_id: 'sens:11', model: 'predictor', layer: 'input', value: 0, bias: 0, activation: 'none' };
CREATE nn_node CONTENT { node_id: 'sens:12', model: 'predictor', layer: 'input', value: 0, bias: 0, activation: 'none' };

-- Action input nodes (6 actions, one-hot)
CREATE nn_node CONTENT { node_id: 'act:0', model: 'predictor', layer: 'input', value: 0, bias: 0, activation: 'none' };
CREATE nn_node CONTENT { node_id: 'act:1', model: 'predictor', layer: 'input', value: 0, bias: 0, activation: 'none' };
CREATE nn_node CONTENT { node_id: 'act:2', model: 'predictor', layer: 'input', value: 0, bias: 0, activation: 'none' };
CREATE nn_node CONTENT { node_id: 'act:3', model: 'predictor', layer: 'input', value: 0, bias: 0, activation: 'none' };
CREATE nn_node CONTENT { node_id: 'act:4', model: 'predictor', layer: 'input', value: 0, bias: 0, activation: 'none' };
CREATE nn_node CONTENT { node_id: 'act:5', model: 'predictor', layer: 'input', value: 0, bias: 0, activation: 'none' };

-- Output delta nodes (13 predicted changes)
CREATE nn_node CONTENT { node_id: 'pred:0',  model: 'predictor', layer: 'output', value: 0, bias: 0, activation: 'tanh' };
CREATE nn_node CONTENT { node_id: 'pred:1',  model: 'predictor', layer: 'output', value: 0, bias: 0, activation: 'tanh' };
CREATE nn_node CONTENT { node_id: 'pred:2',  model: 'predictor', layer: 'output', value: 0, bias: 0, activation: 'tanh' };
CREATE nn_node CONTENT { node_id: 'pred:3',  model: 'predictor', layer: 'output', value: 0, bias: 0, activation: 'tanh' };
CREATE nn_node CONTENT { node_id: 'pred:4',  model: 'predictor', layer: 'output', value: 0, bias: 0, activation: 'tanh' };
CREATE nn_node CONTENT { node_id: 'pred:5',  model: 'predictor', layer: 'output', value: 0, bias: 0, activation: 'tanh' };
CREATE nn_node CONTENT { node_id: 'pred:6',  model: 'predictor', layer: 'output', value: 0, bias: 0, activation: 'tanh' };
CREATE nn_node CONTENT { node_id: 'pred:7',  model: 'predictor', layer: 'output', value: 0, bias: 0, activation: 'tanh' };
CREATE nn_node CONTENT { node_id: 'pred:8',  model: 'predictor', layer: 'output', value: 0, bias: 0, activation: 'tanh' };
CREATE nn_node CONTENT { node_id: 'pred:9',  model: 'predictor', layer: 'output', value: 0, bias: 0, activation: 'tanh' };
CREATE nn_node CONTENT { node_id: 'pred:10', model: 'predictor', layer: 'output', value: 0, bias: 0, activation: 'tanh' };
CREATE nn_node CONTENT { node_id: 'pred:11', model: 'predictor', layer: 'output', value: 0, bias: 0, activation: 'tanh' };
CREATE nn_node CONTENT { node_id: 'pred:12', model: 'predictor', layer: 'output', value: 0, bias: 0, activation: 'tanh' };

-- fn::seed_predictor_edges — create 19×13 = 247 edges with small random weights
-- Called once after node creation. Uses rand::float() for initialization.
DEFINE FUNCTION OVERWRITE fn::seed_predictor_edges() {
  LET $xavier = 0.29;

  -- sens:0..12 → pred:0..12 (13×13 = 169 edges)
  FOR $i IN 0..13 {
    LET $from_id = (SELECT id FROM nn_node WHERE node_id = 'sens:' + type::string($i) LIMIT 1)[0].id;
    IF $from_id IS NOT NONE {
      FOR $j IN 0..13 {
        LET $to_id = (SELECT id FROM nn_node WHERE node_id = 'pred:' + type::string($j) LIMIT 1)[0].id;
        IF $to_id IS NOT NONE {
          LET $w = (rand::float() * 2.0 - 1.0) * $xavier;
          RELATE ($from_id)->nn_edge->($to_id) SET weight = $w, grad_acc = 0, update_count = 0;
        };
      };
    };
  };

  -- act:0..5 → pred:0..12 (6×13 = 78 edges)
  FOR $i IN 0..6 {
    LET $from_id = (SELECT id FROM nn_node WHERE node_id = 'act:' + type::string($i) LIMIT 1)[0].id;
    IF $from_id IS NOT NONE {
      FOR $j IN 0..13 {
        LET $to_id = (SELECT id FROM nn_node WHERE node_id = 'pred:' + type::string($j) LIMIT 1)[0].id;
        IF $to_id IS NOT NONE {
          LET $w = (rand::float() * 2.0 - 1.0) * $xavier;
          RELATE ($from_id)->nn_edge->($to_id) SET weight = $w, grad_acc = 0, update_count = 0;
        };
      };
    };
  };

  RETURN { edges: 247 };
};

-- Seed edges
RETURN fn::seed_predictor_edges();

-- ═══════════════════════════════════════════
-- 2. PREDICTOR FORWARD/BACKWARD — 13 channels
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::predictor_forward($channels: array, $action_id: int) {
  -- Set sensory input (13 channels)
  FOR $i IN 0..13 {
    UPDATE nn_node SET `value` = $channels[$i] ?? 0 WHERE node_id = 'sens:' + type::string($i);
  };

  -- Set action one-hot (6 dims)
  FOR $i IN 0..6 {
    UPDATE nn_node SET `value` = IF $i = $action_id THEN 1.0 ELSE 0.0 END WHERE node_id = 'act:' + type::string($i);
  };

  -- Forward: weighted sum + tanh
  LET $outputs = (SELECT id, node_id, bias FROM nn_node WHERE model = 'predictor' AND layer = 'output');
  FOR $o IN $outputs {
    LET $ws = (SELECT math::sum(in.value * weight) AS s FROM nn_edge
      WHERE out = $o.id AND in.model = 'predictor' GROUP ALL)[0].s ?? 0.0;
    LET $raw = $ws + ($o.bias ?? 0);
    LET $ex = math::pow(math::E, math::clamp($raw, -5.0, 5.0));
    LET $enx = math::pow(math::E, math::clamp(0.0 - $raw, -5.0, 5.0));
    UPDATE nn_node SET `value` = ($ex - $enx) / ($ex + $enx) WHERE id = $o.id;
  };

  LET $preds = (SELECT node_id, `value` AS val FROM nn_node
    WHERE model = 'predictor' AND layer = 'output');
  RETURN $preds.map(|$d| $d.val ?? 0);
};

DEFINE FUNCTION OVERWRITE fn::predictor_backward($predicted: array, $actual_delta: array) {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $lr = $cfg.predictor_lr ?? 0.01;
  LET $momentum = $cfg.predictor_momentum ?? 0.9;

  -- Errors: all 13 dims
  LET $errors = [
    ($actual_delta[0] ?? 0) - ($predicted[0] ?? 0),
    ($actual_delta[1] ?? 0) - ($predicted[1] ?? 0),
    ($actual_delta[2] ?? 0) - ($predicted[2] ?? 0),
    ($actual_delta[3] ?? 0) - ($predicted[3] ?? 0),
    ($actual_delta[4] ?? 0) - ($predicted[4] ?? 0),
    ($actual_delta[5] ?? 0) - ($predicted[5] ?? 0),
    ($actual_delta[6] ?? 0) - ($predicted[6] ?? 0),
    ($actual_delta[7] ?? 0) - ($predicted[7] ?? 0),
    ($actual_delta[8] ?? 0) - ($predicted[8] ?? 0),
    ($actual_delta[9] ?? 0) - ($predicted[9] ?? 0),
    ($actual_delta[10] ?? 0) - ($predicted[10] ?? 0),
    ($actual_delta[11] ?? 0) - ($predicted[11] ?? 0),
    ($actual_delta[12] ?? 0) - ($predicted[12] ?? 0)
  ];

  LET $mse = math::mean($errors.map(|$e| $e * $e)) ?? 0;

  LET $outputs = (SELECT id, node_id, `value` AS val FROM nn_node
    WHERE model = 'predictor' AND layer = 'output');

  FOR $i IN 0..array::len($outputs) {
    LET $o = $outputs[$i];
    LET $err = $errors[$i] ?? 0;
    LET $grad = $err * (1.0 - ($o.val ?? 0) * ($o.val ?? 0));

    LET $edges = (SELECT id, in.value AS in_val, grad_acc FROM nn_edge
      WHERE out = $o.id AND in.model = 'predictor');
    FOR $e IN $edges {
      LET $dw = $lr * $grad * ($e.in_val ?? 0);
      LET $new_grad = $momentum * ($e.grad_acc ?? 0) + $dw;
      UPDATE nn_edge SET
        weight = math::clamp(weight + $new_grad, -2.0, 2.0),
        grad_acc = $new_grad,
        update_count = (update_count ?? 0) + 1
      WHERE id = $e.id;
    };
  };

  RETURN { mse: $mse };
};

-- fn::predictor_step — proper 13-dim delta
DEFINE FUNCTION OVERWRITE fn::predictor_step(
  $channels_before: array, $channels_after: array, $action_id: int
) {
  LET $predicted = fn::predictor_forward($channels_before, $action_id);

  -- Actual delta: all 13 sensory channels
  LET $actual_delta = [
    ($channels_after[0] ?? 0) - ($channels_before[0] ?? 0),
    ($channels_after[1] ?? 0) - ($channels_before[1] ?? 0),
    ($channels_after[2] ?? 0) - ($channels_before[2] ?? 0),
    ($channels_after[3] ?? 0) - ($channels_before[3] ?? 0),
    ($channels_after[4] ?? 0) - ($channels_before[4] ?? 0),
    ($channels_after[5] ?? 0) - ($channels_before[5] ?? 0),
    ($channels_after[6] ?? 0) - ($channels_before[6] ?? 0),
    ($channels_after[7] ?? 0) - ($channels_before[7] ?? 0),
    ($channels_after[8] ?? 0) - ($channels_before[8] ?? 0),
    ($channels_after[9] ?? 0) - ($channels_before[9] ?? 0),
    ($channels_after[10] ?? 0) - ($channels_before[10] ?? 0),
    ($channels_after[11] ?? 0) - ($channels_before[11] ?? 0),
    ($channels_after[12] ?? 0) - ($channels_before[12] ?? 0)
  ];

  LET $result = fn::predictor_backward($predicted, $actual_delta);

  CREATE sensorimotor_transition CONTENT {
    position_t: array::slice($channels_before, 0, 13),
    position_t1: array::slice($channels_after, 0, 13),
    action: type::string($action_id),
    reward: 0,
    cycle: (SELECT cycle FROM kernel_state LIMIT 1)[0].cycle ?? 0,
    trained: true
  };

  RETURN { predicted: $predicted, actual_delta: $actual_delta, mse: $result.mse };
};

-- ═══════════════════════════════════════════
-- 3. COGNITIVE CYCLE — predictor called per-action, not lazy lookup
-- Store last prediction in kernel_state for THIS action
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::cognitive_cycle(
  $outcome_trace_id: string, $action_method: string, $target_content: string, $valence: float
) {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $cycle = (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0;
  LET $cap = $cfg.accumulator_cap ?? 5.0;

  -- 1. APPRAISE
  LET $salience = fn::appraise_salience($outcome_trace_id, $valence);
  IF $salience < ($cfg.salience_threshold ?? 0.1) {
    RETURN { phase: 'skip', salience: $salience };
  };

  -- 2. RETRIEVE
  LET $q_key = $action_method + ':' + $target_content;
  LET $q_entry = (SELECT * FROM action_value WHERE key = $q_key LIMIT 1)[0];
  LET $predicted_valence = $q_entry.value ?? ($cfg.q_initial ?? 0.0);
  LET $visit_count = $q_entry.update_count ?? 0;

  -- 3. PREDICT — valence RPE + actual sensorimotor prediction error
  LET $rpe = $valence - $predicted_valence;
  LET $abs_rpe = math::abs($rpe);

  -- Get the outcome trace's current channels (first 13 of position)
  LET $outcome_pos = (SELECT position FROM trace WHERE trace_id = $outcome_trace_id LIMIT 1)[0].position ?? [];
  LET $channels_now = array::slice($outcome_pos, 0, 13);

  -- Get previous channels from trace_history (last logged state)
  LET $outcome_ref = (SELECT id FROM trace WHERE trace_id = $outcome_trace_id LIMIT 1)[0].id;
  LET $prev_history = (SELECT * FROM trace_history
    WHERE trace = $outcome_ref
    LIMIT 1)[0];

  -- Compute sensorimotor prediction error for THIS action
  LET $predictor_mse = 0.0;
  IF $prev_history IS NOT NONE AND array::len($channels_now) >= 13 {
    -- action_id from method name
    LET $methods_map = ['touch', 'push', 'drop', 'shake', 'look', 'squeeze'];
    LET $action_id = array::find_index($methods_map, |$m| $m = $action_method) ?? 0;

    -- Get prev position from trace table (position was updated in process_sensory)
    -- Use the trace_history's weight as proxy for prev state existing
    LET $prev_pos = (SELECT position FROM trace WHERE id = $outcome_ref LIMIT 1)[0].position ?? [];
    LET $prev_channels = array::slice($prev_pos, 0, 13);

    IF array::len($prev_channels) >= 13 {
      -- Forward predict + compute MSE (but don't learn here — learning happens in predictor_step)
      LET $predicted_delta = fn::predictor_forward($prev_channels, $action_id);
      IF array::len($predicted_delta) >= 13 {
        LET $errors_sq = [
          math::pow(($channels_now[0] ?? 0) - ($prev_channels[0] ?? 0) - ($predicted_delta[0] ?? 0), 2),
          math::pow(($channels_now[1] ?? 0) - ($prev_channels[1] ?? 0) - ($predicted_delta[1] ?? 0), 2),
          math::pow(($channels_now[2] ?? 0) - ($prev_channels[2] ?? 0) - ($predicted_delta[2] ?? 0), 2),
          math::pow(($channels_now[3] ?? 0) - ($prev_channels[3] ?? 0) - ($predicted_delta[3] ?? 0), 2),
          math::pow(($channels_now[4] ?? 0) - ($prev_channels[4] ?? 0) - ($predicted_delta[4] ?? 0), 2),
          math::pow(($channels_now[5] ?? 0) - ($prev_channels[5] ?? 0) - ($predicted_delta[5] ?? 0), 2),
          math::pow(($channels_now[6] ?? 0) - ($prev_channels[6] ?? 0) - ($predicted_delta[6] ?? 0), 2),
          math::pow(($channels_now[7] ?? 0) - ($prev_channels[7] ?? 0) - ($predicted_delta[7] ?? 0), 2),
          math::pow(($channels_now[8] ?? 0) - ($prev_channels[8] ?? 0) - ($predicted_delta[8] ?? 0), 2),
          math::pow(($channels_now[9] ?? 0) - ($prev_channels[9] ?? 0) - ($predicted_delta[9] ?? 0), 2),
          math::pow(($channels_now[10] ?? 0) - ($prev_channels[10] ?? 0) - ($predicted_delta[10] ?? 0), 2),
          math::pow(($channels_now[11] ?? 0) - ($prev_channels[11] ?? 0) - ($predicted_delta[11] ?? 0), 2),
          math::pow(($channels_now[12] ?? 0) - ($prev_channels[12] ?? 0) - ($predicted_delta[12] ?? 0), 2)
        ];
        LET $predictor_mse = math::mean($errors_sq) ?? 0;
      };
    };
  };

  -- Combined RPE
  LET $combined_rpe = $abs_rpe + ($cfg.predictor_error_weight ?? 0.5) * $predictor_mse;

  -- RPE → hormones
  LET $rpe_scale = $cfg.rpe_dopamine_scale ?? 0.3;
  IF $rpe > 0 { fn::hormone_spike('dopamine', $rpe * $rpe_scale); };
  IF $rpe < 0 { fn::hormone_spike('dopamine', $rpe * $rpe_scale * 0.5); };
  IF $combined_rpe > ($cfg.rpe_surprise_threshold ?? 0.2) {
    fn::hormone_spike('norepinephrine', $combined_rpe * 0.2);
  };
  IF $valence < -0.1 { fn::hormone_spike('cortisol', math::abs($valence) * 0.3); };

  -- 4. DELIBERATE
  LET $q_lr = $cfg.q_learning_rate ?? 0.1;
  LET $new_value = $predicted_valence + $q_lr * $rpe;

  IF $q_entry IS NOT NONE {
    UPDATE action_value SET
      value = $new_value,
      confidence = math::min([1.0, (confidence ?? 0) + 0.01]),
      update_count = (update_count ?? 0) + 1,
      last_rpe = $rpe,
      last_predictor_mse = $predictor_mse,
      last_cycle = $cycle
    WHERE key = $q_key;
  } ELSE {
    CREATE action_value SET
      key = $q_key, action_method = $action_method, trace_content = $target_content,
      value = $new_value, confidence = 0.1, update_count = 1,
      last_rpe = $rpe, last_predictor_mse = $predictor_mse, last_cycle = $cycle;
  };

  -- 5. COMMIT
  CREATE cognitive_event SET
    cycle = $cycle, action_method = $action_method, target_content = $target_content,
    outcome_trace_id = $outcome_trace_id,
    outcome_content = (SELECT content FROM trace_state WHERE trace_id = $outcome_trace_id LIMIT 1)[0].content ?? '',
    valence_predicted = $predicted_valence, valence_actual = $valence,
    prediction_error = $rpe, predictor_mse = $predictor_mse,
    combined_rpe = $combined_rpe, salience = $salience;

  -- 6. LEARN
  IF $outcome_ref IS NOT NONE {
    LET $recent = (SELECT id FROM trace WHERE archived = false AND id != $outcome_ref LIMIT 3);
    FOR $r IN $recent {
      IF $r.id IS NOT NONE { fn::learn_edge($r.id, $outcome_ref, $valence, $combined_rpe); };
    };
  };

  fn::mode_learn($rpe);

  UPDATE nn_node SET value = math::min([$cap, value + $combined_rpe]) WHERE node_id = 'acc:pred_error';
  IF $rpe > 0 { UPDATE nn_node SET value = math::min([$cap, value + $rpe]) WHERE node_id = 'acc:reward'; };
  IF $rpe < 0 { UPDATE nn_node SET value = math::min([$cap, value + $abs_rpe]) WHERE node_id = 'acc:pain'; };

  RETURN {
    phase: 'full', salience: $salience, rpe: $rpe,
    predictor_mse: $predictor_mse, combined_rpe: $combined_rpe,
    q_value: $new_value, visit_count: $visit_count + 1
  };
};

-- ═══════════════════════════════════════════
-- 4. SHEAVES: Real MI + connector-pattern similarity
-- ═══════════════════════════════════════════

-- fn::extract_section — now computes real PMI per connector inline
DEFINE FUNCTION OVERWRITE fn::extract_section($trace_id: string) {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $cycle = (SELECT cycle FROM kernel_state LIMIT 1)[0].cycle ?? 0;

  LET $trace_rec = (SELECT id FROM trace WHERE trace_id = $trace_id AND archived = false LIMIT 1)[0];
  IF $trace_rec IS NONE { RETURN NONE; };

  -- Total reactivations (normalization)
  LET $total_react = math::max([1, (SELECT math::sum(reactivation_count) AS s FROM trace_state WHERE archived = false GROUP ALL)[0].s ?? 1]);
  LET $my_react = math::max([1, (SELECT reactivation_count FROM trace_state WHERE trace_id = $trace_id LIMIT 1)[0].reactivation_count ?? 1]);
  LET $p_self = $my_react / $total_react;

  -- Outgoing edges with MI
  LET $out_edges = (SELECT out.trace_id AS target_id, weight, co_activation_count,
    out.reactivation_count AS target_react
    FROM activates WHERE in = $trace_rec.id AND weight > 0.05 AND out.archived = false LIMIT 15);

  LET $out_connectors = $out_edges.map(|$e| {
    LET $p_target = math::max([1, $e.target_react ?? 1]) / $total_react;
    LET $p_joint = math::max([1, $e.co_activation_count ?? 1]) / $total_react;
    LET $denom = $p_self * $p_target;
    LET $mi = IF $denom > 0.000001 THEN math::max([0.0, math::log($p_joint / $denom) / math::log(2)]) ELSE 0 END;
    RETURN {
      target_id: $e.target_id, relation: 'activates', direction: '+',
      weight: $e.weight ?? 0, co_act: $e.co_activation_count ?? 0, mi: $mi
    };
  });

  -- Incoming edges with MI
  LET $in_edges = (SELECT in.trace_id AS target_id, weight, co_activation_count,
    in.reactivation_count AS target_react
    FROM activates WHERE out = $trace_rec.id AND weight > 0.05 AND in.archived = false LIMIT 15);

  LET $in_connectors = $in_edges.map(|$e| {
    LET $p_target = math::max([1, $e.target_react ?? 1]) / $total_react;
    LET $p_joint = math::max([1, $e.co_activation_count ?? 1]) / $total_react;
    LET $denom = $p_self * $p_target;
    LET $mi = IF $denom > 0.000001 THEN math::max([0.0, math::log($p_joint / $denom) / math::log(2)]) ELSE 0 END;
    RETURN {
      target_id: $e.target_id, relation: 'activates', direction: '-',
      weight: $e.weight ?? 0, co_act: $e.co_activation_count ?? 0, mi: $mi
    };
  });

  LET $connectors = array::concat($out_connectors, $in_connectors);
  LET $total_mi = math::sum($connectors.map(|$c| $c.mi ?? 0)) ?? 0;

  -- Connector signature: direction distribution for clustering
  LET $n_out = array::len($out_connectors);
  LET $n_in = array::len($in_connectors);
  LET $mean_out_w = IF $n_out > 0 THEN math::mean($out_connectors.map(|$c| $c.weight ?? 0)) ?? 0 ELSE 0 END;
  LET $mean_in_w = IF $n_in > 0 THEN math::mean($in_connectors.map(|$c| $c.weight ?? 0)) ?? 0 ELSE 0 END;

  -- Upsert section
  LET $existing = (SELECT id FROM trace_section WHERE germ_id = $trace_id LIMIT 1)[0];
  IF $existing IS NOT NONE {
    UPDATE trace_section SET
      connectors = $connectors,
      connector_count = array::len($connectors),
      total_mi = $total_mi,
      n_out = $n_out, n_in = $n_in,
      mean_out_weight = $mean_out_w, mean_in_weight = $mean_in_w,
      updated_cycle = $cycle
    WHERE id = $existing.id;
  } ELSE {
    CREATE trace_section CONTENT {
      germ_id: $trace_id, germ_ref: $trace_rec.id,
      connectors: $connectors, connector_count: array::len($connectors),
      total_mi: $total_mi,
      n_out: $n_out, n_in: $n_in,
      mean_out_weight: $mean_out_w, mean_in_weight: $mean_in_w,
      created_cycle: $cycle, updated_cycle: $cycle
    };
  };

  RETURN { germ: $trace_id, connectors: array::len($connectors), total_mi: $total_mi };
};

-- fn::section_similarity — connector PATTERN similarity (not target ID overlap)
-- Two traces are "grammatically similar" if they have similar in/out degree
-- ratio and similar mean edge weights
DEFINE FUNCTION OVERWRITE fn::section_similarity($section_a: string, $section_b: string) {
  LET $sa = (SELECT * FROM trace_section WHERE germ_id = $section_a LIMIT 1)[0];
  LET $sb = (SELECT * FROM trace_section WHERE germ_id = $section_b LIMIT 1)[0];
  IF $sa IS NONE OR $sb IS NONE { RETURN 0.0; };

  LET $ca = ($sa.connector_count ?? 0);
  LET $cb = ($sb.connector_count ?? 0);
  IF $ca = 0 AND $cb = 0 { RETURN 1.0; };
  IF $ca = 0 OR $cb = 0 { RETURN 0.0; };

  -- Degree ratio similarity: |n_out/total - n_out/total|
  LET $ratio_a = ($sa.n_out ?? 0) / $ca;
  LET $ratio_b = ($sb.n_out ?? 0) / $cb;
  LET $ratio_sim = 1.0 - math::abs($ratio_a - $ratio_b);

  -- Degree count similarity: min/max of total connectors
  LET $degree_sim = math::min([$ca, $cb]) / math::max([$ca, $cb]);

  -- Weight profile similarity: compare mean in/out weights
  LET $w_diff_out = math::abs(($sa.mean_out_weight ?? 0) - ($sb.mean_out_weight ?? 0));
  LET $w_diff_in = math::abs(($sa.mean_in_weight ?? 0) - ($sb.mean_in_weight ?? 0));
  LET $weight_sim = 1.0 - math::min([1.0, ($w_diff_out + $w_diff_in) / 2.0]);

  -- Weighted combination
  RETURN $ratio_sim * 0.4 + $degree_sim * 0.3 + $weight_sim * 0.3;
};
