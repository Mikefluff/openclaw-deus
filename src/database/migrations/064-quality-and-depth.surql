-- Migration 064: Quality + Depth
-- A. Fix accumulator balance + hormone dynamics
-- B. Language phases 4-5 (composition + grammar)
-- C. Self-model (introspective traces)
-- D. Causal reasoning (action→outcome chains)

-- ═══════════════════════════════════════════
-- CONFIG
-- ═══════════════════════════════════════════

UPDATE kernel_state SET
  -- Accumulator balance
  config.accumulator_cap = 3.0,
  config.accumulator_floor = 0.01,
  -- Lateral inhibition (stronger)
  config.lang_lateral_inhibition = 0.9,
  -- Self-model
  config.introspection_freq = config.introspection_freq ?? 5000,
  config.self_trace_weight = config.self_trace_weight ?? 0.4,
  -- Causal reasoning
  config.causal_min_occurrences = config.causal_min_occurrences ?? 3,
  config.causal_confidence_threshold = config.causal_confidence_threshold ?? 0.3;

-- ═══════════════════════════════════════════
-- A. HORMONE DYNAMICS FIX
-- Problem: cortisol/serotonin stuck at 0.5 because affect_forward
-- computes sigmoid(weighted_sum) but weights are too small to move hormones.
-- Fix: add baseline drive — cortisol responds to pain, serotonin to stability.
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::hormone_drive() {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};

  -- Read accumulators
  LET $pain = (SELECT `value` AS val FROM nn_node WHERE node_id = 'acc:pain' LIMIT 1)[0].val ?? 0;
  LET $reward = (SELECT `value` AS val FROM nn_node WHERE node_id = 'acc:reward' LIMIT 1)[0].val ?? 0;
  LET $stability = (SELECT `value` AS val FROM nn_node WHERE node_id = 'acc:stability' LIMIT 1)[0].val ?? 0;
  LET $tension = (SELECT `value` AS val FROM nn_node WHERE node_id = 'acc:tension' LIMIT 1)[0].val ?? 0;
  LET $novelty = (SELECT `value` AS val FROM nn_node WHERE node_id = 'acc:novelty' LIMIT 1)[0].val ?? 0;

  -- Direct hormone drives (bypass nn_edge weights when accumulators strong)
  -- Cortisol: driven by pain + tension
  IF $pain > 0.5 OR $tension > 0.5 {
    LET $cortisol_drive = ($pain + $tension) * 0.05;
    UPDATE nn_node SET `value` = math::min([0.95, value + $cortisol_drive])
      WHERE node_id = 'hormone:cortisol';
  };

  -- Serotonin: driven by stability + reward (contentment)
  IF $stability > 0.5 AND $pain < 0.3 {
    LET $sero_drive = $stability * 0.03;
    UPDATE nn_node SET `value` = math::min([0.95, value + $sero_drive])
      WHERE node_id = 'hormone:serotonin';
  };

  -- Norepinephrine: driven by novelty + tension (alertness)
  IF $novelty > 0.3 OR $tension > 0.5 {
    LET $ne_drive = ($novelty + $tension) * 0.04;
    UPDATE nn_node SET `value` = math::min([0.95, value + $ne_drive])
      WHERE node_id = 'hormone:norepinephrine';
  };

  RETURN true;
};

-- ═══════════════════════════════════════════
-- B. LANGUAGE PHASE 4: Composition
-- Two active lexical traces → compound expression
-- "красный" + "мячик" = two bindings fire together → composite output
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::attempt_speech() {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $cycle = (SELECT cycle FROM kernel_state LIMIT 1)[0].cycle ?? 0;

  LET $da = (SELECT * FROM nn_node WHERE node_id = 'hormone:dopamine' LIMIT 1)[0].value ?? 0;
  IF $da < ($cfg.speech_intent_threshold ?? 0.6) { RETURN { spoke: false, reason: 'low_intent' }; };

  -- Find top 3 active non-lexical traces
  LET $active = (SELECT trace_id, weight, freshness, content FROM trace_state
    WHERE archived = false AND suppressed = false
    AND string::starts_with(content, 'speech:') = false
    LIMIT 3);

  IF array::len($active) = 0 { RETURN { spoke: false, reason: 'no_active_concept' }; };

  -- Try to name each active concept → build multi-word utterance
  LET $words = [];
  FOR $concept IN $active {
    LET $trace_rec = (SELECT id FROM trace WHERE trace_id = $concept.trace_id AND archived = false LIMIT 1)[0];
    IF $trace_rec IS NOT NONE {
      LET $word = fn::get_word_for_concept($trace_rec.id);
      IF $word IS NOT NONE {
        LET $words = array::push($words, {
          concept: $concept.content,
          word: $word.speech_content ?? '',
          confidence: $word.weight ?? 0,
          speech_trace: $word.speech_trace
        });

        -- Strengthen binding (production reinforcement)
        UPDATE lexical_binding SET
          weight = math::min([1.0, weight + ($cfg.lang_production_lr ?? 0.05)])
        WHERE in = $word.speech_trace AND out = $trace_rec.id;
      };
    };
  };

  IF array::len($words) = 0 { RETURN { spoke: false, reason: 'no_words_known' }; };

  -- Log utterance (single word or composition)
  CREATE speech_output CONTENT {
    cycle: $cycle,
    words: $words,
    word_count: array::len($words),
    is_composition: array::len($words) > 1
  };

  fn::hormone_spike('dopamine', $cfg.speech_reward ?? 0.15);

  RETURN {
    spoke: true,
    words: $words,
    is_composition: array::len($words) > 1
  };
};

-- ═══════════════════════════════════════════
-- B. LANGUAGE PHASE 5: Grammar Emergence
-- Track ordering regularities in speech input sequences.
-- When mama says "красный мячик", brain learns that word A precedes word B.
-- Stored as speech_bigram table.
-- ═══════════════════════════════════════════

DEFINE TABLE OVERWRITE speech_bigram SCHEMALESS;
DEFINE INDEX IF NOT EXISTS idx_bigram ON speech_bigram FIELDS word_a, word_b;

-- fn::track_speech_order — called when processing consecutive speech events
-- Records which speech patterns co-occur in sequence
DEFINE FUNCTION OVERWRITE fn::track_speech_order($prev_speech_key: string, $curr_speech_key: string) {
  IF $prev_speech_key = '' OR $curr_speech_key = '' { RETURN false; };
  IF $prev_speech_key = $curr_speech_key { RETURN false; };

  LET $existing = (SELECT id, count FROM speech_bigram
    WHERE word_a = $prev_speech_key AND word_b = $curr_speech_key LIMIT 1)[0];

  IF $existing IS NOT NONE {
    UPDATE speech_bigram SET count = ($existing.count ?? 0) + 1 WHERE id = $existing.id;
  } ELSE {
    CREATE speech_bigram CONTENT {
      word_a: $prev_speech_key,
      word_b: $curr_speech_key,
      count: 1,
      first_cycle: (SELECT cycle FROM kernel_state LIMIT 1)[0].cycle ?? 0
    };
  };

  RETURN true;
};

-- ═══════════════════════════════════════════
-- C. SELF-MODEL: Introspective Traces
-- Brain creates traces about its own state.
-- source_type = 'introspective', content = "state:energy_low"
-- These bind to lexical traces just like sensorimotor traces.
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::create_self_trace($state_key: string, $valence: float) {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $cycle = (SELECT cycle FROM kernel_state LIMIT 1)[0].cycle ?? 0;
  LET $content = 'self:' + $state_key;

  LET $existing = (SELECT * FROM trace_state WHERE content = $content AND archived = false LIMIT 1)[0];

  IF $existing IS NOT NONE {
    UPDATE trace_state SET
      weight = math::min([1.0, weight + ($cfg.self_trace_weight ?? 0.4)]),
      freshness = 1.0,
      reactivation_count = reactivation_count + 1,
      emotional_charge = emotional_charge * 0.7 + $valence * 0.3,
      cycle = $cycle
    WHERE id = $existing.id;
    RETURN $existing.trace_id;
  };

  LET $trace_id = 'S' + rand::string(8);
  -- Position: encode state as sensory vector (energy/fatigue/hormones in first 13 dims)
  LET $energy = (SELECT energy FROM kernel_state LIMIT 1)[0].energy ?? 0.5;
  LET $fatigue = (SELECT fatigue FROM kernel_state LIMIT 1)[0].fatigue ?? 0;
  LET $da = (SELECT * FROM nn_node WHERE node_id = 'hormone:dopamine' LIMIT 1)[0].value ?? 0.5;
  LET $co = (SELECT * FROM nn_node WHERE node_id = 'hormone:cortisol' LIMIT 1)[0].value ?? 0.5;
  LET $ne = (SELECT * FROM nn_node WHERE node_id = 'hormone:norepinephrine' LIMIT 1)[0].value ?? 0.5;
  LET $se = (SELECT * FROM nn_node WHERE node_id = 'hormone:serotonin' LIMIT 1)[0].value ?? 0.5;

  LET $pos = [$energy, $fatigue, $da, $co, $ne, $se, $valence, 0f, 0f, 0f, 0f, 0f, 0f,
    0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f];

  CREATE trace CONTENT {
    trace_id: $trace_id, source_type: 'introspective', source_id: $state_key,
    content: $content,
    weight: $cfg.self_trace_weight ?? 0.4,
    initial_weight: $cfg.self_trace_weight ?? 0.4,
    freshness: 1.0, confidence: 0.5, emotional_charge: $valence,
    reactivation_count: 0, reactivation_history: [],
    created_at_cycle: $cycle, last_reactivated_cycle: $cycle,
    position: $pos,
    velocity: [0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f],
    suppressed: false, archived: false
  };

  LET $trace_rec = (SELECT id FROM trace WHERE trace_id = $trace_id LIMIT 1)[0];
  CREATE trace_state SET
    trace = $trace_rec.id, trace_id = $trace_id, content = $content,
    weight = $cfg.self_trace_weight ?? 0.4, freshness = 1.0,
    emotional_charge = $valence, reactivation_count = 0,
    archived = false, suppressed = false, cycle = $cycle;

  RETURN $trace_id;
};

-- fn::introspect_self — create self-traces based on current state
DEFINE FUNCTION OVERWRITE fn::introspect_self() {
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  LET $energy = $state.energy ?? 0.5;
  LET $fatigue = $state.fatigue ?? 0;
  LET $da = (SELECT * FROM nn_node WHERE node_id = 'hormone:dopamine' LIMIT 1)[0].value ?? 0.5;
  LET $co = (SELECT * FROM nn_node WHERE node_id = 'hormone:cortisol' LIMIT 1)[0].value ?? 0.5;

  -- Create state-dependent self-traces
  IF $energy < 0.2 { fn::create_self_trace('tired', -0.3); };
  IF $energy > 0.8 { fn::create_self_trace('energetic', 0.2); };
  IF $da > 0.8 { fn::create_self_trace('excited', 0.4); };
  IF $co > 0.7 { fn::create_self_trace('stressed', -0.4); };
  IF $fatigue > 0.5 { fn::create_self_trace('fatigued', -0.2); };

  -- Mode awareness
  LET $mode = fn::get_behavioral_mode();
  fn::create_self_trace('mode_' + ($mode.name ?? 'explore'), 0.0);

  RETURN true;
};

-- ═══════════════════════════════════════════
-- D. CAUSAL REASONING
-- Learn action→outcome patterns from cognitive_event history.
-- "When I push object 0, it rolls" = causal_link from action to outcome pattern.
-- ═══════════════════════════════════════════

DEFINE TABLE OVERWRITE causal_link SCHEMALESS;
DEFINE INDEX IF NOT EXISTS idx_causal_action ON causal_link FIELDS action_id, object_pattern;

-- fn::extract_causal_patterns — mine cognitive_event for regularities
DEFINE FUNCTION OVERWRITE fn::extract_causal_patterns() {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $min_occ = $cfg.causal_min_occurrences ?? 3;
  LET $cycle = (SELECT cycle FROM kernel_state LIMIT 1)[0].cycle ?? 0;

  -- Group cognitive events by action_id + target to find patterns
  LET $patterns = (SELECT
    action_id, target_content,
    count() AS occurrences,
    math::mean(valence_actual) AS mean_valence,
    math::mean(prediction_error) AS mean_rpe,
    math::mean(math::abs(prediction_error)) AS mean_abs_rpe
  FROM cognitive_event
  GROUP BY action_id, target_content);

  LET $created = 0;

  FOR $p IN $patterns {
    IF ($p.occurrences ?? 0) >= $min_occ {
      -- Check if causal link exists
      LET $existing = (SELECT id FROM causal_link
        WHERE action_id = $p.action_id AND object_pattern = $p.target_content LIMIT 1)[0];

      IF $existing IS NOT NONE {
        UPDATE causal_link SET
          occurrences = $p.occurrences,
          mean_valence = $p.mean_valence ?? 0,
          mean_rpe = $p.mean_rpe ?? 0,
          predictability = 1.0 - ($p.mean_abs_rpe ?? 0.5),
          updated_cycle = $cycle
        WHERE id = $existing.id;
      } ELSE {
        CREATE causal_link CONTENT {
          action_id: $p.action_id,
          object_pattern: $p.target_content,
          occurrences: $p.occurrences,
          mean_valence: $p.mean_valence ?? 0,
          mean_rpe: $p.mean_rpe ?? 0,
          predictability: 1.0 - ($p.mean_abs_rpe ?? 0.5),
          created_cycle: $cycle,
          updated_cycle: $cycle
        };
        LET $created = $created + 1;
      };
    };
  };

  RETURN { patterns: array::len($patterns), causal_links: $created };
};

-- fn::get_causal_prediction — what will happen if I do action X on object Y?
DEFINE FUNCTION OVERWRITE fn::get_causal_prediction($action_id: int, $object_pattern: string) {
  LET $link = (SELECT * FROM causal_link
    WHERE action_id = $action_id AND object_pattern = $object_pattern LIMIT 1)[0];

  IF $link IS NONE { RETURN { known: false }; };

  RETURN {
    known: true,
    expected_valence: $link.mean_valence ?? 0,
    predictability: $link.predictability ?? 0,
    occurrences: $link.occurrences ?? 0
  };
};

-- ═══════════════════════════════════════════
-- E. INTEGRATE INTO BRAIN_TICK
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
      fn::hormone_drive();
      fn::affect_forward_output();
      fn::apply_config_deltas();
      fn::affect_backward_targeted($cfg.affect_lr ?? 0.05);
      UPDATE nn_node SET value = value * ($cfg.accumulator_decay ?? 0.9999)
        WHERE model = 'affect' AND layer = 'input' AND value > ($cfg.accumulator_floor ?? 0.01);
      fn::ecan_collect_rent();
    };

    IF $x % $freq_trace = 0 {
      UPDATE trace_state SET
        freshness = freshness * ($cfg.trace_freshness_decay ?? 0.9995)
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
      fn::predictor_replay($cfg.predictor_replay_batch ?? 5);
      IF $x % ($freq_low * ($cfg.prune_freq_multiplier ?? 3)) = 0 {
        fn::prune_dissimilar_edges($cfg.prune_min_similarity ?? 0.15);
        fn::synaptic_homeostasis();
      };
    };

    IF $x % $freq_deep = 0 {
      fn::build_world_model();
      fn::introspect();
      fn::introspect_self();
      fn::extract_all_sections();
      fn::extract_causal_patterns();
      fn::pln_infer_chain();
      CREATE config_snapshot SET config = $cfg, cycle = (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0;
    };
  };

  RETURN (SELECT * FROM kernel_state LIMIT 1)[0];
};
