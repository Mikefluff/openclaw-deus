-- Migration 055: Sheaves + Sensorimotor Predictor
-- 1. Sheaves: section extraction from trace graph for grammar/structure learning
-- 2. Sensorimotor predictor: brain predicts next sensory state, RPE from prediction error

-- ═══════════════════════════════════════════
-- CONFIG
-- ═══════════════════════════════════════════

UPDATE kernel_state SET
  -- Sheaves
  config.sheaf_mi_threshold = config.sheaf_mi_threshold ?? 0.1,
  config.sheaf_max_sections = config.sheaf_max_sections ?? 100,
  config.sheaf_section_ttl_cycles = config.sheaf_section_ttl_cycles ?? 50000,
  -- Predictor
  config.predictor_lr = config.predictor_lr ?? 0.01,
  config.predictor_momentum = config.predictor_momentum ?? 0.9,
  config.predictor_error_weight = config.predictor_error_weight ?? 0.5,
  config.predictor_pos_dims = config.predictor_pos_dims ?? 8,
  config.predictor_action_dims = config.predictor_action_dims ?? 8;

-- ═══════════════════════════════════════════
-- PART 1: SHEAVES
-- Section = vertex (trace) + its typed half-edges (connectors).
-- Like jigsaw puzzle pieces. Composable. Carry MI-weighted embeddings.
-- Foundation for grammar induction via MST + section clustering.
-- ═══════════════════════════════════════════

DEFINE TABLE OVERWRITE trace_section SCHEMALESS;
DEFINE INDEX IF NOT EXISTS idx_section_germ ON trace_section FIELDS germ_id;

-- trace_section structure:
-- {
--   germ_id: "TXhvJeUB7",           -- the vertex (trace_id)
--   germ_ref: trace:xxx,             -- record reference
--   connectors: [                    -- half-edges
--     { target_id: "TP6gGBs6Q", relation: "activates", direction: "+", weight: 0.7, mi: 0.35 },
--     { target_id: "T7fOCS4u7", relation: "activates", direction: "-", weight: 0.4, mi: 0.22 },
--   ],
--   connector_count: 2,
--   total_mi: 0.57,                  -- sum of MI across connectors
--   created_cycle: 12345,
--   updated_cycle: 12345
-- }

-- fn::compute_mi — pointwise mutual information between two traces
-- MI(a,b) = log2(P(a,b) / (P(a) * P(b)))
-- P(a,b) ≈ co_activation_count / total_activations
-- P(a) ≈ reactivation_count(a) / total_reactivations
DEFINE FUNCTION OVERWRITE fn::compute_mi($trace_a: string, $trace_b: string) {
  LET $ts_a = (SELECT reactivation_count FROM trace_state WHERE trace_id = $trace_a AND archived = false LIMIT 1)[0];
  LET $ts_b = (SELECT reactivation_count FROM trace_state WHERE trace_id = $trace_b AND archived = false LIMIT 1)[0];
  IF $ts_a IS NONE OR $ts_b IS NONE { RETURN 0.0; };

  LET $ra = math::max([1, $ts_a.reactivation_count ?? 1]);
  LET $rb = math::max([1, $ts_b.reactivation_count ?? 1]);

  -- Total reactivations as normalization constant
  LET $total = (SELECT math::sum(reactivation_count) AS s FROM trace_state WHERE archived = false GROUP ALL)[0].s ?? 1;
  LET $total = math::max([1, $total]);

  -- Co-activation: from edge co_activation_count
  LET $trace_a_rec = (SELECT id FROM trace WHERE trace_id = $trace_a LIMIT 1)[0].id;
  LET $trace_b_rec = (SELECT id FROM trace WHERE trace_id = $trace_b LIMIT 1)[0].id;
  IF $trace_a_rec IS NONE OR $trace_b_rec IS NONE { RETURN 0.0; };

  LET $edge = (SELECT co_activation_count FROM activates
    WHERE in = $trace_a_rec AND out = $trace_b_rec LIMIT 1)[0];
  LET $coact = math::max([1, $edge.co_activation_count ?? 0]);

  -- PMI = log2(P(a,b) / (P(a) * P(b)))
  LET $pab = $coact / $total;
  LET $pa = $ra / $total;
  LET $pb = $rb / $total;
  LET $denom = $pa * $pb;
  IF $denom < 0.000001 { RETURN 0.0; };

  LET $mi = math::log($pab / $denom) / math::log(2);
  RETURN math::max([0.0, $mi]);
};

-- fn::extract_section — extract section for a trace (germ + connectors)
DEFINE FUNCTION OVERWRITE fn::extract_section($trace_id: string) {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $mi_threshold = $cfg.sheaf_mi_threshold ?? 0.1;
  LET $cycle = (SELECT cycle FROM kernel_state LIMIT 1)[0].cycle ?? 0;

  LET $trace_rec = (SELECT id FROM trace WHERE trace_id = $trace_id AND archived = false LIMIT 1)[0];
  IF $trace_rec IS NONE { RETURN NONE; };

  -- Outgoing edges (direction "+")
  LET $out_edges = (SELECT out.trace_id AS target_id, weight, co_activation_count
    FROM activates WHERE in = $trace_rec.id AND weight > 0.05 LIMIT 15);

  -- Incoming edges (direction "-")
  LET $in_edges = (SELECT in.trace_id AS target_id, weight, co_activation_count
    FROM activates WHERE out = $trace_rec.id AND weight > 0.05 LIMIT 15);

  -- Build connectors: use .map() + .filter() to avoid LET scoping bug in FOR
  LET $out_connectors = $out_edges
    .filter(|$e| $e.target_id IS NOT NONE)
    .map(|$e| {
      target_id: $e.target_id,
      relation: 'activates',
      direction: '+',
      weight: $e.weight ?? 0,
      co_act: $e.co_activation_count ?? 0
    });

  LET $in_connectors = $in_edges
    .filter(|$e| $e.target_id IS NOT NONE)
    .map(|$e| {
      target_id: $e.target_id,
      relation: 'activates',
      direction: '-',
      weight: $e.weight ?? 0,
      co_act: $e.co_activation_count ?? 0
    });

  LET $connectors = array::concat($out_connectors, $in_connectors);
  LET $total_mi = math::sum($connectors.map(|$c| $c.weight ?? 0)) ?? 0;

  -- Upsert section
  LET $existing = (SELECT id FROM trace_section WHERE germ_id = $trace_id LIMIT 1)[0];
  IF $existing IS NOT NONE {
    UPDATE trace_section SET
      connectors = $connectors,
      connector_count = array::len($connectors),
      total_mi = $total_mi,
      updated_cycle = $cycle
    WHERE id = $existing.id;
  } ELSE {
    CREATE trace_section CONTENT {
      germ_id: $trace_id,
      germ_ref: $trace_rec.id,
      connectors: $connectors,
      connector_count: array::len($connectors),
      total_mi: $total_mi,
      created_cycle: $cycle,
      updated_cycle: $cycle
    };
  };

  RETURN { germ: $trace_id, connectors: array::len($connectors), total_mi: $total_mi };
};

-- fn::extract_all_sections — update sections for all active traces
DEFINE FUNCTION OVERWRITE fn::extract_all_sections() {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $max = $cfg.sheaf_max_sections ?? 100;

  LET $traces = (SELECT trace_id FROM trace_state
    WHERE archived = false AND reactivation_count > 0
    LIMIT $max);

  FOR $t IN $traces {
    fn::extract_section($t.trace_id);
  };

  RETURN { extracted: array::len($traces) };
};

-- fn::section_similarity — compare two sections by connector overlap
-- Traces with similar sections belong to the same "grammatical class"
DEFINE FUNCTION OVERWRITE fn::section_similarity($section_a: string, $section_b: string) {
  LET $sa = (SELECT * FROM trace_section WHERE germ_id = $section_a LIMIT 1)[0];
  LET $sb = (SELECT * FROM trace_section WHERE germ_id = $section_b LIMIT 1)[0];
  IF $sa IS NONE OR $sb IS NONE { RETURN 0.0; };

  -- Jaccard similarity on connector target sets
  LET $targets_a = ($sa.connectors ?? []).map(|$c| $c.target_id);
  LET $targets_b = ($sb.connectors ?? []).map(|$c| $c.target_id);

  LET $intersection = $targets_a.filter(|$t| $targets_b.includes($t));
  LET $union_size = array::len($targets_a) + array::len($targets_b) - array::len($intersection);

  IF $union_size = 0 { RETURN 0.0; };
  RETURN array::len($intersection) / $union_size;
};

-- ═══════════════════════════════════════════
-- PART 2: SENSORIMOTOR PREDICTOR
-- The predictor model already exists (nn_node pos_dim/action_dim → delta_dim).
-- This migration adds the forward pass, backward pass, and integration
-- into the cognitive cycle.
-- ═══════════════════════════════════════════

-- fn::predictor_forward — predict next position delta given current state + action
-- Input: 8 position dims + 8 action dims (one-hot or encoded)
-- Output: 8 predicted delta dims
DEFINE FUNCTION OVERWRITE fn::predictor_forward($position: array, $action_id: int) {
  -- Load position dims (first 8 of trace position)
  LET $pos_dims = array::slice($position, 0, 8);

  -- One-hot encode action (6 actions → 8 dims, padded)
  LET $action_vec = [
    IF $action_id = 0 THEN 1.0 ELSE 0.0 END,
    IF $action_id = 1 THEN 1.0 ELSE 0.0 END,
    IF $action_id = 2 THEN 1.0 ELSE 0.0 END,
    IF $action_id = 3 THEN 1.0 ELSE 0.0 END,
    IF $action_id = 4 THEN 1.0 ELSE 0.0 END,
    IF $action_id = 5 THEN 1.0 ELSE 0.0 END,
    0.0, 0.0
  ];

  -- Set input nodes
  FOR $i IN 0..8 {
    UPDATE nn_node SET value = $pos_dims[$i] ?? 0 WHERE node_id = 'pos_dim:' + type::string($i);
    UPDATE nn_node SET value = $action_vec[$i] ?? 0 WHERE node_id = 'action_dim:' + type::string($i);
  };

  -- Forward pass: weighted sum + tanh activation
  LET $outputs = (SELECT id, node_id, bias FROM nn_node WHERE model = 'predictor' AND layer = 'output');
  FOR $o IN $outputs {
    LET $ws = (SELECT math::sum(in.value * weight) AS s FROM nn_edge
      WHERE out = $o.id AND in.model = 'predictor' GROUP ALL)[0].s ?? 0.0;
    LET $raw = $ws + ($o.bias ?? 0);
    -- tanh activation
    LET $ex = math::pow(math::E, math::clamp($raw, -5.0, 5.0));
    LET $enx = math::pow(math::E, math::clamp(0.0 - $raw, -5.0, 5.0));
    LET $tanh_val = ($ex - $enx) / ($ex + $enx);
    UPDATE nn_node SET value = $tanh_val WHERE id = $o.id;
  };

  -- Collect predictions (backtick-escape `value` — reserved in DEFINE FUNCTION)
  LET $deltas = (SELECT node_id, `value` AS val FROM nn_node WHERE model = 'predictor' AND layer = 'output');
  RETURN $deltas.map(|$d| $d.val ?? 0);
};

-- fn::predictor_backward — learn from prediction error
-- Updates predictor weights based on actual vs predicted delta
DEFINE FUNCTION OVERWRITE fn::predictor_backward($predicted: array, $actual_delta: array) {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $lr = $cfg.predictor_lr ?? 0.01;
  LET $momentum = $cfg.predictor_momentum ?? 0.9;

  -- Compute error per output dim (direct construction — avoid LET push bug)
  LET $errors = [
    ($actual_delta[0] ?? 0) - ($predicted[0] ?? 0),
    ($actual_delta[1] ?? 0) - ($predicted[1] ?? 0),
    ($actual_delta[2] ?? 0) - ($predicted[2] ?? 0),
    ($actual_delta[3] ?? 0) - ($predicted[3] ?? 0),
    ($actual_delta[4] ?? 0) - ($predicted[4] ?? 0),
    ($actual_delta[5] ?? 0) - ($predicted[5] ?? 0),
    ($actual_delta[6] ?? 0) - ($predicted[6] ?? 0),
    ($actual_delta[7] ?? 0) - ($predicted[7] ?? 0)
  ];

  -- MSE for logging
  LET $mse = math::mean($errors.map(|$e| $e * $e)) ?? 0;

  -- Backprop through output nodes
  LET $outputs = (SELECT id, node_id, value FROM nn_node WHERE model = 'predictor' AND layer = 'output');
  FOR $i IN 0..array::len($outputs) {
    LET $o = $outputs[$i];
    LET $err = $errors[$i] ?? 0;
    -- dtanh/dx = 1 - tanh²(x)
    LET $grad = $err * (1.0 - ($o.value ?? 0) * ($o.value ?? 0));

    -- Update incoming weights
    LET $edges = (SELECT id, in.value AS in_val, weight, grad_acc FROM nn_edge WHERE out = $o.id AND in.model = 'predictor');
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

  RETURN { mse: $mse, error_dims: $errors };
};

-- fn::predictor_step — full predict-observe-learn cycle
-- Called after an action consequence is observed
DEFINE FUNCTION OVERWRITE fn::predictor_step(
  $position_before: array, $position_after: array, $action_id: int
) {
  -- Predict
  LET $predicted = fn::predictor_forward($position_before, $action_id);

  -- Actual delta (avoid LET push scoping bug — use direct array construction)
  LET $actual_delta = [
    ($position_after[0] ?? 0) - ($position_before[0] ?? 0),
    ($position_after[1] ?? 0) - ($position_before[1] ?? 0),
    ($position_after[2] ?? 0) - ($position_before[2] ?? 0),
    ($position_after[3] ?? 0) - ($position_before[3] ?? 0),
    ($position_after[4] ?? 0) - ($position_before[4] ?? 0),
    ($position_after[5] ?? 0) - ($position_before[5] ?? 0),
    ($position_after[6] ?? 0) - ($position_before[6] ?? 0),
    ($position_after[7] ?? 0) - ($position_before[7] ?? 0)
  ];

  -- Learn
  LET $result = fn::predictor_backward($predicted, $actual_delta);

  -- Store transition for experience replay (SCHEMAFULL — only defined fields)
  CREATE sensorimotor_transition CONTENT {
    position_t: array::slice($position_before, 0, 8),
    position_t1: array::slice($position_after, 0, 8),
    action: type::string($action_id),
    reward: 0,
    cycle: (SELECT cycle FROM kernel_state LIMIT 1)[0].cycle ?? 0,
    trained: true
  };

  RETURN {
    predicted: $predicted,
    actual_delta: $actual_delta,
    mse: $result.mse
  };
};

-- fn::predictor_replay — experience replay from stored transitions
DEFINE FUNCTION OVERWRITE fn::predictor_replay($batch_size: int) {
  LET $transitions = (SELECT * FROM sensorimotor_transition
    WHERE trained = true
    LIMIT $batch_size);

  LET $total_mse = 0.0;
  FOR $t IN $transitions {
    LET $predicted = fn::predictor_forward($t.position_t ?? [], type::int($t.action ?? '0'));
    LET $pt = $t.position_t ?? [0,0,0,0,0,0,0,0];
    LET $pt1 = $t.position_t1 ?? [0,0,0,0,0,0,0,0];
    LET $actual_delta = [
      ($pt1[0] ?? 0) - ($pt[0] ?? 0), ($pt1[1] ?? 0) - ($pt[1] ?? 0),
      ($pt1[2] ?? 0) - ($pt[2] ?? 0), ($pt1[3] ?? 0) - ($pt[3] ?? 0),
      ($pt1[4] ?? 0) - ($pt[4] ?? 0), ($pt1[5] ?? 0) - ($pt[5] ?? 0),
      ($pt1[6] ?? 0) - ($pt[6] ?? 0), ($pt1[7] ?? 0) - ($pt[7] ?? 0)
    ];
    LET $result = fn::predictor_backward($predicted, $actual_delta);
    LET $total_mse = $total_mse + ($result.mse ?? 0);
  };

  LET $avg_mse = IF array::len($transitions) > 0
    THEN $total_mse / array::len($transitions)
    ELSE 0 END;

  RETURN { replayed: array::len($transitions), avg_mse: $avg_mse };
};

-- ═══════════════════════════════════════════
-- PART 3: INTEGRATE INTO COGNITIVE CYCLE
-- Predictor RPE augments valence-based RPE
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::cognitive_cycle(
  $outcome_trace_id: string, $action_method: string, $target_content: string, $valence: float
) {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $cycle = (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0;
  LET $cap = $cfg.accumulator_cap ?? 5.0;

  -- ── 1. APPRAISE ──
  LET $salience = fn::appraise_salience($outcome_trace_id, $valence);
  IF $salience < ($cfg.salience_threshold ?? 0.1) {
    RETURN { phase: 'skip', salience: $salience };
  };

  -- ── 2. RETRIEVE ──
  LET $q_key = $action_method + ':' + $target_content;
  LET $q_entry = (SELECT * FROM action_value WHERE key = $q_key LIMIT 1)[0];
  LET $predicted_valence = $q_entry.value ?? ($cfg.q_initial ?? 0.0);
  LET $visit_count = $q_entry.update_count ?? 0;

  -- ── 3. PREDICT — RPE (valence) + sensorimotor prediction error ──
  LET $rpe = $valence - $predicted_valence;
  LET $abs_rpe = math::abs($rpe);

  -- Sensorimotor prediction error: how well did we predict the sensory change?
  LET $outcome_trace = (SELECT position FROM trace WHERE trace_id = $outcome_trace_id LIMIT 1)[0];
  LET $predictor_mse = 0.0;
  IF $outcome_trace IS NOT NONE AND $outcome_trace.position IS NOT NONE {
    -- Find previous position (from trace_history)
    LET $prev_state = (SELECT weight, emotional_charge FROM trace_history
      WHERE trace = (SELECT id FROM trace WHERE trace_id = $outcome_trace_id LIMIT 1)[0].id
      LIMIT 1)[0];

    -- If we have transition data, compute predictor error
    LET $recent_transition = (SELECT mse FROM sensorimotor_transition
      WHERE cycle > ($cycle - 200) LIMIT 1)[0];
    LET $predictor_mse = $recent_transition.mse ?? 0;
  };

  -- Combined RPE: valence RPE + sensorimotor prediction error
  LET $combined_rpe = $abs_rpe + ($cfg.predictor_error_weight ?? 0.5) * $predictor_mse;

  -- RPE → dopamine spike (Schultz model)
  LET $rpe_scale = $cfg.rpe_dopamine_scale ?? 0.3;
  IF $rpe > 0 { fn::hormone_spike('dopamine', $rpe * $rpe_scale); };
  IF $rpe < 0 { fn::hormone_spike('dopamine', $rpe * $rpe_scale * 0.5); };
  IF $combined_rpe > ($cfg.rpe_surprise_threshold ?? 0.2) {
    fn::hormone_spike('norepinephrine', $combined_rpe * 0.2);
  };
  IF $valence < -0.1 { fn::hormone_spike('cortisol', math::abs($valence) * 0.3); };

  -- ── 4. DELIBERATE — Q-value update ──
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
      key = $q_key,
      action_method = $action_method,
      trace_content = $target_content,
      value = $new_value,
      confidence = 0.1,
      update_count = 1,
      last_rpe = $rpe,
      last_predictor_mse = $predictor_mse,
      last_cycle = $cycle;
  };

  -- ── 5. COMMIT — causal log ──
  CREATE cognitive_event SET
    cycle = $cycle,
    action_method = $action_method,
    target_content = $target_content,
    outcome_trace_id = $outcome_trace_id,
    outcome_content = (SELECT content FROM trace_state WHERE trace_id = $outcome_trace_id LIMIT 1)[0].content ?? '',
    valence_predicted = $predicted_valence,
    valence_actual = $valence,
    prediction_error = $rpe,
    predictor_mse = $predictor_mse,
    combined_rpe = $combined_rpe,
    salience = $salience;

  -- ── 6. LEARN — three-factor Hebbian with combined RPE ──
  LET $outcome_rec = (SELECT id FROM trace WHERE trace_id = $outcome_trace_id LIMIT 1)[0];
  IF $outcome_rec IS NOT NONE AND $outcome_rec.id IS NOT NONE {
    LET $recent = (SELECT id FROM trace WHERE archived = false AND id != $outcome_rec.id LIMIT 3);
    FOR $r IN $recent {
      IF $r.id IS NOT NONE {
        fn::learn_edge($r.id, $outcome_rec.id, $valence, $combined_rpe);
      };
    };
  };

  -- Mode learning with RPE
  fn::mode_learn($rpe);

  -- Accumulator update from RPE
  UPDATE nn_node SET value = math::min([$cap, value + $combined_rpe]) WHERE node_id = 'acc:pred_error';
  IF $rpe > 0 { UPDATE nn_node SET value = math::min([$cap, value + $rpe]) WHERE node_id = 'acc:reward'; };
  IF $rpe < 0 { UPDATE nn_node SET value = math::min([$cap, value + $abs_rpe]) WHERE node_id = 'acc:pain'; };

  RETURN {
    phase: 'full',
    salience: $salience,
    rpe: $rpe,
    predictor_mse: $predictor_mse,
    combined_rpe: $combined_rpe,
    q_value: $new_value,
    visit_count: $visit_count + 1
  };
};

-- ═══════════════════════════════════════════
-- PART 4: INTEGRATE INTO BRAIN_TICK
-- Sheaf extraction at freq_deep (rare, expensive)
-- Predictor replay at freq_low
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::brain_tick($n: int) {
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  LET $cfg = $state.config ?? {};
  UPDATE _cfg_cache SET cfg = $cfg;

  LET $freq_crit = $cfg.freq_critical ?? 100;
  LET $freq_high = $cfg.freq_high ?? 100;
  LET $freq_trace = $cfg.freq_trace_decay ?? 50;
  LET $freq_agency = $cfg.freq_agency ?? 200;
  LET $freq_med = $cfg.freq_medium ?? 500;
  LET $freq_low = $cfg.freq_low ?? 2000;
  LET $freq_deep = $cfg.freq_deep ?? 5000;

  FOR $x IN 0..$n {
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

    IF $x % $freq_high = 0 {
      fn::hormone_decay_tick();
      fn::affect_forward_output();
      fn::apply_config_deltas();
      fn::affect_backward_targeted($cfg.affect_lr ?? 0.05);
      UPDATE nn_node SET value = value * ($cfg.accumulator_decay ?? 0.99) WHERE model = 'affect' AND layer = 'input';
      fn::ecan_collect_rent();
    };

    IF $x % $freq_trace = 0 {
      UPDATE trace_state SET
        freshness = freshness * ($cfg.trace_freshness_decay ?? 0.999)
      WHERE archived = false AND freshness > 0.01;
    };

    IF $x % $freq_agency = 0 { fn::agency_tick($x); };

    IF $x % $freq_med = 0 {
      fn::active_inference($cfg.active_inference_threshold ?? 0.3, $cfg.active_inference_limit ?? 10);
      fn::forget_traces($cfg.forget_weight_threshold ?? 0.02, $cfg.forget_freshness_threshold ?? 0.03);
      fn::decay_eligibility();
      fn::apply_meta_modulation();
      fn::ecan_update_hebbian();
    };

    IF $x % $freq_low = 0 {
      fn::nn_decay_all($cfg.nn_decay_rate ?? 0.001);
      fn::consolidate_episodic($cfg.consolidation_min_count ?? 3);
      fn::consolidation_replay();
      fn::grow_synaptic_elements();
      fn::edge_sprout();
      fn::edge_death();
      fn::match_all_patterns();
      fn::ecan_create_hebbian();
      fn::ecan_forget();
      -- Sensorimotor predictor: experience replay
      fn::predictor_replay($cfg.predictor_replay_batch ?? 5);
      IF $x % ($freq_low * ($cfg.prune_freq_multiplier ?? 3)) = 0 {
        fn::prune_dissimilar_edges($cfg.prune_min_similarity ?? 0.15);
        fn::synaptic_homeostasis();
      };
    };

    IF $x % $freq_deep = 0 {
      fn::build_world_model();
      fn::introspect();
      fn::pln_infer_chain();
      -- Sheaves: extract sections from trace graph
      fn::extract_all_sections();
      CREATE config_snapshot SET config = $cfg, cycle = (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0;
    };
  };

  RETURN (SELECT * FROM kernel_state LIMIT 1)[0];
};

-- ═══════════════════════════════════════════
-- PART 5: INTEGRATE PREDICTOR INTO MEMBRANE FLOW
-- fn::process_sensory_with_prediction — wraps process_sensory + predictor step
-- Called when membrane feeds a consequence (is_consequence = true)
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::process_sensory_with_prediction(
  $action_id: int, $channels: array, $speech: array, $valence: float, $object_idx: int,
  $prev_position: array
) {
  -- Standard sensory processing
  LET $result = fn::process_sensory($action_id, $channels, $speech, $valence, $object_idx);

  -- Current position (from the just-processed trace)
  LET $current_pos = array::concat($channels, $speech);
  LET $padded = IF array::len($current_pos) < 64 THEN
    array::concat($current_pos, [0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f])
  ELSE $current_pos END;
  LET $pos64 = array::slice($padded, 0, 64);

  -- Predictor: learn from transition (prev_position → current_position via action)
  IF $prev_position IS NOT NONE AND array::len($prev_position) >= 8 {
    LET $pred_result = fn::predictor_step($prev_position, $pos64, $action_id);
    RETURN {
      trace_id: $result.trace_id,
      is_new: $result.is_new,
      predictor_mse: $pred_result.mse
    };
  };

  RETURN $result;
};
