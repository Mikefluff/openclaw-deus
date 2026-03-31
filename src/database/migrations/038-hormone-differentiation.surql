-- Migration 038: Hormone Differentiation
-- Problem: single scalar loss_sign → all hormones converge to same value
-- Fix: per-hormone target signals from different accumulator combinations
-- Each hormone has a biologically-motivated target function

-- ═══════════════════════════════════════════
-- 1. CONFIG: hormone target weights
-- ═══════════════════════════════════════════

UPDATE kernel_state SET
  -- How much each accumulator influences each hormone's target
  -- cortisol: stress = pain + pred_error - convergence
  config.cortisol_pain_weight = config.cortisol_pain_weight ?? 0.4,
  config.cortisol_pred_error_weight = config.cortisol_pred_error_weight ?? 0.3,
  config.cortisol_convergence_weight = config.cortisol_convergence_weight ?? -0.3,
  config.cortisol_tension_weight = config.cortisol_tension_weight ?? 0.2,
  -- dopamine: reward prediction = reward + novelty - pain
  config.dopamine_reward_weight = config.dopamine_reward_weight ?? 0.5,
  config.dopamine_novelty_weight = config.dopamine_novelty_weight ?? 0.3,
  config.dopamine_pain_weight = config.dopamine_pain_weight ?? -0.2,
  -- norepinephrine: alertness = pred_error + novelty + tension
  config.norepinephrine_pred_error_weight = config.norepinephrine_pred_error_weight ?? 0.4,
  config.norepinephrine_novelty_weight = config.norepinephrine_novelty_weight ?? 0.3,
  config.norepinephrine_tension_weight = config.norepinephrine_tension_weight ?? 0.2,
  -- serotonin: satisfaction = convergence + stability - pain - pred_error
  config.serotonin_convergence_weight = config.serotonin_convergence_weight ?? 0.4,
  config.serotonin_stability_weight = config.serotonin_stability_weight ?? 0.3,
  config.serotonin_pain_weight = config.serotonin_pain_weight ?? -0.2,
  config.serotonin_pred_error_weight = config.serotonin_pred_error_weight ?? -0.2,
  -- Target normalization
  config.hormone_target_cap = config.hormone_target_cap ?? 1.0,
  config.affect_lr = config.affect_lr ?? 0.05,
  -- Accumulator signals for reactivated traces
  config.acc_stability_boost = config.acc_stability_boost ?? 0.15,
  config.acc_tension_on_valence_flip = config.acc_tension_on_valence_flip ?? 0.3,
  config.acc_reward_on_reactivation = config.acc_reward_on_reactivation ?? 0.05;

-- ═══════════════════════════════════════════
-- 2. fn::compute_hormone_targets — per-hormone target values
-- Returns target value for each hormone based on accumulator state
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::compute_hormone_targets() {
  LET $cfg = (SELECT * FROM kernel_state LIMIT 1)[0].config ?? {};
  LET $cap = $cfg.hormone_target_cap ?? 1.0;

  -- Read all accumulators
  LET $pred_err = (SELECT * FROM nn_node WHERE node_id = 'acc:pred_error' LIMIT 1)[0].value ?? 0;
  LET $pain = (SELECT * FROM nn_node WHERE node_id = 'acc:pain' LIMIT 1)[0].value ?? 0;
  LET $convergence = (SELECT * FROM nn_node WHERE node_id = 'acc:convergence' LIMIT 1)[0].value ?? 0;
  LET $reward = (SELECT * FROM nn_node WHERE node_id = 'acc:reward' LIMIT 1)[0].value ?? 0;
  LET $novelty = (SELECT * FROM nn_node WHERE node_id = 'acc:novelty' LIMIT 1)[0].value ?? 0;
  LET $tension = (SELECT * FROM nn_node WHERE node_id = 'acc:tension' LIMIT 1)[0].value ?? 0;
  LET $stability = (SELECT * FROM nn_node WHERE node_id = 'acc:stability' LIMIT 1)[0].value ?? 0;

  -- Per-hormone targets (sigmoid to 0..1 range)
  LET $cortisol_raw = $pain * ($cfg.cortisol_pain_weight ?? 0.4)
    + $pred_err * ($cfg.cortisol_pred_error_weight ?? 0.3)
    + $convergence * ($cfg.cortisol_convergence_weight ?? -0.3)
    + $tension * ($cfg.cortisol_tension_weight ?? 0.2);

  LET $dopamine_raw = $reward * ($cfg.dopamine_reward_weight ?? 0.5)
    + $novelty * ($cfg.dopamine_novelty_weight ?? 0.3)
    + $pain * ($cfg.dopamine_pain_weight ?? -0.2);

  LET $norepinephrine_raw = $pred_err * ($cfg.norepinephrine_pred_error_weight ?? 0.4)
    + $novelty * ($cfg.norepinephrine_novelty_weight ?? 0.3)
    + $tension * ($cfg.norepinephrine_tension_weight ?? 0.2);

  LET $serotonin_raw = $convergence * ($cfg.serotonin_convergence_weight ?? 0.4)
    + $stability * ($cfg.serotonin_stability_weight ?? 0.3)
    + $pain * ($cfg.serotonin_pain_weight ?? -0.2)
    + $pred_err * ($cfg.serotonin_pred_error_weight ?? -0.2);

  -- Sigmoid to [0,1]
  RETURN {
    cortisol: fn::sigmoid(math::clamp($cortisol_raw, 0.0 - $cap, $cap)),
    dopamine: fn::sigmoid(math::clamp($dopamine_raw, 0.0 - $cap, $cap)),
    norepinephrine: fn::sigmoid(math::clamp($norepinephrine_raw, 0.0 - $cap, $cap)),
    serotonin: fn::sigmoid(math::clamp($serotonin_raw, 0.0 - $cap, $cap))
  };
};

-- ═══════════════════════════════════════════
-- 3. fn::affect_backward_targeted — per-hormone error signals
-- Instead of single loss_sign, compute error per hormone node
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::affect_backward_targeted($lr: float) {
  LET $targets = fn::compute_hormone_targets();

  -- For each hormone, compute error = target - actual, then backprop through its edges
  LET $hormones = (SELECT id, node_id, value FROM nn_node WHERE model = 'affect' AND layer = 'hidden');

  FOR $h IN $hormones {
    LET $name = string::replace($h.node_id, 'hormone:', '');
    LET $target = IF $name = 'cortisol' THEN $targets.cortisol
      ELSE IF $name = 'dopamine' THEN $targets.dopamine
      ELSE IF $name = 'norepinephrine' THEN $targets.norepinephrine
      ELSE IF $name = 'serotonin' THEN $targets.serotonin
      ELSE 0.5 END;

    -- Error signal for this specific hormone
    LET $error = $target - $h.value;
    LET $deriv = $h.value * (1.0 - $h.value); -- sigmoid derivative

    -- Update edges TO this hormone node
    -- Use LET to isolate computations (SurrealDB ?? precedence issues)
    LET $in_edges = (SELECT id, weight, in.value AS iv, grad_acc, update_count FROM nn_edge
      WHERE out = $h.id AND in.model = 'affect' AND in.layer = 'input');
    FOR $e IN $in_edges {
      LET $iv = $e.iv ?? 0;
      LET $dw = $lr * $error * $deriv * $iv;
      UPDATE nn_edge SET
        weight = weight + $dw,
        grad_acc = ($e.grad_acc ?? 0) + math::abs($error * $iv),
        update_count = ($e.update_count ?? 0) + 1
      WHERE id = $e.id;
    };
  };

  RETURN true;
};

-- ═══════════════════════════════════════════
-- 4. fn::process_sensory — more accumulator signals for differentiation
-- Reactivation → stability + small reward; valence flip → tension
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
    -- Reactivation: brain has seen this before
    LET $old_charge = $existing.emotional_charge ?? 0;

    UPDATE trace SET
      weight = math::min([1.0, weight + ($cfg.reactivation_weight_boost ?? 0.1) + math::abs($valence) * ($cfg.reactivation_valence_scale ?? 0.2)]),
      freshness = 1.0,
      reactivation_count = reactivation_count + 1,
      last_reactivated_cycle = $cycle,
      position = $pos64,
      emotional_charge = emotional_charge * ($cfg.emotional_blend_old ?? 0.7) + $valence * ($cfg.emotional_blend_new ?? 0.3)
    WHERE trace_id = $existing.trace_id;

    -- Convergence: brain correctly predicted something familiar
    UPDATE nn_node SET value = math::min([$cap, value + ($cfg.acc_convergence_boost ?? 0.1)]) WHERE node_id = 'acc:convergence';

    -- Stability: familiar pattern = stable world
    UPDATE nn_node SET value = math::min([$cap, value + ($cfg.acc_stability_boost ?? 0.15)]) WHERE node_id = 'acc:stability';

    -- Small reward for successful prediction
    UPDATE nn_node SET value = math::min([$cap, value + ($cfg.acc_reward_on_reactivation ?? 0.05)]) WHERE node_id = 'acc:reward';

    -- Tension: valence changed sign (unexpected outcome for familiar trace)
    IF ($old_charge > 0 AND $valence < 0) OR ($old_charge < 0 AND $valence > 0) {
      UPDATE nn_node SET value = math::min([$cap, value + ($cfg.acc_tension_on_valence_flip ?? 0.3)]) WHERE node_id = 'acc:tension';
      UPDATE nn_node SET value = math::min([$cap, value + ($cfg.acc_pred_error_boost ?? 0.3)]) WHERE node_id = 'acc:pred_error';
    };

    -- Reward/pain from valence
    IF $valence > ($cfg.accumulator_valence_threshold ?? 0.1) {
      UPDATE nn_node SET value = math::min([$cap, value + $valence]) WHERE node_id = 'acc:reward';
    };
    IF $valence < (0.0 - ($cfg.accumulator_valence_threshold ?? 0.1)) {
      UPDATE nn_node SET value = math::min([$cap, value + math::abs($valence)]) WHERE node_id = 'acc:pain';
    };

    RETURN { trace_id: $existing.trace_id, is_new: false };
  };

  -- New trace
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

  -- New trace = novelty + prediction error
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
-- 5. fn::brain_tick — use targeted backward instead of scalar loss_sign
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

    -- HIGH: affect forward + TARGETED backward (per-hormone error)
    IF $x % $freq_high = 0 {
      LET $h_nodes = (SELECT id, bias FROM nn_node WHERE model = 'affect' AND layer = 'hidden');
      FOR $h IN $h_nodes {
        LET $ws = (SELECT math::sum(in.value * weight) AS s FROM nn_edge
          WHERE out = $h.id AND in.layer = 'input' GROUP ALL)[0].s ?? 0.0;
        UPDATE nn_node SET value = fn::sigmoid($ws + $h.bias) WHERE id = $h.id;
      };

      -- Targeted backward: each hormone gets its own error signal
      fn::affect_backward_targeted($cfg.affect_lr ?? 0.05);

      -- Decay accumulators
      UPDATE nn_node SET value = value * ($cfg.accumulator_decay ?? 0.99) WHERE model = 'affect' AND layer = 'input';
    };

    -- Trace decay (from config)
    IF $x % $freq_trace = 0 {
      UPDATE trace SET
        weight = weight * ($cfg.trace_weight_decay ?? 0.999),
        freshness = freshness * ($cfg.trace_freshness_decay ?? 0.999)
      WHERE archived = false AND weight > ($cfg.trace_decay_min_weight ?? 0.05);
    };

    -- AGENCY: brain decides to act
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
