-- Migration 057: Purge string action names from brain
-- Brain sees ONLY numbers. action = action_id (int).
-- String names ('touch','push') are world/membrane concepts.
-- Q-key = "action_id:object_idx" (pure numbers).
-- Membrane translates action_id ↔ world action.

-- Config: number of available actions (brain doesn't know WHAT they are)
UPDATE kernel_state SET
  config.num_actions = config.num_actions ?? 6;

-- ═══════════════════════════════════════════
-- 1. fn::agency_tick — pure numeric actions
-- Brain picks action_id (0..num_actions-1), not method name.
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

  LET $num_actions = $cfg.num_actions ?? 6;

  -- Default: random action_id
  LET $action_id = math::floor(rand::float() * $num_actions);
  LET $target_content = '';
  LET $pred_val = 0.0;

  -- Explore/exploit probability
  LET $explore_prob = math::clamp(
    $dopamine * ($cfg.explore_dopamine_coeff ?? 0.4) - $cortisol * ($cfg.explore_cortisol_coeff ?? 0.2),
    $cfg.explore_min ?? 0.1, $cfg.explore_max ?? 0.9);
  IF $mode_name = 'explore' { LET $explore_prob = math::min([0.95, $explore_prob + ($cfg.mode_explore_boost ?? 0.2)]); };
  IF $mode_name = 'exploit' { LET $explore_prob = math::max([0.05, $explore_prob - ($cfg.mode_exploit_reduction ?? 0.3)]); };

  IF rand::float() > $explore_prob {
    -- EXPLOIT: best Q-value (UCB1)
    LET $total_actions = (SELECT math::sum(update_count) AS s FROM action_value GROUP ALL)[0].s ?? 1;
    LET $best_q = (SELECT key, value, update_count,
      value + ($cfg.ucb_exploration ?? 0.5) * math::sqrt(math::ln($total_actions) / math::max([1, update_count])) AS ucb
      FROM action_value WHERE update_count > 0
      ORDER BY ucb DESC LIMIT 1)[0];

    IF $best_q IS NOT NONE {
      LET $parts = string::split($best_q.key ?? '', ':');
      IF array::len($parts) >= 2 {
        LET $action_id = type::int($parts[0] ?? '0');
        LET $target_content = string::join(':', array::slice($parts, 1, array::len($parts)));
        LET $pred_val = $best_q.value ?? 0;
      };
    };
  };

  CREATE kernel_request CONTENT {
    type: 'action',
    payload: {
      action_id: $action_id,
      target_content: $target_content,
      predicted_valence: $pred_val,
      mode: $mode_name,
      dopamine: $dopamine
    },
    status: 'pending', created_at: time::now()
  };

  UPDATE kernel_state SET energy = math::max([0.0, energy - ($cfg.action_energy_cost ?? 0.05)]);
  RETURN { acted: true, action_id: $action_id, mode: $mode_name, predicted_valence: $pred_val };
};

-- ═══════════════════════════════════════════
-- 2. fn::cognitive_cycle — pure numeric action_id
-- Q-key = "action_id:object_idx"
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::cognitive_cycle(
  $outcome_trace_id: string, $action_id: int, $target_content: string, $valence: float
) {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $cycle = (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0;
  LET $cap = $cfg.accumulator_cap ?? 5.0;

  -- 1. APPRAISE
  LET $salience = fn::appraise_salience($outcome_trace_id, $valence);
  IF $salience < ($cfg.salience_threshold ?? 0.1) {
    RETURN { phase: 'skip', salience: $salience };
  };

  -- 2. RETRIEVE — Q-key is pure numbers
  LET $q_key = type::string($action_id) + ':' + $target_content;
  LET $q_entry = (SELECT * FROM action_value WHERE key = $q_key LIMIT 1)[0];
  LET $predicted_valence = $q_entry.value ?? ($cfg.q_initial ?? 0.0);
  LET $visit_count = $q_entry.update_count ?? 0;

  -- 3. PREDICT — valence RPE + sensorimotor prediction error
  LET $rpe = $valence - $predicted_valence;
  LET $abs_rpe = math::abs($rpe);

  -- Sensorimotor prediction: forward predict delta for THIS action
  LET $outcome_pos = (SELECT position FROM trace WHERE trace_id = $outcome_trace_id LIMIT 1)[0].position ?? [];
  LET $channels_now = array::slice($outcome_pos, 0, 13);
  LET $outcome_ref = (SELECT id FROM trace WHERE trace_id = $outcome_trace_id LIMIT 1)[0].id;

  LET $predictor_mse = 0.0;
  IF $outcome_ref IS NOT NONE AND array::len($channels_now) >= 13 {
    LET $prev_history = (SELECT * FROM trace_history WHERE trace = $outcome_ref LIMIT 1)[0];
    IF $prev_history IS NOT NONE {
      LET $prev_pos = (SELECT position FROM trace WHERE id = $outcome_ref LIMIT 1)[0].position ?? [];
      LET $prev_channels = array::slice($prev_pos, 0, 13);
      IF array::len($prev_channels) >= 13 {
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
  };

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
      last_rpe = $rpe, last_predictor_mse = $predictor_mse, last_cycle = $cycle
    WHERE key = $q_key;
  } ELSE {
    CREATE action_value SET
      key = $q_key, action_id = $action_id, trace_content = $target_content,
      value = $new_value, confidence = 0.1, update_count = 1,
      last_rpe = $rpe, last_predictor_mse = $predictor_mse, last_cycle = $cycle;
  };

  -- 5. COMMIT
  CREATE cognitive_event SET
    cycle = $cycle, action_id = $action_id, target_content = $target_content,
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
-- 3. fn::brain_tick_auto — pass action_id (int) to cognitive_cycle
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::brain_tick_auto() {
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  IF $state = NONE OR ($state.running ?? false) = false { RETURN { ticked: false }; };

  LET $cursor = $state.sensory_seq ?? 0;
  LET $inputs = (SELECT * FROM sensory_input WHERE seq > $cursor LIMIT 10);

  IF array::len($inputs) > 0 {
    FOR $inp IN $inputs {
      fn::process_sensory(
        $inp.action_id ?? 0, $inp.channels ?? [], $inp.speech ?? [],
        $inp.valence ?? 0, $inp.object_idx ?? 0
      );
      IF $inp.is_consequence = true {
        LET $tkey = type::string($inp.action_id ?? 0) + ':' + type::string($inp.object_idx ?? 0);
        LET $tr = (SELECT trace_id FROM trace_state WHERE content = $tkey AND archived = false LIMIT 1)[0];
        IF $tr IS NOT NONE AND $tr.trace_id IS NOT NONE {
          fn::cognitive_cycle($tr.trace_id, $inp.action_id ?? 0,
            $tkey, $inp.valence ?? 0);
        };
      };
    };
    LET $seqs = $inputs.map(|$i| $i.seq ?? 0);
    LET $max_seq = math::max($seqs) ?? $cursor;
    UPDATE kernel_state SET sensory_seq = $max_seq;
  };

  fn::brain_tick(100);

  UPDATE kernel_request SET status = 'done'
    WHERE status = 'pending' AND created_at < time::now() - 500ms;

  UPDATE _tick SET cycle = (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0;

  RETURN { ticked: true };
};
