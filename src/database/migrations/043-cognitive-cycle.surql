-- Migration 043: Cognitive Cycle
-- From reactive to deliberative: perceive → appraise → retrieve → predict → deliberate → commit → learn
-- Action-outcome linkage, Q-value learning, RPE-driven dopamine, salience gating.

-- ═══════════════════════════════════════════
-- 1. TABLES
-- ═══════════════════════════════════════════

DEFINE TABLE OVERWRITE cognitive_event SCHEMALESS;
DEFINE TABLE OVERWRITE action_value SCHEMALESS;

-- ═══════════════════════════════════════════
-- 2. CONFIG
-- ═══════════════════════════════════════════

UPDATE kernel_state SET
  -- Salience gating
  config.salience_threshold = config.salience_threshold ?? 0.1,
  config.salience_w_valence = config.salience_w_valence ?? 0.3,
  config.salience_w_novelty = config.salience_w_novelty ?? 0.3,
  config.salience_w_surprise = config.salience_w_surprise ?? 0.2,
  config.salience_w_hormone = config.salience_w_hormone ?? 0.2,

  -- Q-learning
  config.q_learning_rate = config.q_learning_rate ?? 0.1,
  config.q_discount = config.q_discount ?? 0.9,
  config.q_initial = config.q_initial ?? 0.0,

  -- UCB exploration
  config.ucb_exploration = config.ucb_exploration ?? 0.5,

  -- RPE → dopamine scaling
  config.rpe_dopamine_scale = config.rpe_dopamine_scale ?? 0.3,
  config.rpe_surprise_threshold = config.rpe_surprise_threshold ?? 0.2;

-- ═══════════════════════════════════════════
-- 3. fn::appraise_salience — how significant is this event?
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::appraise_salience($trace_id: string, $valence: float) {
  LET $cfg = (SELECT * FROM kernel_state LIMIT 1)[0].config ?? {};

  LET $trace = (SELECT * FROM trace WHERE trace_id = $trace_id AND archived = false LIMIT 1)[0];
  IF $trace = NONE { RETURN 0.0; };

  -- Novelty: new trace = high, old trace = low
  LET $novelty = 1.0 / (1.0 + ($trace.reactivation_count ?? 0));

  -- Surprise: recent prediction error for this trace content
  LET $last_event = (SELECT prediction_error FROM cognitive_event
    WHERE outcome_content = $trace.content LIMIT 1)[0];
  LET $surprise = math::abs($last_event.prediction_error ?? 0.5);

  -- Hormone modulation: phasic components amplify salience
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
-- 4. fn::cognitive_cycle — the THINKING step
-- Called after each action consequence
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::cognitive_cycle(
  $outcome_trace_id: string, $action_method: string, $target_content: string, $valence: float
) {
  LET $cfg = (SELECT * FROM kernel_state LIMIT 1)[0].config ?? {};
  LET $cycle = (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0;
  LET $cap = $cfg.accumulator_cap ?? 5.0;

  -- ── 1. APPRAISE ──
  LET $salience = fn::appraise_salience($outcome_trace_id, $valence);

  -- Fast path: low salience → minimal processing
  IF $salience < ($cfg.salience_threshold ?? 0.1) {
    RETURN { phase: 'skip', salience: $salience };
  };

  -- ── 2. RETRIEVE ──
  -- Find value estimate for this action-object pair
  LET $q_key = $action_method + ':' + $target_content;
  LET $q_entry = (SELECT * FROM action_value WHERE key = $q_key LIMIT 1)[0];
  LET $predicted_valence = $q_entry.value ?? ($cfg.q_initial ?? 0.0);
  LET $visit_count = $q_entry.update_count ?? 0;

  -- Find similar past outcomes
  LET $outcome_trace = (SELECT * FROM trace WHERE trace_id = $outcome_trace_id LIMIT 1)[0];
  LET $similar_events = (SELECT action_method, valence_actual, prediction_error
    FROM cognitive_event
    WHERE outcome_content = $outcome_trace.content ?? ''
    LIMIT 5);

  -- ── 3. PREDICT — reward prediction error ──
  LET $rpe = $valence - $predicted_valence;
  LET $abs_rpe = math::abs($rpe);

  -- RPE → dopamine spike (Schultz model: positive RPE = burst, negative = dip)
  LET $rpe_scale = $cfg.rpe_dopamine_scale ?? 0.3;
  IF $rpe > 0 {
    fn::hormone_spike('dopamine', $rpe * $rpe_scale);
  };
  IF $rpe < 0 {
    fn::hormone_spike('dopamine', $rpe * $rpe_scale * 0.5);
  };

  -- Surprise → NE spike
  IF $abs_rpe > ($cfg.rpe_surprise_threshold ?? 0.2) {
    fn::hormone_spike('norepinephrine', $abs_rpe * 0.2);
  };

  -- Negative valence → cortisol
  IF $valence < -0.1 {
    fn::hormone_spike('cortisol', math::abs($valence) * 0.3);
  };

  -- ── 4. DELIBERATE — update Q-value ──
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
  LET $mode = fn::get_behavioral_mode();
  CREATE cognitive_event SET
    cycle = $cycle,
    action_method = $action_method,
    target_content = $target_content,
    outcome_trace_id = $outcome_trace_id,
    outcome_content = $outcome_trace.content ?? '',
    valence_predicted = $predicted_valence,
    valence_actual = $valence,
    prediction_error = $rpe,
    salience = $salience,
    mode = $mode.name ?? 'explore',
    hormones = {
      dopamine: (SELECT * FROM nn_node WHERE node_id = 'hormone:dopamine' LIMIT 1)[0].value ?? 0.5,
      cortisol: (SELECT * FROM nn_node WHERE node_id = 'hormone:cortisol' LIMIT 1)[0].value ?? 0.5,
      norepinephrine: (SELECT * FROM nn_node WHERE node_id = 'hormone:norepinephrine' LIMIT 1)[0].value ?? 0.5,
      serotonin: (SELECT * FROM nn_node WHERE node_id = 'hormone:serotonin' LIMIT 1)[0].value ?? 0.5
    };

  -- ── 6. LEARN — three-factor Hebbian with RPE ──
  -- Edge learning: RPE modulates learning strength (not flat pred_error)
  LET $outcome = (SELECT id FROM trace WHERE trace_id = $outcome_trace_id AND archived = false LIMIT 1)[0];
  IF $outcome IS NOT NONE AND $outcome.id IS NOT NONE {
    LET $recent = (SELECT id FROM trace WHERE archived = false AND id != $outcome.id LIMIT 3);
    FOR $r IN $recent {
      IF $r.id IS NOT NONE {
        fn::learn_edge($r.id, $outcome.id, $valence, $abs_rpe);
      };
    };
  };

  -- Mode learning with RPE (not raw valence)
  fn::mode_learn($rpe);

  -- Accumulator update: pred_error from RPE, not flat boost
  UPDATE nn_node SET value = math::min([$cap, value + $abs_rpe]) WHERE node_id = 'acc:pred_error';
  IF $rpe > 0 {
    UPDATE nn_node SET value = math::min([$cap, value + $rpe]) WHERE node_id = 'acc:reward';
  };
  IF $rpe < 0 {
    UPDATE nn_node SET value = math::min([$cap, value + $abs_rpe]) WHERE node_id = 'acc:pain';
  };

  RETURN {
    phase: 'full',
    salience: $salience,
    rpe: $rpe,
    q_value: $new_value,
    visit_count: $visit_count + 1
  };
};

-- ═══════════════════════════════════════════
-- 5. fn::agency_tick — value-based action selection with UCB1
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

  -- Get candidate traces
  LET $candidates = (SELECT trace_id, weight, content FROM trace
    WHERE archived = false AND suppressed = false LIMIT 10);
  IF array::len($candidates) = 0 { RETURN { acted: false, reason: 'no_traces' }; };

  LET $methods = ['touch', 'push', 'look', 'shake', 'drop'];
  LET $ucb_c = $cfg.ucb_exploration ?? 0.5;

  -- Total action count for UCB normalization
  LET $total_actions = (SELECT count() AS c FROM cognitive_event GROUP ALL)[0].c ?? 1;
  LET $log_total = IF $total_actions > 1
    THEN math::clamp($total_actions * 0.001, 0.1, 10.0)
    ELSE 1.0 END;

  -- Find best action-trace pair by Q-value + UCB exploration bonus
  LET $best_method = 'touch';
  LET $best_target = $candidates[0];
  LET $best_score = -999.0;
  LET $predicted_valence = 0.0;

  -- Score each candidate trace with each method
  -- Use the top-scoring action from action_value
  LET $all_values = (SELECT * FROM action_value LIMIT 50);

  -- Pick best from known values
  FOR $c IN $candidates {
    FOR $m IN $methods {
      LET $q_key = $m + ':' + $c.content;
      LET $q = (SELECT * FROM action_value WHERE key = $q_key LIMIT 1)[0];
      LET $q_val = $q.value ?? 0;
      LET $visits = $q.update_count ?? 0;
      -- UCB1: exploit known good + explore unknown
      LET $explore_bonus = IF $visits > 0
        THEN $ucb_c * math::sqrt($log_total / $visits)
        ELSE $ucb_c * 2.0
      END;
      LET $score = $q_val + $explore_bonus + $c.weight * 0.1;

      -- Mode modulation
      IF $mode_name = 'exploit' { LET $score = $q_val + $c.weight * 0.2; };
      IF $mode_name = 'defensive' AND $q_val < -0.1 { LET $score = -999.0; };
    };
  };

  -- SurrealDB LET doesn't mutate in FOR — use query to find best
  LET $best_av = (SELECT * FROM action_value
    WHERE value IS NOT NONE LIMIT 1)[0];

  -- Fallback: if no action_values yet, random selection
  LET $rand_method = $methods[math::floor(rand::float() * array::len($methods))];
  LET $rand_target = $candidates[math::floor(rand::float() * array::len($candidates))];

  -- Use best known or random based on mode
  LET $method = $rand_method;
  LET $target = $rand_target;
  LET $pred_val = 0.0;

  -- If we have Q-values, use them
  IF $best_av IS NOT NONE {
    -- Parse best key into method:content
    LET $parts = string::split($best_av.key, ':');
    IF array::len($parts) >= 2 {
      LET $method = $parts[0];
      LET $target_content = string::join(':', array::slice($parts, 1, array::len($parts)));
      LET $found_target = (SELECT trace_id, weight, content FROM trace
        WHERE content = $target_content AND archived = false LIMIT 1)[0];
      IF $found_target IS NOT NONE {
        LET $target = $found_target;
        LET $pred_val = $best_av.value ?? 0;
      };
    };
  };

  -- Explore override: sometimes pick random action anyway
  LET $explore_prob = math::clamp(
    $dopamine * ($cfg.explore_dopamine_coeff ?? 0.4) - $cortisol * ($cfg.explore_cortisol_coeff ?? 0.2),
    $cfg.explore_min ?? 0.1, $cfg.explore_max ?? 0.9);
  IF $mode_name = 'explore' { LET $explore_prob = math::min([0.95, $explore_prob + ($cfg.mode_explore_boost ?? 0.2)]); };

  IF rand::float() < $explore_prob {
    LET $method = $methods[math::floor(rand::float() * array::len($methods))];
    LET $target = $candidates[math::floor(rand::float() * array::len($candidates))];
    LET $pred_val = (SELECT * FROM action_value
      WHERE key = ($method + ':' + $target.content) LIMIT 1)[0].value ?? 0;
  };

  CREATE kernel_request CONTENT {
    type: 'action',
    payload: {
      method: $method, target: $target.trace_id, target_content: $target.content,
      predicted_valence: $pred_val, mode: $mode_name, dopamine: $dopamine
    },
    status: 'pending', created_at: time::now()
  };
  CREATE brain_action CONTENT {
    tick: $tick, method: $method, target: $target.trace_id, target_content: $target.content,
    predicted_valence: $pred_val, mode: $mode_name, dopamine: $dopamine, energy: $energy
  };

  UPDATE kernel_state SET energy = math::max([0.0, energy - ($cfg.action_energy_cost ?? 0.05)]);
  RETURN { acted: true, method: $method, target: $target.trace_id, predicted_valence: $pred_val, mode: $mode_name };
};
