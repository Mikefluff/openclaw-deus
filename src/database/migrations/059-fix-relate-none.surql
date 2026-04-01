-- Migration 059: Fix RELATE NONE crash in brain_tick_auto
-- Root cause: fn::dual_match + fn::learn_edge inside process_sensory
-- create RELATEs that fail when brain_tick(100) runs in same transaction
-- and modifies the graph (edge_sprout, edge_death, etc.).
-- Fix: remove DualLink from process_sensory (move to standalone call).
-- Also: guard ALL RELATE in learn_edge with IS NOT NONE checks.

-- fn::learn_edge — add NONE guards before RELATE
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

    CREATE learning_event SET
      edge_in = $from_id, edge_out = $to_id,
      weight_before = $old_w, weight_after = $new_w,
      dopamine = $dopamine, eligibility = $new_elig, modulator = $M,
      cosine_sim = $sim, pred_error = $pred_error,
      cycle = (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0;
  } ELSE {
    -- Guard: both IDs must be valid trace records
    IF $from_id IS NOT NONE AND $to_id IS NOT NONE {
      LET $init_w = math::clamp(($cfg.initial_edge_weight ?? 0.3) + $lr * $pre * $post * $M * $sim_mod, 0.01, 1.0);
      RELATE ($from_id)->activates->($to_id) SET
        weight = $init_w,
        eligibility = $pre * $post,
        co_activation_count = 1;
    };
  };

  RETURN true;
};

-- fn::process_sensory — remove DualLink call (causes RELATE NONE in transaction)
-- DualLink should be called standalone, not inside batch process_sensory
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

    CREATE trace_history SET
      trace = $existing_state.trace,
      weight = $existing_state.weight ?? 0,
      freshness = $existing_state.freshness ?? 0,
      emotional_charge = $old_charge,
      reactivation_count = $existing_state.reactivation_count ?? 0,
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
    RETURN { trace_id: $trace_obj.trace_id ?? '', is_new: false };
  };

  -- NEW TRACE
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

  LET $trace_rec = (SELECT id FROM trace WHERE trace_id = $trace_id LIMIT 1)[0];
  CREATE trace_state SET
    trace = $trace_rec.id, trace_id = $trace_id, content = $trace_key,
    weight = ($cfg.initial_trace_weight ?? 0.5) + math::abs($valence) * ($cfg.initial_trace_valence_scale ?? 0.3),
    freshness = 1.0, emotional_charge = $valence, reactivation_count = 0,
    archived = false, suppressed = false, cycle = $cycle;

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

  RETURN { trace_id: $trace_id, is_new: true };
};
