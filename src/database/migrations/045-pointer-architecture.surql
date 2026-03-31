-- Migration 045: Pointer Architecture
-- Split trace into immutable core + lightweight mutable state.
-- trace = never mutated after creation (content, position, source_type)
-- trace_state = current weight/freshness (batch-decayable, small records)
-- trace_history = append-only reactivation/event log (identity = topology)
-- _cfg_cache = single-record config cache (eliminates 3-4 reads per brain_tick)
-- learning_event = causal log for edge weight changes

-- ═══════════════════════════════════════════
-- 1. NEW TABLES
-- ═══════════════════════════════════════════

DEFINE TABLE OVERWRITE trace_state SCHEMALESS;
DEFINE INDEX idx_ts_trace ON trace_state FIELDS trace;
DEFINE INDEX idx_ts_content ON trace_state FIELDS content;

DEFINE TABLE OVERWRITE trace_history SCHEMALESS;
DEFINE INDEX idx_th_trace ON trace_history FIELDS trace;

DEFINE TABLE OVERWRITE learning_event SCHEMALESS;
DEFINE TABLE OVERWRITE config_snapshot SCHEMALESS;
DEFINE TABLE OVERWRITE _cfg_cache SCHEMALESS;

-- ═══════════════════════════════════════════
-- 2. SEED: migrate existing trace states to trace_state table
-- ═══════════════════════════════════════════

LET $existing = (SELECT id, trace_id, content, weight, freshness, emotional_charge,
  reactivation_count, last_reactivated_cycle, archived, suppressed
  FROM trace WHERE archived = false);

FOR $t IN $existing {
  CREATE trace_state SET
    trace = $t.id,
    trace_id = $t.trace_id,
    content = $t.content,
    weight = $t.weight ?? 0.5,
    freshness = $t.freshness ?? 1.0,
    emotional_charge = $t.emotional_charge ?? 0,
    reactivation_count = $t.reactivation_count ?? 0,
    archived = false,
    suppressed = $t.suppressed ?? false,
    cycle = $t.last_reactivated_cycle ?? 0;
};

-- Seed config cache
CREATE _cfg_cache SET cfg = (SELECT * FROM kernel_state LIMIT 1)[0].config ?? {};

-- ═══════════════════════════════════════════
-- 3. fn::process_sensory — immutable trace + mutable trace_state
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::process_sensory(
  $action_id: int, $channels: array, $speech: array, $valence: float, $object_idx: int
) {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $cap = $cfg.accumulator_cap ?? 5.0;

  LET $position = array::concat($channels, $speech);
  LET $padded = IF array::len($position) < 64 THEN
    array::concat($position, [0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f])
  ELSE $position END;
  LET $pos64 = array::slice($padded, 0, 64);

  LET $trace_key = type::string($action_id) + ':' + type::string($object_idx);
  LET $cycle = (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0;

  -- Check trace_state for existing trace (lightweight lookup)
  LET $existing_state = (SELECT * FROM trace_state WHERE content = $trace_key AND archived = false LIMIT 1)[0];

  IF $existing_state != NONE {
    -- REACTIVATION: trace exists, update state only
    LET $old_charge = $existing_state.emotional_charge ?? 0;
    LET $old_weight = $existing_state.weight ?? 0.5;
    LET $old_count = $existing_state.reactivation_count ?? 0;

    -- Archive current state as history (pointer: identity = chain of states)
    CREATE trace_history SET
      trace = $existing_state.trace,
      weight = $old_weight,
      freshness = $existing_state.freshness ?? 0,
      emotional_charge = $old_charge,
      reactivation_count = $old_count,
      cycle = $existing_state.cycle ?? 0,
      reason = 'pre_reactivation';

    -- Update current state (lightweight: no position vector, no content)
    UPDATE trace_state SET
      weight = math::min([1.0, weight + ($cfg.reactivation_weight_boost ?? 0.1) + math::abs($valence) * ($cfg.reactivation_valence_scale ?? 0.2)]),
      freshness = 1.0,
      reactivation_count = reactivation_count + 1,
      emotional_charge = emotional_charge * ($cfg.emotional_blend_old ?? 0.7) + $valence * ($cfg.emotional_blend_new ?? 0.3),
      cycle = $cycle
    WHERE id = $existing_state.id;

    -- Update immutable trace position (position CAN change — it's sensory signature)
    UPDATE trace SET position = $pos64 WHERE id = $existing_state.trace;

    -- Accumulators
    UPDATE nn_node SET value = math::min([$cap, value + ($cfg.acc_convergence_boost ?? 0.1)]) WHERE node_id = 'acc:convergence';
    UPDATE nn_node SET value = math::min([$cap, value + ($cfg.acc_stability_boost ?? 0.15)]) WHERE node_id = 'acc:stability';

    -- Valence flip → NE spike + tension
    IF ($old_charge > 0 AND $valence < 0) OR ($old_charge < 0 AND $valence > 0) {
      fn::hormone_spike('norepinephrine', $cfg.ne_spike_pred_error ?? 0.25);
      UPDATE nn_node SET value = math::min([$cap, value + ($cfg.acc_tension_on_valence_flip ?? 0.3)]) WHERE node_id = 'acc:tension';
      UPDATE nn_node SET value = math::min([$cap, value + ($cfg.acc_pred_error_boost ?? 0.3)]) WHERE node_id = 'acc:pred_error';
    };

    -- Reward/pain spikes
    IF $valence > ($cfg.accumulator_valence_threshold ?? 0.1) {
      UPDATE nn_node SET value = math::min([$cap, value + $valence]) WHERE node_id = 'acc:reward';
      fn::hormone_spike('dopamine', $valence * ($cfg.da_spike_reward ?? 0.2));
    };
    IF $valence < (0.0 - ($cfg.accumulator_valence_threshold ?? 0.1)) {
      UPDATE nn_node SET value = math::min([$cap, value + math::abs($valence)]) WHERE node_id = 'acc:pain';
      fn::hormone_spike('cortisol', math::abs($valence) * ($cfg.cortisol_spike_pain ?? 0.4));
      fn::hormone_spike('dopamine', $valence * ($cfg.da_spike_neg_on_pain ?? -0.15));
    };

    LET $trace_obj = (SELECT trace_id FROM trace WHERE id = $existing_state.trace LIMIT 1)[0];
    RETURN { trace_id: $trace_obj.trace_id ?? '', is_new: false };
  };

  -- NEW TRACE: create immutable trace + initial state
  LET $trace_id = 'T' + rand::string(8);
  LET $new_trace = CREATE trace CONTENT {
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

  -- Create trace_state (lightweight mutable record)
  LET $trace_rec = (SELECT id FROM trace WHERE trace_id = $trace_id LIMIT 1)[0];
  CREATE trace_state SET
    trace = $trace_rec.id,
    trace_id = $trace_id,
    content = $trace_key,
    weight = ($cfg.initial_trace_weight ?? 0.5) + math::abs($valence) * ($cfg.initial_trace_valence_scale ?? 0.3),
    freshness = 1.0,
    emotional_charge = $valence,
    reactivation_count = 0,
    archived = false,
    suppressed = false,
    cycle = $cycle;

  -- Accumulators: novelty + pred_error
  UPDATE nn_node SET value = math::min([$cap, value + ($cfg.acc_novelty_boost ?? 0.2)]) WHERE node_id = 'acc:novelty';
  UPDATE nn_node SET value = math::min([$cap, value + ($cfg.acc_pred_error_boost ?? 0.3)]) WHERE node_id = 'acc:pred_error';

  -- Hormone spikes: new = dopamine + NE
  fn::hormone_spike('dopamine', $cfg.da_spike_novelty ?? 0.1);
  fn::hormone_spike('norepinephrine', $cfg.ne_spike_novelty ?? 0.15);

  IF $valence > ($cfg.accumulator_valence_threshold ?? 0.1) {
    UPDATE nn_node SET value = math::min([$cap, value + $valence]) WHERE node_id = 'acc:reward';
    fn::hormone_spike('dopamine', $valence * ($cfg.da_spike_reward ?? 0.2));
  };
  IF $valence < (0.0 - ($cfg.accumulator_valence_threshold ?? 0.1)) {
    UPDATE nn_node SET value = math::min([$cap, value + math::abs($valence)]) WHERE node_id = 'acc:pain';
    fn::hormone_spike('cortisol', math::abs($valence) * ($cfg.cortisol_spike_pain ?? 0.4));
  };

  RETURN { trace_id: $trace_id, is_new: true };
};

-- ═══════════════════════════════════════════
-- 4. fn::brain_tick — decay on trace_state, config cache
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::brain_tick($n: int) {
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  LET $cfg = $state.config ?? {};

  -- Cache config for sub-functions (one write, eliminates N reads)
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

    -- TRACE DECAY on trace_state (lightweight: no position vectors!)
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
      IF $x % ($freq_low * ($cfg.prune_freq_multiplier ?? 3)) = 0 {
        fn::prune_dissimilar_edges($cfg.prune_min_similarity ?? 0.15);
        fn::synaptic_homeostasis();
      };
    };

    IF $x % $freq_deep = 0 {
      fn::build_world_model();
      fn::introspect();
      -- Periodic config snapshot (identity = history of configurations)
      LET $cy = (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0;
      CREATE config_snapshot SET config = $cfg, cycle = $cy;
    };
  };

  RETURN (SELECT * FROM kernel_state LIMIT 1)[0];
};

-- ═══════════════════════════════════════════
-- 5. fn::active_inference — spread on trace_state
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::active_inference($strength_threshold: float, $limit: int) {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $floor = $cfg.cosine_spread_floor ?? 0.2;
  LET $w_rate = $cfg.spread_weight_rate ?? 0.05;
  LET $f_rate = $cfg.spread_freshness_rate ?? 0.02;

  LET $chains = (SELECT
    in AS source_node, in.trace_id AS source_id, in.position AS source_pos,
    out AS mid_node, out.trace_id AS mid_id, out.position AS mid_pos,
    weight AS first_weight
  FROM activates
  WHERE weight > $strength_threshold AND in.archived = false AND out.archived = false
  LIMIT $limit);

  FOR $c IN $chains {
    LET $sim = IF $c.source_pos IS NOT NONE AND $c.mid_pos IS NOT NONE
      AND array::len($c.source_pos) > 0 AND array::len($c.mid_pos) > 0
      THEN vector::similarity::cosine($c.source_pos, $c.mid_pos)
      ELSE 0.5
    END;
    LET $boost = math::max([$floor, $sim]);

    -- Spread on trace_state (lightweight, no position)
    UPDATE trace_state SET
      weight = math::clamp(weight + $c.first_weight * $boost * $w_rate, 0.01, 1.0),
      freshness = math::min([1.0, freshness + $boost * $f_rate])
    WHERE trace_id = $c.mid_id AND archived = false;
  };

  RETURN { spread: array::len($chains) };
};

-- ═══════════════════════════════════════════
-- 6. fn::forget_traces — archive via trace_state, not trace
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::forget_traces($weight_threshold: float, $freshness_threshold: float) {
  -- Mark trace_state as archived (trace itself stays immutable)
  UPDATE trace_state SET archived = true
    WHERE archived = false AND weight < $weight_threshold AND freshness < $freshness_threshold;

  -- Also mark corresponding traces as archived (for legacy compatibility)
  LET $forgotten = (SELECT trace FROM trace_state WHERE archived = true);
  FOR $f IN $forgotten {
    UPDATE trace SET archived = true WHERE id = $f.trace AND archived = false;
  };

  RETURN true;
};

-- ═══════════════════════════════════════════
-- 7. fn::consolidation_replay — uses trace_state
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::consolidation_replay() {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $n = $cfg.consolidation_replay_count ?? 10;

  -- Pick top-N by weight from trace_state (lightweight read)
  LET $traces = (SELECT trace, trace_id, weight, emotional_charge FROM trace_state
    WHERE archived = false AND weight > 0.1
    LIMIT $n);

  FOR $t IN $traces {
    UPDATE trace_state SET
      weight = math::min([1.0, weight + 0.02]),
      freshness = math::min([1.0, freshness + 0.1]),
      reactivation_count = reactivation_count + 1
    WHERE trace = $t.trace AND archived = false;

    LET $others = (SELECT trace FROM trace_state WHERE archived = false AND trace != $t.trace AND weight > 0.1 LIMIT 3);
    FOR $o IN $others {
      IF $o.trace IS NOT NONE AND $t.trace IS NOT NONE {
        fn::learn_edge($o.trace, $t.trace, $t.emotional_charge ?? 0, $cfg.consolidation_homeostatic_rate ?? 0.05);
      };
    };
  };

  RETURN { replayed: array::len($traces) };
};

-- ═══════════════════════════════════════════
-- 8. fn::learn_edge — add learning_event for causality
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::learn_edge(
  $from_id: record, $to_id: record, $valence: float, $pred_error: float
) {
  LET $from = (SELECT * FROM $from_id)[0];
  LET $to = (SELECT * FROM $to_id)[0];
  IF $from = NONE OR $to = NONE { RETURN false; };

  LET $dopamine = (SELECT * FROM nn_node WHERE node_id = 'hormone:dopamine' LIMIT 1)[0].value ?? 0.5;
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $lr = $cfg.hebbian_lr ?? 0.01;
  LET $gamma = $cfg.td_gamma ?? 0.9;
  LET $lambda = $cfg.eligibility_decay ?? 0.95;

  LET $pre = ($from.weight ?? 0.5) * ($from.freshness ?? 1.0);
  LET $post = ($to.weight ?? 0.5) * ($to.freshness ?? 1.0);
  LET $td = $valence + $gamma * ($to.weight ?? 0.5) - ($from.weight ?? 0.5);
  LET $surprise = 1.0 - math::pow(math::E, 0.0 - $pred_error * $pred_error);
  LET $M = $dopamine * $td + (1.0 - $dopamine) * $surprise;

  LET $sim = IF $from.position IS NOT NONE AND $to.position IS NOT NONE
    AND array::len($from.position) > 0 AND array::len($to.position) > 0
    THEN vector::similarity::cosine($from.position, $to.position)
    ELSE 0.5
  END;
  LET $sim_mod = math::max([0.1, $sim]);

  LET $edge = (SELECT * FROM activates WHERE in = $from_id AND out = $to_id LIMIT 1)[0];

  IF $edge != NONE {
    LET $old_w = $edge.weight ?? 0.3;
    LET $new_elig = $lambda * ($edge.eligibility ?? 0) + $pre * $post;
    LET $new_w = math::clamp($old_w + $lr * $new_elig * $M * $sim_mod, 0.01, 1.0);

    UPDATE activates SET
      eligibility = $new_elig,
      weight = $new_w,
      co_activation_count = (co_activation_count ?? 0) + 1
    WHERE in = $from_id AND out = $to_id;

    -- Causality log (append-only, pointer architecture)
    CREATE learning_event SET
      edge_in = $from_id, edge_out = $to_id,
      weight_before = $old_w, weight_after = $new_w,
      dopamine = $dopamine, eligibility = $new_elig, modulator = $M,
      cosine_sim = $sim, pred_error = $pred_error,
      cycle = (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0;
  } ELSE {
    LET $init_w = math::clamp(($cfg.initial_edge_weight ?? 0.3) + $lr * $pre * $post * $M * $sim_mod, 0.01, 1.0);
    RELATE ($from_id)->activates->($to_id) SET
      weight = $init_w,
      eligibility = $pre * $post,
      co_activation_count = 1;
  };

  RETURN true;
};

-- ═══════════════════════════════════════════
-- 9. fn::appraise_salience — read from trace_state
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::appraise_salience($trace_id: string, $valence: float) {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};

  LET $ts = (SELECT * FROM trace_state WHERE trace_id = $trace_id AND archived = false LIMIT 1)[0];
  IF $ts = NONE { RETURN 0.0; };

  LET $novelty = 1.0 / (1.0 + ($ts.reactivation_count ?? 0));

  LET $last_event = (SELECT prediction_error FROM cognitive_event
    WHERE outcome_content = $ts.content LIMIT 1)[0];
  LET $surprise = math::abs($last_event.prediction_error ?? 0.5);

  LET $da_ph = (SELECT * FROM nn_node WHERE node_id = 'hormone:dopamine' LIMIT 1)[0].phasic ?? 0;
  LET $ne_ph = (SELECT * FROM nn_node WHERE node_id = 'hormone:norepinephrine' LIMIT 1)[0].phasic ?? 0;
  LET $hormone_mod = $da_ph + $ne_ph;

  LET $salience = math::abs($valence) * ($cfg.salience_w_valence ?? 0.3)
    + $novelty * ($cfg.salience_w_novelty ?? 0.3)
    + $surprise * ($cfg.salience_w_surprise ?? 0.2)
    + $hormone_mod * ($cfg.salience_w_hormone ?? 0.2);

  RETURN math::clamp($salience, 0.0, 2.0);
};

-- ═══════════════════════════════════════════
-- 10. fn::agency_tick — read candidates from trace_state
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::agency_tick($tick: int) {
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  IF $state = NONE OR ($state.running ?? false) = false { RETURN { acted: false }; };
  LET $cfg = $state.config ?? {};

  LET $energy = $state.energy ?? 0;
  IF $energy < ($cfg.agency_energy_threshold ?? 0.15) { RETURN { acted: false, reason: 'low_energy' }; };

  LET $mode = fn::get_behavioral_mode();
  LET $mode_name = $mode.name ?? ($cfg.behavioral_mode_default ?? 'explore');

  IF $mode_name = 'resting' AND $energy < ($cfg.mode_energy_resting ?? 0.5) { RETURN { acted: false, reason: 'resting_mode' }; };
  IF $mode_name = 'defensive' AND $energy < ($cfg.mode_energy_defensive ?? 0.3) { RETURN { acted: false, reason: 'defensive_low_energy' }; };

  LET $dopamine = (SELECT * FROM nn_node WHERE node_id = 'hormone:dopamine' LIMIT 1)[0].value ?? 0.5;
  LET $cortisol = (SELECT * FROM nn_node WHERE node_id = 'hormone:cortisol' LIMIT 1)[0].value ?? 0.5;

  -- Read candidates from trace_state (lightweight, no position vectors)
  LET $candidates = (SELECT trace_id, weight, content FROM trace_state
    WHERE archived = false AND suppressed = false LIMIT 10);
  IF array::len($candidates) = 0 { RETURN { acted: false, reason: 'no_traces' }; };

  LET $methods = ['touch', 'push', 'drop', 'shake', 'look', 'squeeze'];

  -- Find best action from Q-values or explore
  LET $best_av = (SELECT * FROM action_value WHERE update_count > 0 LIMIT 1)[0];

  LET $method = $methods[math::floor(rand::float() * array::len($methods))];
  LET $target = $candidates[math::floor(rand::float() * array::len($candidates))];
  LET $pred_val = 0.0;

  IF $best_av IS NOT NONE {
    LET $parts = string::split($best_av.key ?? '', ':');
    IF array::len($parts) >= 2 {
      LET $found = (SELECT trace_id, weight, content FROM trace_state
        WHERE content = string::join(':', array::slice($parts, 1, array::len($parts))) AND archived = false LIMIT 1)[0];
      IF $found IS NOT NONE {
        LET $method = $parts[0];
        LET $target = $found;
        LET $pred_val = $best_av.value ?? 0;
      };
    };
  };

  -- Explore override
  LET $explore_prob = math::clamp(
    $dopamine * ($cfg.explore_dopamine_coeff ?? 0.4) - $cortisol * ($cfg.explore_cortisol_coeff ?? 0.2),
    $cfg.explore_min ?? 0.1, $cfg.explore_max ?? 0.9);
  IF $mode_name = 'explore' { LET $explore_prob = math::min([0.95, $explore_prob + ($cfg.mode_explore_boost ?? 0.2)]); };

  IF rand::float() < $explore_prob {
    LET $method = $methods[math::floor(rand::float() * array::len($methods))];
    LET $target = $candidates[math::floor(rand::float() * array::len($candidates))];
    LET $pred_val = (SELECT * FROM action_value WHERE key = ($method + ':' + $target.content) LIMIT 1)[0].value ?? 0;
  };

  CREATE kernel_request CONTENT {
    type: 'action',
    payload: { method: $method, target: $target.trace_id, target_content: $target.content, predicted_valence: $pred_val, mode: $mode_name, dopamine: $dopamine },
    status: 'pending', created_at: time::now()
  };
  CREATE brain_action CONTENT { tick: $tick, method: $method, target: $target.trace_id, target_content: $target.content, predicted_valence: $pred_val, mode: $mode_name, energy: $energy };

  UPDATE kernel_state SET energy = math::max([0.0, energy - ($cfg.action_energy_cost ?? 0.05)]);
  RETURN { acted: true, method: $method, target: $target.trace_id, predicted_valence: $pred_val, mode: $mode_name };
};
