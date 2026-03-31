-- Migration 046: Pointer Architecture Fixes
-- Patch all remaining functions that read mutable state from trace → trace_state
-- Fix cognitive_cycle edge creation + RPE flow
-- Add background edge sprouting + pruning (synaptic growth/death)

-- ═══════════════════════════════════════════
-- 0. CONFIG: edge growth
-- ═══════════════════════════════════════════

UPDATE kernel_state SET
  config.salience_threshold = 0.05,
  config.edge_sprout_threshold = config.edge_sprout_threshold ?? 0.3,
  config.edge_sprout_limit = config.edge_sprout_limit ?? 5,
  config.edge_death_threshold = config.edge_death_threshold ?? 0.02,
  config.edge_death_max = config.edge_death_max ?? 3;

-- ═══════════════════════════════════════════
-- 1. fn::compute_maturity — read from trace_state
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::compute_maturity() {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};

  -- Component 1: Convergence (mean reactivation count from trace_state)
  LET $active = (SELECT count() AS c FROM trace_state WHERE archived = false GROUP ALL)[0].c ?? 0;
  LET $react_vals = (SELECT reactivation_count FROM trace_state WHERE archived = false);
  LET $mean_react = IF $active > 1
    THEN math::mean($react_vals.map(|$r| $r.reactivation_count ?? 0)) ?? 0
    ELSE 0 END;
  LET $conv_score = math::clamp($mean_react / 100.0, 0.0, 1.0);

  -- Component 2: Edge density
  LET $edge_count = (SELECT count() AS c FROM activates GROUP ALL)[0].c ?? 0;
  LET $edge_score = math::clamp($edge_count / 500.0, 0.0, 1.0);

  -- Component 3: Prediction quality (from cognitive_event RPE trend)
  LET $ce_count = (SELECT count() AS c FROM cognitive_event GROUP ALL)[0].c ?? 0;
  LET $recent_rpe = IF $ce_count > 1
    THEN (SELECT math::mean(math::abs(prediction_error)) AS m FROM cognitive_event GROUP ALL)[0].m ?? 0.5
    ELSE 0.5 END;
  LET $predict_score = math::clamp(1.0 - $recent_rpe * 2.0, 0.0, 1.0);

  -- Component 4: Mode diversity
  LET $mode_vals = (SELECT * FROM nn_node WHERE model = 'affect' AND layer = 'mode');
  LET $mode_probs = $mode_vals.map(|$m| $m.value ?? 0.25);
  LET $mode_max = math::max($mode_probs) ?? 0.25;
  LET $mode_min = math::min($mode_probs) ?? 0.25;
  LET $diversity_score = IF $mode_max > 0.01 THEN math::clamp($mode_min / $mode_max, 0.0, 1.0) ELSE 1.0 END;

  LET $maturity = $conv_score * ($cfg.maturity_convergence_weight ?? 0.3)
    + $edge_score * ($cfg.maturity_edge_weight ?? 0.2)
    + $predict_score * ($cfg.maturity_reactivation_weight ?? 0.3)
    + $diversity_score * ($cfg.maturity_mode_diversity_weight ?? 0.2);

  UPDATE kernel_state SET config.developmental_maturity = math::clamp($maturity, 0.0, 1.0);

  RETURN {
    maturity: $maturity,
    convergence: $conv_score,
    edges: $edge_score,
    prediction: $predict_score,
    diversity: $diversity_score
  };
};

-- ═══════════════════════════════════════════
-- 2. fn::cognitive_cycle — fix trace reads + edge creation
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

  -- ── 3. PREDICT — RPE ──
  LET $rpe = $valence - $predicted_valence;
  LET $abs_rpe = math::abs($rpe);

  -- RPE → dopamine spike (Schultz model)
  LET $rpe_scale = $cfg.rpe_dopamine_scale ?? 0.3;
  IF $rpe > 0 { fn::hormone_spike('dopamine', $rpe * $rpe_scale); };
  IF $rpe < 0 { fn::hormone_spike('dopamine', $rpe * $rpe_scale * 0.5); };
  IF $abs_rpe > ($cfg.rpe_surprise_threshold ?? 0.2) {
    fn::hormone_spike('norepinephrine', $abs_rpe * 0.2);
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
    salience = $salience;

  -- ── 6. LEARN — three-factor Hebbian with RPE ──
  -- Find the outcome trace record (immutable trace, for graph edges)
  LET $outcome_rec = (SELECT id FROM trace WHERE trace_id = $outcome_trace_id LIMIT 1)[0];
  IF $outcome_rec IS NOT NONE AND $outcome_rec.id IS NOT NONE {
    LET $recent = (SELECT id FROM trace WHERE archived = false AND id != $outcome_rec.id LIMIT 3);
    FOR $r IN $recent {
      IF $r.id IS NOT NONE {
        fn::learn_edge($r.id, $outcome_rec.id, $valence, $abs_rpe);
      };
    };
  };

  -- Mode learning with RPE
  fn::mode_learn($rpe);

  -- Accumulator update from RPE
  UPDATE nn_node SET value = math::min([$cap, value + $abs_rpe]) WHERE node_id = 'acc:pred_error';
  IF $rpe > 0 { UPDATE nn_node SET value = math::min([$cap, value + $rpe]) WHERE node_id = 'acc:reward'; };
  IF $rpe < 0 { UPDATE nn_node SET value = math::min([$cap, value + $abs_rpe]) WHERE node_id = 'acc:pain'; };

  RETURN {
    phase: 'full',
    salience: $salience,
    rpe: $rpe,
    q_value: $new_value,
    visit_count: $visit_count + 1
  };
};

-- ═══════════════════════════════════════════
-- 3. fn::introspect — uses updated compute_maturity
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::introspect() {
  LET $maturity = fn::compute_maturity();
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  UPDATE kernel_state SET last_introspection = {
    cycle: $state.cycle,
    maturity: $maturity,
    energy: $state.energy,
    fatigue: $state.fatigue
  };
  RETURN $maturity;
};

-- ═══════════════════════════════════════════
-- 4. fn::get_behavioral_mode — from _cfg_cache
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::get_behavioral_mode() {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $modes = (SELECT node_id, value FROM nn_node WHERE model = 'affect' AND layer = 'mode');
  LET $vals = $modes.map(|$m| $m.value ?? 0);
  LET $max_v = math::max($vals) ?? 0.25;
  LET $best = (SELECT node_id, value FROM nn_node
    WHERE model = 'affect' AND layer = 'mode' AND value >= $max_v LIMIT 1)[0];
  LET $name = IF $best IS NOT NONE
    THEN string::replace($best.node_id, 'mode:', '')
    ELSE ($cfg.behavioral_mode_default ?? 'explore')
  END;
  RETURN { name: $name, prob: $best.value ?? 0.25 };
};

-- ═══════════════════════════════════════════
-- 5. fn::appraise_salience — override with base salience
-- Newborn finds everything interesting (base > 0)
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::appraise_salience($trace_id: string, $valence: float) {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};

  LET $ts = (SELECT * FROM trace_state WHERE trace_id = $trace_id AND archived = false LIMIT 1)[0];
  IF $ts = NONE { RETURN 0.1; };

  LET $novelty = 1.0 / (1.0 + ($ts.reactivation_count ?? 0));

  LET $last_event = (SELECT prediction_error FROM cognitive_event
    WHERE outcome_content = $ts.content LIMIT 1)[0];
  LET $surprise = math::abs($last_event.prediction_error ?? 0.3);

  LET $da_ph = (SELECT * FROM nn_node WHERE node_id = 'hormone:dopamine' LIMIT 1)[0].phasic ?? 0;
  LET $ne_ph = (SELECT * FROM nn_node WHERE node_id = 'hormone:norepinephrine' LIMIT 1)[0].phasic ?? 0;

  -- Base salience: everything is at least slightly interesting
  LET $base = 0.06;
  LET $salience = $base
    + math::abs($valence) * ($cfg.salience_w_valence ?? 0.3)
    + $novelty * ($cfg.salience_w_novelty ?? 0.3)
    + $surprise * ($cfg.salience_w_surprise ?? 0.2)
    + ($da_ph + $ne_ph) * ($cfg.salience_w_hormone ?? 0.2);

  RETURN math::clamp($salience, 0.0, 2.0);
};

-- ═══════════════════════════════════════════
-- 6. fn::edge_sprout — create new edges between co-active traces
-- Background process: if two traces are both active (high weight+freshness)
-- and NOT yet connected → sprout a weak edge
-- Like axon growth in developing brain
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::edge_sprout() {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};

  -- Pick 2 random active traces and connect them if not already connected
  -- O(1) instead of O(N²) — one sprout attempt per call
  LET $active = (SELECT id FROM trace WHERE archived = false LIMIT 20);
  IF array::len($active) < 2 { RETURN { sprouted: 0 }; };

  LET $a_idx = math::floor(rand::float() * array::len($active));
  LET $b_idx = math::floor(rand::float() * (array::len($active) - 1));
  IF $b_idx >= $a_idx { LET $b_idx = $b_idx + 1; };

  LET $a = $active[$a_idx];
  LET $b = $active[$b_idx];

  IF $a.id IS NOT NONE AND $b.id IS NOT NONE {
    LET $exists = (SELECT count() AS c FROM activates WHERE in = $a.id AND out = $b.id GROUP ALL)[0].c ?? 0;
    IF $exists = 0 {
      RELATE ($a.id)->activates->($b.id) SET
        weight = $cfg.initial_edge_weight ?? 0.1,
        eligibility = 0,
        co_activation_count = 0;
      RETURN { sprouted: 1 };
    };
  };

  RETURN { sprouted: 0 };
};

-- ═══════════════════════════════════════════
-- 7. fn::edge_death — remove weak unused edges
-- Synaptic pruning: edges that haven't been reinforced die
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::edge_death() {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $threshold = $cfg.edge_death_threshold ?? 0.02;
  LET $max_deaths = $cfg.edge_death_max ?? 3;

  -- Find weakest edges
  LET $weak = (SELECT id, weight, co_activation_count FROM activates
    WHERE weight < $threshold AND (co_activation_count ?? 0) < 3
    LIMIT $max_deaths);

  -- Archive (don't delete — pointer architecture)
  FOR $e IN $weak {
    UPDATE activates SET weight = 0, archived = true WHERE id = $e.id;
  };

  RETURN { pruned: array::len($weak) };
};

-- ═══════════════════════════════════════════
-- 8. fn::brain_tick — add edge sprouting + death to LOW circuit
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
    };

    IF $x % $freq_trace = 0 {
      UPDATE trace_state SET
        weight = weight * ($cfg.trace_weight_decay ?? 0.999),
        freshness = freshness * ($cfg.trace_freshness_decay ?? 0.999)
      WHERE archived = false AND weight > ($cfg.trace_decay_min_weight ?? 0.05);
    };

    IF $x % $freq_agency = 0 { fn::agency_tick($x); };

    IF $x % $freq_med = 0 {
      fn::active_inference($cfg.active_inference_threshold ?? 0.3, $cfg.active_inference_limit ?? 10);
      fn::forget_traces($cfg.forget_weight_threshold ?? 0.02, $cfg.forget_freshness_threshold ?? 0.03);
      fn::decay_eligibility();
    };

    IF $x % $freq_low = 0 {
      fn::nn_decay_all($cfg.nn_decay_rate ?? 0.001);
      fn::consolidate_episodic($cfg.consolidation_min_count ?? 3);
      fn::consolidation_replay();
      -- Edge growth: sprout new + prune dead
      fn::edge_sprout();
      fn::edge_death();
      IF $x % ($freq_low * ($cfg.prune_freq_multiplier ?? 3)) = 0 {
        fn::prune_dissimilar_edges($cfg.prune_min_similarity ?? 0.15);
        fn::synaptic_homeostasis();
      };
    };

    IF $x % $freq_deep = 0 {
      fn::build_world_model();
      fn::introspect();
      CREATE config_snapshot SET config = $cfg, cycle = (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0;
    };
  };

  RETURN (SELECT * FROM kernel_state LIMIT 1)[0];
};
