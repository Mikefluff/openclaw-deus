-- Migration 063: Wire predictor + language production (phase 3)
-- 1. Restore predictor_step in process_one_input (was removed for crash fix)
-- 2. Language phase 3: brain generates speech from active concept clusters

-- ═══════════════════════════════════════════
-- 1. fn::process_one_input — restore predictor learning on consequences
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::process_one_input($inp: object) {
  LET $action = $inp.action_id ?? 0;

  IF $action < 0 {
    fn::process_speech($inp.speech ?? [], $inp.valence ?? 0);
    RETURN true;
  };

  fn::process_sensory($action, $inp.channels ?? [], $inp.speech ?? [],
    $inp.valence ?? 0, $inp.object_idx ?? 0);

  IF $inp.is_consequence = true {
    LET $tkey = type::string($action) + ':' + type::string($inp.object_idx ?? 0);
    LET $tr = (SELECT trace_id FROM trace_state WHERE content = $tkey AND archived = false LIMIT 1)[0];
    IF $tr IS NOT NONE AND $tr.trace_id IS NOT NONE {
      fn::cognitive_cycle($tr.trace_id, $action, $tkey, $inp.valence ?? 0);

      -- Predictor: learn from this sensory transition
      LET $channels = $inp.channels ?? [];
      IF array::len($channels) >= 13 {
        -- Use channels as both "before" and "after" (trace position was just updated)
        -- Predictor learns the mapping: channels × action → delta
        LET $trace_pos = (SELECT position FROM trace WHERE trace_id = $tr.trace_id LIMIT 1)[0].position ?? [];
        IF array::len($trace_pos) >= 13 {
          fn::predictor_step(array::slice($trace_pos, 0, 13), array::slice($channels, 0, 13), $action);
        };
      };
    };
  };

  RETURN true;
};

-- ═══════════════════════════════════════════
-- 2. LANGUAGE PHASE 3: Production
-- Brain generates speech output when a concept cluster is active
-- and communicative intent is present (dopamine high + social context)
-- ═══════════════════════════════════════════

-- speech_output table: what brain "says"
DEFINE TABLE OVERWRITE speech_output SCHEMALESS;

-- fn::attempt_speech — try to produce a word for the most active concept
-- Triggered by agency_tick when mode=explore and dopamine > threshold
DEFINE FUNCTION OVERWRITE fn::attempt_speech() {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $cycle = (SELECT cycle FROM kernel_state LIMIT 1)[0].cycle ?? 0;

  -- Communicative intent: dopamine high (reward-seeking) = wants to communicate
  LET $da = (SELECT * FROM nn_node WHERE node_id = 'hormone:dopamine' LIMIT 1)[0].value ?? 0;
  IF $da < ($cfg.speech_intent_threshold ?? 0.6) { RETURN { spoke: false, reason: 'low_intent' }; };

  -- Find most active non-lexical trace (the "concept" to name)
  LET $active = (SELECT trace_id, weight, freshness, content FROM trace_state
    WHERE archived = false AND suppressed = false
    AND string::starts_with(content, 'speech:') = false
    LIMIT 5);

  IF array::len($active) = 0 { RETURN { spoke: false, reason: 'no_active_concept' }; };

  -- Pick highest activation
  LET $best = $active[0];

  -- Inverse retrieval: find the strongest lexical binding for this concept
  LET $trace_rec = (SELECT id FROM trace WHERE trace_id = $best.trace_id AND archived = false LIMIT 1)[0];
  IF $trace_rec IS NONE { RETURN { spoke: false, reason: 'trace_not_found' }; };

  LET $word = fn::get_word_for_concept($trace_rec.id);
  IF $word IS NONE { RETURN { spoke: false, reason: 'no_word_known', concept: $best.content }; };

  -- Produce speech!
  CREATE speech_output CONTENT {
    cycle: $cycle,
    concept_trace: $best.trace_id,
    concept_content: $best.content,
    speech_content: $word.speech_content ?? '',
    confidence: $word.weight ?? 0,
    co_occurrences: $word.co_occurrences ?? 0
  };

  -- Dopamine reward for successful communication
  fn::hormone_spike('dopamine', $cfg.speech_reward ?? 0.15);

  -- Strengthen the lexical binding that was used
  UPDATE lexical_binding SET
    weight = math::min([1.0, weight + ($cfg.lang_production_lr ?? 0.05)])
  WHERE in = $word.speech_trace AND out = $trace_rec.id;

  RETURN {
    spoke: true,
    concept: $best.content,
    word: $word.speech_content,
    confidence: $word.weight
  };
};

-- fn::language_report — comprehensive language acquisition status
DEFINE FUNCTION OVERWRITE fn::language_report() {
  LET $lexical = (SELECT count() AS c FROM trace WHERE source_type = 'lexical' AND archived = false GROUP ALL)[0].c ?? 0;
  LET $bindings = (SELECT count() AS c FROM lexical_binding WHERE weight > 0.1 GROUP ALL)[0].c ?? 0;
  LET $grounded = (SELECT count() AS c FROM lexical_binding WHERE weight > 0.5 AND co_occurrence_count > 5 GROUP ALL)[0].c ?? 0;
  LET $produced = (SELECT count() AS c FROM speech_output GROUP ALL)[0].c ?? 0;

  LET $top = (SELECT
    in.content AS word, out.content AS concept,
    weight, co_occurrence_count
    FROM lexical_binding
    WHERE weight > 0.1
    LIMIT 10);

  LET $recent_speech = (SELECT concept_content, speech_content, confidence FROM speech_output
    LIMIT 5);

  RETURN {
    lexical_traces: $lexical,
    total_bindings: $bindings,
    grounded_symbols: $grounded,
    words_produced: $produced,
    top_bindings: $top,
    recent_speech: $recent_speech
  };
};

-- ═══════════════════════════════════════════
-- 3. Integrate speech production into agency_tick
-- Brain occasionally tries to speak instead of acting physically
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

  -- Sometimes try to speak instead of physical action (10% chance when DA high)
  IF rand::float() < ($cfg.speech_attempt_prob ?? 0.1) AND $dopamine > 0.6 {
    LET $speech = fn::attempt_speech();
    IF ($speech.spoke ?? false) = true {
      UPDATE kernel_state SET energy = math::max([0.0, energy - ($cfg.speech_energy_cost ?? 0.02)]);
      RETURN { acted: true, type: 'speech', word: $speech.word, concept: $speech.concept };
    };
  };

  -- Physical action
  LET $num_actions = $cfg.num_actions ?? 6;
  LET $action_id = math::floor(rand::float() * $num_actions);
  LET $target_content = '';
  LET $pred_val = 0.0;

  LET $explore_prob = math::clamp(
    $dopamine * ($cfg.explore_dopamine_coeff ?? 0.4) - $cortisol * ($cfg.explore_cortisol_coeff ?? 0.2),
    $cfg.explore_min ?? 0.1, $cfg.explore_max ?? 0.9);
  IF $mode_name = 'explore' { LET $explore_prob = math::min([0.95, $explore_prob + ($cfg.mode_explore_boost ?? 0.2)]); };
  IF $mode_name = 'exploit' { LET $explore_prob = math::max([0.05, $explore_prob - ($cfg.mode_exploit_reduction ?? 0.3)]); };

  IF rand::float() > $explore_prob {
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
    payload: { action_id: $action_id, target_content: $target_content, predicted_valence: $pred_val, mode: $mode_name, dopamine: $dopamine },
    status: 'pending', created_at: time::now()
  };

  UPDATE kernel_state SET energy = math::max([0.0, energy - ($cfg.action_energy_cost ?? 0.05)]);
  RETURN { acted: true, type: 'physical', action_id: $action_id, mode: $mode_name };
};

-- Config for speech production
UPDATE kernel_state SET
  config.speech_intent_threshold = config.speech_intent_threshold ?? 0.6,
  config.speech_reward = config.speech_reward ?? 0.15,
  config.speech_energy_cost = config.speech_energy_cost ?? 0.02,
  config.speech_attempt_prob = config.speech_attempt_prob ?? 0.1,
  config.lang_production_lr = config.lang_production_lr ?? 0.05;
