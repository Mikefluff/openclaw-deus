-- Migration 054: Pipeline Audit Fixes
-- Fixes 11 issues found in cognitive pipeline audit:
-- 1. Fix broken 2-hop query in active_inference (in.in.position invalid)
-- 2. Fix ECAN double-dip: remove trace_weight_decay, keep ECAN rent as sole decay
-- 3. Restore defensive mode check in agency_tick
-- 4. Fix agency_tick Q-value exploitation (was only picking 1 global best)
-- 5. Integrate hebbian strengthening into sleep_consolidation
-- 6. Call fn::dual_match from fn::process_sensory (reactive pattern matching)
-- 7. Fix hormone reads: `value` reserved keyword in DEFINE FUNCTION

-- ═══════════════════════════════════════════
-- 1. fn::active_inference — fix broken 2-hop query
-- in.in.position is invalid SurrealQL. Replace with safe 1-hop + separate 2-hop.
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::active_inference($strength_threshold: float, $limit: int) {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $floor = $cfg.cosine_spread_floor ?? 0.2;
  LET $w_rate = $cfg.spread_weight_rate ?? 0.05;
  LET $f_rate = $cfg.spread_freshness_rate ?? 0.02;
  LET $hop_decay = $cfg.spread_hop_decay ?? 0.5;

  -- Phase 1: Direct neighbors (hop 1, full strength)
  LET $direct = (SELECT
    in AS source_node, in.trace_id AS source_id, in.position AS source_pos,
    out AS mid_node, out.trace_id AS mid_id, out.position AS mid_pos,
    weight AS edge_weight
  FROM activates
  WHERE weight > $strength_threshold AND in.archived = false AND out.archived = false
  LIMIT $limit);

  FOR $c IN $direct {
    LET $sim = IF $c.source_pos IS NOT NONE AND $c.mid_pos IS NOT NONE
      AND array::len($c.source_pos) > 0 AND array::len($c.mid_pos) > 0
      THEN vector::similarity::cosine($c.source_pos, $c.mid_pos)
      ELSE 0.5
    END;
    LET $boost = math::max([$floor, $sim]);

    UPDATE trace_state SET
      weight = math::clamp(weight + $c.edge_weight * $boost * $w_rate, 0.01, 1.0),
      freshness = math::min([1.0, freshness + $boost * $f_rate])
    WHERE trace_id = $c.mid_id AND archived = false;
  };

  -- Phase 2: 2-hop via recursive path (safe syntax)
  -- For each strong edge source, find 2-hop targets
  LET $sources = (SELECT in AS source, in.position AS source_pos FROM activates
    WHERE weight > $strength_threshold AND in.archived = false
    LIMIT 5);

  LET $hop2_count = 0;
  FOR $s IN $sources {
    IF $s.source IS NOT NONE {
      -- 2-hop targets via recursive path
      LET $targets = (SELECT id, trace_id, position FROM $s.source->activates.{2..2}->trace
        WHERE archived = false LIMIT 5);

      FOR $t IN $targets {
        LET $sim2 = IF $s.source_pos IS NOT NONE AND $t.position IS NOT NONE
          AND array::len($s.source_pos) > 0 AND array::len($t.position) > 0
          THEN vector::similarity::cosine($s.source_pos, $t.position)
          ELSE 0.3
        END;
        LET $boost2 = math::max([$floor, $sim2]) * $hop_decay;

        UPDATE trace_state SET
          weight = math::clamp(weight + $boost2 * $w_rate, 0.01, 1.0),
          freshness = math::min([1.0, freshness + $boost2 * $f_rate * $hop_decay])
        WHERE trace_id = $t.trace_id AND archived = false;

        LET $hop2_count = $hop2_count + 1;
      };
    };
  };

  RETURN { spread_direct: array::len($direct), spread_hop2: $hop2_count };
};

-- ═══════════════════════════════════════════
-- 2. fn::agency_tick — restore defensive mode + better Q-value exploitation
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::agency_tick($tick: int) {
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  IF $state = NONE OR ($state.running ?? false) = false { RETURN { acted: false }; };
  LET $cfg = $state.config ?? {};

  LET $energy = $state.energy ?? 0;
  IF $energy < ($cfg.agency_energy_threshold ?? 0.15) { RETURN { acted: false, reason: 'low_energy' }; };

  LET $mode = fn::get_behavioral_mode();
  LET $mode_name = $mode.name ?? ($cfg.behavioral_mode_default ?? 'explore');

  -- Mode-based throttling (restored defensive check)
  IF $mode_name = 'resting' AND $energy < ($cfg.mode_energy_resting ?? 0.5) { RETURN { acted: false, reason: 'resting_mode' }; };
  IF $mode_name = 'defensive' AND $energy < ($cfg.mode_energy_defensive ?? 0.3) { RETURN { acted: false, reason: 'defensive_low_energy' }; };

  LET $dopamine = (SELECT * FROM nn_node WHERE node_id = 'hormone:dopamine' LIMIT 1)[0].value ?? 0.5;
  LET $cortisol = (SELECT * FROM nn_node WHERE node_id = 'hormone:cortisol' LIMIT 1)[0].value ?? 0.5;

  LET $methods = ['touch', 'push', 'drop', 'shake', 'look', 'squeeze'];
  LET $method = $methods[math::floor(rand::float() * array::len($methods))];
  LET $target_content = '';
  LET $pred_val = 0.0;

  -- Explore/exploit probability
  LET $explore_prob = math::clamp(
    $dopamine * ($cfg.explore_dopamine_coeff ?? 0.4) - $cortisol * ($cfg.explore_cortisol_coeff ?? 0.2),
    $cfg.explore_min ?? 0.1, $cfg.explore_max ?? 0.9);
  IF $mode_name = 'explore' { LET $explore_prob = math::min([0.95, $explore_prob + ($cfg.mode_explore_boost ?? 0.2)]); };
  IF $mode_name = 'exploit' { LET $explore_prob = math::max([0.05, $explore_prob - ($cfg.mode_exploit_reduction ?? 0.3)]); };

  IF rand::float() > $explore_prob {
    -- EXPLOIT: pick best Q-value with UCB1 exploration bonus
    LET $total_actions = (SELECT math::sum(update_count) AS s FROM action_value GROUP ALL)[0].s ?? 1;
    LET $best_q = (SELECT key, value, update_count,
      value + ($cfg.ucb_exploration ?? 0.5) * math::sqrt(math::ln($total_actions) / math::max([1, update_count])) AS ucb
      FROM action_value WHERE update_count > 0
      ORDER BY ucb DESC LIMIT 1)[0];

    IF $best_q IS NOT NONE {
      LET $parts = string::split($best_q.key ?? '', ':');
      IF array::len($parts) >= 2 {
        LET $method = $parts[0];
        LET $target_content = string::join(':', array::slice($parts, 1, array::len($parts)));
        LET $pred_val = $best_q.value ?? 0;
      };
    };
  };

  CREATE kernel_request CONTENT {
    type: 'action',
    payload: { method: $method, target_content: $target_content, predicted_valence: $pred_val, mode: $mode_name, dopamine: $dopamine },
    status: 'pending', created_at: time::now()
  };

  UPDATE kernel_state SET energy = math::max([0.0, energy - ($cfg.action_energy_cost ?? 0.05)]);
  RETURN { acted: true, method: $method, mode: $mode_name, predicted_valence: $pred_val };
};

-- ═══════════════════════════════════════════
-- 3. fn::sleep_consolidation — integrate ECAN hebbian
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::sleep_consolidation($decay_rate: float) {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $weak_decay = $cfg.sleep_weak_decay ?? 0.9;
  LET $strong_boost = $cfg.sleep_strong_boost ?? 1.05;
  LET $threshold = $cfg.sleep_strength_threshold ?? 0.3;

  -- Phase 1: Neural weight decay
  fn::nn_decay_all($decay_rate);

  -- Phase 2: Tononi SHY — scale down weak, scale up strong
  UPDATE activates SET weight = weight * $weak_decay
    WHERE weight < $threshold AND weight > 0.01 AND (archived IS NONE OR archived = false);
  UPDATE activates SET weight = math::min([1.0, weight * $strong_boost])
    WHERE weight >= $threshold AND (archived IS NONE OR archived = false);

  -- Phase 3: ECAN — strengthen strong hebbian links, decay weak ones
  UPDATE hebbian SET weight = math::min([1.0, weight * $strong_boost])
    WHERE weight >= $threshold;
  UPDATE hebbian SET weight = weight * $weak_decay
    WHERE weight < $threshold AND weight > 0.01;
  DELETE hebbian WHERE weight < 0.01;

  -- Phase 4: Memory replay
  fn::consolidation_replay();

  -- Phase 5: Synaptic homeostasis
  fn::synaptic_homeostasis();

  -- Phase 6: Grow elements (sleep promotes structural growth)
  fn::grow_synaptic_elements();

  -- Phase 7: Prune dead edges
  fn::edge_death();

  RETURN true;
};

-- ═══════════════════════════════════════════
-- 4. fn::process_sensory — add DualLink call after trace activation
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

  LET $existing_state = (SELECT * FROM trace_state WHERE content = $trace_key AND archived = false LIMIT 1)[0];

  IF $existing_state != NONE {
    LET $old_charge = $existing_state.emotional_charge ?? 0;
    LET $old_weight = $existing_state.weight ?? 0.5;
    LET $old_count = $existing_state.reactivation_count ?? 0;

    CREATE trace_history SET
      trace = $existing_state.trace,
      weight = $old_weight,
      freshness = $existing_state.freshness ?? 0,
      emotional_charge = $old_charge,
      reactivation_count = $old_count,
      cycle = $existing_state.cycle ?? 0,
      reason = 'pre_reactivation';

    UPDATE trace_state SET
      weight = math::min([1.0, weight + ($cfg.reactivation_weight_boost ?? 0.1) + math::abs($valence) * ($cfg.reactivation_valence_scale ?? 0.2)]),
      freshness = 1.0,
      reactivation_count = reactivation_count + 1,
      emotional_charge = emotional_charge * ($cfg.emotional_blend_old ?? 0.7) + $valence * ($cfg.emotional_blend_new ?? 0.3),
      cycle = $cycle
    WHERE id = $existing_state.id;

    UPDATE trace SET position = $pos64 WHERE id = $existing_state.trace;

    UPDATE nn_node SET value = math::min([$cap, value + ($cfg.acc_convergence_boost ?? 0.1)]) WHERE node_id = 'acc:convergence';
    UPDATE nn_node SET value = math::min([$cap, value + ($cfg.acc_stability_boost ?? 0.15)]) WHERE node_id = 'acc:stability';

    IF ($old_charge > 0 AND $valence < 0) OR ($old_charge < 0 AND $valence > 0) {
      fn::hormone_spike('norepinephrine', $cfg.ne_spike_pred_error ?? 0.25);
      UPDATE nn_node SET value = math::min([$cap, value + ($cfg.acc_tension_on_valence_flip ?? 0.3)]) WHERE node_id = 'acc:tension';
      UPDATE nn_node SET value = math::min([$cap, value + ($cfg.acc_pred_error_boost ?? 0.3)]) WHERE node_id = 'acc:pred_error';
    };

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
    LET $result_tid = $trace_obj.trace_id ?? '';

    -- DualLink: reactive pattern match for this trace
    fn::dual_match($result_tid);

    RETURN { trace_id: $result_tid, is_new: false };
  };

  -- NEW TRACE
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

  UPDATE nn_node SET value = math::min([$cap, value + ($cfg.acc_novelty_boost ?? 0.2)]) WHERE node_id = 'acc:novelty';
  UPDATE nn_node SET value = math::min([$cap, value + ($cfg.acc_pred_error_boost ?? 0.3)]) WHERE node_id = 'acc:pred_error';

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

  -- DualLink: reactive pattern match for new trace
  fn::dual_match($trace_id);

  RETURN { trace_id: $trace_id, is_new: true };
};

-- ═══════════════════════════════════════════
-- 5. fn::brain_tick — unified, fixes ECAN double-dip
-- ECAN rent replaces trace_weight_decay (one decay mechanism, not two)
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

    -- HIGH: hormones + affect + ECAN rent
    IF $x % $freq_high = 0 {
      fn::hormone_decay_tick();
      fn::affect_forward_output();
      fn::apply_config_deltas();
      fn::affect_backward_targeted($cfg.affect_lr ?? 0.05);
      UPDATE nn_node SET value = value * ($cfg.accumulator_decay ?? 0.99) WHERE model = 'affect' AND layer = 'input';
      fn::ecan_collect_rent();
    };

    -- TRACE: freshness decay only (weight decay handled by ECAN rent above)
    IF $x % $freq_trace = 0 {
      UPDATE trace_state SET
        freshness = freshness * ($cfg.trace_freshness_decay ?? 0.999)
      WHERE archived = false AND freshness > 0.01;
    };

    -- AGENCY
    IF $x % $freq_agency = 0 { fn::agency_tick($x); };

    -- MEDIUM: spreading + forgetting + meta-modulation + ECAN hebbian update
    IF $x % $freq_med = 0 {
      fn::active_inference($cfg.active_inference_threshold ?? 0.3, $cfg.active_inference_limit ?? 10);
      fn::forget_traces($cfg.forget_weight_threshold ?? 0.02, $cfg.forget_freshness_threshold ?? 0.03);
      fn::decay_eligibility();
      fn::apply_meta_modulation();
      fn::ecan_update_hebbian();
    };

    -- LOW: consolidation + structural plasticity + patterns + ECAN
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
      IF $x % ($freq_low * ($cfg.prune_freq_multiplier ?? 3)) = 0 {
        fn::prune_dissimilar_edges($cfg.prune_min_similarity ?? 0.15);
        fn::synaptic_homeostasis();
      };
    };

    -- DEEP: world model + introspection + PLN
    IF $x % $freq_deep = 0 {
      fn::build_world_model();
      fn::introspect();
      fn::pln_infer_chain();
      CREATE config_snapshot SET config = $cfg, cycle = (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0;
    };
  };

  RETURN (SELECT * FROM kernel_state LIMIT 1)[0];
};
