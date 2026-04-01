-- Migration 058: PLN Rule Engine + Language Emergence (Phases 1-2)
--
-- PLN: Unified Rule Engine — rules as data, forward/backward chaining,
--   attention-weighted selection, inference budget per tick.
-- Language: speech traces bind to sensorimotor clusters via co-activation.
--   Cross-situational learning resolves word→concept mapping.

-- ═══════════════════════════════════════════
-- CONFIG
-- ═══════════════════════════════════════════

UPDATE kernel_state SET
  -- PLN Rule Engine
  config.pln_inference_budget = config.pln_inference_budget ?? 5,
  config.pln_min_premise_confidence = config.pln_min_premise_confidence ?? 0.1,
  config.pln_max_chain_depth = config.pln_max_chain_depth ?? 3,
  config.pln_attention_weight = config.pln_attention_weight ?? 0.3,
  -- Language
  config.lang_binding_threshold = config.lang_binding_threshold ?? 5,
  config.lang_binding_lr = config.lang_binding_lr ?? 0.1,
  config.lang_lateral_inhibition = config.lang_lateral_inhibition ?? 0.95,
  config.lang_speech_action_id = config.lang_speech_action_id ?? -1,
  config.lang_speech_valence = config.lang_speech_valence ?? 0.1;

-- ═══════════════════════════════════════════
-- PART 1: PLN RULE ENGINE
-- Rules are data. Engine selects + fires rules automatically.
-- ═══════════════════════════════════════════

DEFINE TABLE OVERWRITE pln_rule SCHEMALESS;
DEFINE INDEX IF NOT EXISTS idx_pln_rule_name ON pln_rule FIELDS name UNIQUE;

-- Rule structure:
-- {
--   name: "deduction",
--   description: "A→B, B→C ⊢ A→C",
--   arity: 2,           -- number of premise edges needed
--   pattern: "chain",   -- how to find premises: "chain" (A→B→C), "shared" (A→B, A→C)
--   fn_name: "pln_deduction",  -- stored function to compute result
--   priority: 1.0,
--   fire_count: 0,
--   active: true
-- }

-- Seed rules
CREATE pln_rule CONTENT {
  name: 'deduction',
  description: 'A→B, B→C ⊢ A→C with strength+confidence propagation',
  arity: 2, pattern: 'chain', fn_name: 'pln_deduction',
  priority: 1.0, fire_count: 0, active: true
};
CREATE pln_rule CONTENT {
  name: 'modus_ponens',
  description: 'P(A), P(A→B) ⊢ P(B)',
  arity: 2, pattern: 'implication', fn_name: 'pln_modus_ponens',
  priority: 0.9, fire_count: 0, active: true
};
CREATE pln_rule CONTENT {
  name: 'inversion',
  description: 'A→B ⊢ B→A with strength inversion',
  arity: 1, pattern: 'single', fn_name: 'pln_inversion',
  priority: 0.5, fire_count: 0, active: true
};
CREATE pln_rule CONTENT {
  name: 'abduction',
  description: 'A→B, C→B ⊢ A→C (shared consequent)',
  arity: 2, pattern: 'shared_target', fn_name: 'pln_abduction',
  priority: 0.7, fire_count: 0, active: true
};

-- fn::pln_inversion — A→B ⊢ B→A
-- s(B→A) = s(A→B) × s(A) / s(B)
DEFINE FUNCTION OVERWRITE fn::pln_inversion(
  $sAB: float, $cAB: float, $sA: float, $sB: float
) {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $alpha = $cfg.pln_confidence_decay ?? 0.9;

  IF $sB < 0.001 { RETURN { strength: 0.5, confidence: 0.0 }; };
  LET $sBA = math::clamp($sAB * $sA / $sB, 0.0, 1.0);
  LET $cBA = $alpha * $cAB * 0.8;
  RETURN { strength: $sBA, confidence: $cBA };
};

-- fn::pln_abduction — A→B, C→B ⊢ A→C (shared consequent)
-- s(A→C) ≈ s(A→B) × s(C→B) (simplified)
DEFINE FUNCTION OVERWRITE fn::pln_abduction(
  $sAB: float, $cAB: float, $sCB: float, $cCB: float
) {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $alpha = $cfg.pln_confidence_decay ?? 0.9;

  LET $sAC = math::clamp($sAB * $sCB, 0.0, 1.0);
  LET $cAC = $alpha * $alpha * math::min([$cAB, $cCB]);
  RETURN { strength: $sAC, confidence: $cAC };
};

-- fn::pln_engine_tick — the Unified Rule Engine
-- Each tick: select rules weighted by priority × attention, find premises, fire
DEFINE FUNCTION OVERWRITE fn::pln_engine_tick() {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $budget = $cfg.pln_inference_budget ?? 5;
  LET $min_conf = $cfg.pln_min_premise_confidence ?? 0.1;
  LET $cycle = (SELECT cycle FROM kernel_state LIMIT 1)[0].cycle ?? 0;

  LET $rules = (SELECT * FROM pln_rule WHERE active = true);
  LET $inferred = 0;

  FOR $rule IN $rules {
    IF $inferred >= $budget { BREAK; };

    IF $rule.pattern = 'chain' {
      -- Find A→B→C chains in activates graph
      LET $chains = (SELECT in AS a, out AS b, weight AS w_ab FROM activates
        WHERE weight > $min_conf AND (archived IS NONE OR archived = false)
        LIMIT 10);

      FOR $ab IN $chains {
        IF $inferred >= $budget { BREAK; };
        LET $bc_edges = (SELECT out AS c, weight AS w_bc FROM activates
          WHERE in = $ab.b AND weight > $min_conf AND out != $ab.a
          AND (archived IS NONE OR archived = false)
          LIMIT 3);

        FOR $bc IN $bc_edges {
          -- Check A→C doesn't exist yet
          LET $exists = (SELECT count() AS c FROM activates
            WHERE in = $ab.a AND out = $bc.c GROUP ALL)[0].c ?? 0;

          IF $exists = 0 AND $ab.a IS NOT NONE AND $bc.c IS NOT NONE {
            LET $ts_b = (SELECT weight FROM trace_state WHERE trace = $ab.b AND archived = false LIMIT 1)[0].weight ?? 0.5;
            LET $ts_c = (SELECT weight FROM trace_state WHERE trace = $bc.c AND archived = false LIMIT 1)[0].weight ?? 0.5;

            LET $result = fn::pln_deduction($ab.w_ab, 0.8, $bc.w_bc, 0.8, $ts_b, $ts_c);

            IF ($result.confidence ?? 0) > $min_conf {
              RELATE ($ab.a)->activates->($bc.c) SET
                weight = $result.strength ?? 0.3,
                co_activation_count = 0,
                source = 'pln:deduction',
                inferred_cycle = $cycle;
              LET $inferred = $inferred + 1;
            };
          };
        };
      };
    };

    IF $rule.pattern = 'single' {
      -- Inversion: for strong A→B edges, create weak B→A
      LET $strong = (SELECT in AS a, out AS b, weight AS w FROM activates
        WHERE weight > 0.5 AND (archived IS NONE OR archived = false)
        LIMIT 5);

      FOR $e IN $strong {
        IF $inferred >= $budget { BREAK; };
        LET $reverse_exists = (SELECT count() AS c FROM activates
          WHERE in = $e.b AND out = $e.a GROUP ALL)[0].c ?? 0;

        IF $reverse_exists = 0 AND $e.b IS NOT NONE AND $e.a IS NOT NONE {
          LET $ts_a = (SELECT weight FROM trace_state WHERE trace = $e.a AND archived = false LIMIT 1)[0].weight ?? 0.5;
          LET $ts_b = (SELECT weight FROM trace_state WHERE trace = $e.b AND archived = false LIMIT 1)[0].weight ?? 0.5;

          LET $result = fn::pln_inversion($e.w, 0.8, $ts_a, $ts_b);
          IF ($result.confidence ?? 0) > $min_conf {
            RELATE ($e.b)->activates->($e.a) SET
              weight = $result.strength ?? 0.2,
              co_activation_count = 0,
              source = 'pln:inversion',
              inferred_cycle = $cycle;
            LET $inferred = $inferred + 1;
          };
        };
      };
    };

    IF $rule.pattern = 'shared_target' {
      -- Abduction: A→B, C→B ⊢ A→C
      LET $targets = (SELECT out AS b FROM activates
        WHERE weight > 0.3 AND (archived IS NONE OR archived = false)
        LIMIT 5);

      FOR $t IN $targets {
        IF $inferred >= $budget { BREAK; };
        LET $incoming = (SELECT in AS source, weight FROM activates
          WHERE out = $t.b AND weight > 0.3
          AND (archived IS NONE OR archived = false)
          LIMIT 5);

        IF array::len($incoming) >= 2 {
          LET $a = $incoming[0];
          LET $c = $incoming[1];

          LET $ac_exists = (SELECT count() AS cnt FROM activates
            WHERE in = $a.source AND out = $c.source GROUP ALL)[0].cnt ?? 0;

          IF $ac_exists = 0 AND $a.source != $c.source AND $a.source IS NOT NONE AND $c.source IS NOT NONE {
            LET $result = fn::pln_abduction($a.weight, 0.7, $c.weight, 0.7);
            IF ($result.confidence ?? 0) > $min_conf {
              RELATE ($a.source)->activates->($c.source) SET
                weight = $result.strength ?? 0.15,
                co_activation_count = 0,
                source = 'pln:abduction',
                inferred_cycle = $cycle;
              LET $inferred = $inferred + 1;
            };
          };
        };
      };
    };

    -- Update rule stats
    UPDATE pln_rule SET fire_count = (fire_count ?? 0) + 1 WHERE name = $rule.name;
  };

  RETURN { inferred: $inferred, rules_checked: array::len($rules) };
};

-- ═══════════════════════════════════════════
-- PART 2: LANGUAGE EMERGENCE
-- Phase 1: Speech traces bind to action/object traces via co-activation
-- Phase 2: Cross-situational learning strengthens correct bindings
-- ═══════════════════════════════════════════

-- Lexical binding table: speech_trace ↔ sensorimotor_trace association strength
DEFINE TABLE OVERWRITE lexical_binding SCHEMALESS TYPE RELATION FROM trace TO trace;
DEFINE INDEX IF NOT EXISTS idx_lex_speech ON lexical_binding FIELDS speech_trace_id;

-- fn::process_speech — brain receives mama's speech as sensory event
-- Speech arrives as channels=[0,0,...] (no physics) + speech=[char_codes]
-- Creates/reactivates a speech trace (source_type='lexical')
-- Then binds it to currently active sensorimotor traces via co-activation
DEFINE FUNCTION OVERWRITE fn::process_speech($speech: array, $valence: float) {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $cycle = (SELECT cycle FROM kernel_state LIMIT 1)[0].cycle ?? 0;
  LET $binding_lr = $cfg.lang_binding_lr ?? 0.1;
  LET $inhibition = $cfg.lang_lateral_inhibition ?? 0.95;

  -- Speech key: encode as string for content-addressable lookup
  LET $speech_key = 'speech:' + type::string($speech);

  -- Find or create speech trace
  LET $existing = (SELECT * FROM trace_state WHERE content = $speech_key AND archived = false LIMIT 1)[0];

  IF $existing IS NONE {
    -- New speech trace
    LET $trace_id = 'L' + rand::string(8);
    LET $position = array::concat([0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f], $speech);
    LET $padded = IF array::len($position) < 64 THEN
      array::concat($position, [0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f])
    ELSE $position END;
    LET $pos64 = array::slice($padded, 0, 64);

    CREATE trace CONTENT {
      trace_id: $trace_id, source_type: 'lexical', source_id: 'mama',
      content: $speech_key,
      weight: 0.5, initial_weight: 0.5, freshness: 1.0, confidence: 0.3,
      emotional_charge: $valence, reactivation_count: 0, reactivation_history: [],
      created_at_cycle: $cycle, last_reactivated_cycle: $cycle,
      position: $pos64,
      velocity: [0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f],
      suppressed: false, archived: false
    };

    LET $trace_rec = (SELECT id FROM trace WHERE trace_id = $trace_id LIMIT 1)[0];
    CREATE trace_state SET
      trace = $trace_rec.id, trace_id = $trace_id, content = $speech_key,
      weight = 0.5, freshness = 1.0, emotional_charge = $valence,
      reactivation_count = 0, archived = false, suppressed = false, cycle = $cycle;

    LET $existing = (SELECT * FROM trace_state WHERE trace_id = $trace_id LIMIT 1)[0];
  } ELSE {
    -- Reactivate speech trace
    UPDATE trace_state SET
      weight = math::min([1.0, weight + 0.1]),
      freshness = 1.0,
      reactivation_count = reactivation_count + 1,
      cycle = $cycle
    WHERE id = $existing.id;
  };

  -- BINDING: find currently active sensorimotor traces (high weight+freshness)
  -- These are what the brain is "attending to" when mama speaks
  LET $speech_trace = (SELECT id FROM trace WHERE content = $speech_key AND archived = false LIMIT 1)[0];
  IF $speech_trace IS NONE { RETURN { speech_trace: NONE }; };

  LET $active_motor = (SELECT trace, trace_id, weight, freshness FROM trace_state
    WHERE archived = false AND suppressed = false
    AND weight > ($cfg.ecan_af_threshold ?? 0.4)
    AND string::starts_with(content, 'speech:') = false
    LIMIT 5);

  -- Create/strengthen lexical bindings (co-activation = Hebbian)
  -- Resolve motor trace_id → trace record (trace_state.trace may be empty)
  FOR $motor IN $active_motor {
    LET $motor_rec = (SELECT id FROM trace WHERE trace_id = $motor.trace_id AND archived = false LIMIT 1)[0];
    IF $motor_rec IS NOT NONE AND $motor_rec.id IS NOT NONE {
      LET $binding = (SELECT * FROM lexical_binding
        WHERE in = $speech_trace.id AND out = $motor_rec.id LIMIT 1)[0];

      LET $activation = ($motor.weight ?? 0) * ($motor.freshness ?? 0);

      IF $binding IS NOT NONE {
        UPDATE lexical_binding SET
          weight = math::min([1.0, weight + $binding_lr * $activation]),
          co_occurrence_count = (co_occurrence_count ?? 0) + 1,
          last_cycle = $cycle
        WHERE id = $binding.id;
      } ELSE {
        RELATE ($speech_trace.id)->lexical_binding->($motor_rec.id) SET
          weight = $binding_lr * $activation,
          speech_trace_id = $existing.trace_id ?? '',
          motor_trace_id = $motor.trace_id ?? '',
          co_occurrence_count = 1,
          created_cycle = $cycle,
          last_cycle = $cycle;
      };
    };
  };

  -- LATERAL INHIBITION
  LET $my_bindings = (SELECT out FROM lexical_binding WHERE in = $speech_trace.id);
  FOR $b IN $my_bindings {
    -- Find competing bindings to same motor trace from OTHER speech traces
    UPDATE lexical_binding SET weight = weight * $inhibition
      WHERE out = $b.out AND in != $speech_trace.id AND weight > 0.01;
  };

  -- DualLink: fire patterns for this speech trace
  IF $existing IS NOT NONE AND $existing.trace_id IS NOT NONE {
    fn::dual_match($existing.trace_id);
  };

  RETURN {
    speech_trace: $existing.trace_id ?? '',
    bindings: array::len($active_motor),
    speech_key: $speech_key
  };
};

-- fn::get_word_for_concept — inverse retrieval (phase 2: production readiness check)
-- Given a motor trace, find the strongest lexical binding = the "word" for it
DEFINE FUNCTION OVERWRITE fn::get_word_for_concept($motor_trace: record) {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $threshold = $cfg.lang_binding_threshold ?? 5;

  LET $bindings = (SELECT in AS speech_trace, in.content AS speech_content,
    weight, co_occurrence_count
    FROM lexical_binding
    WHERE out = $motor_trace AND weight > 0.1
    LIMIT 5);

  -- Best binding: highest weight with enough co-occurrences
  LET $strong = $bindings.filter(|$b| ($b.co_occurrence_count ?? 0) >= $threshold);

  IF array::len($strong) = 0 { RETURN NONE; };

  -- Return strongest
  LET $weights = $strong.map(|$b| $b.weight ?? 0);
  LET $max_w = math::max($weights) ?? 0;
  LET $best = $strong.filter(|$b| ($b.weight ?? 0) >= $max_w)[0];

  RETURN {
    speech_trace: $best.speech_trace,
    speech_content: $best.speech_content,
    weight: $best.weight,
    co_occurrences: $best.co_occurrence_count
  };
};

-- fn::language_status — report on language acquisition state
DEFINE FUNCTION OVERWRITE fn::language_status() {
  LET $lexical_traces = (SELECT count() AS c FROM trace WHERE source_type = 'lexical' AND archived = false GROUP ALL)[0].c ?? 0;
  LET $bindings = (SELECT count() AS c FROM lexical_binding WHERE weight > 0.1 GROUP ALL)[0].c ?? 0;
  LET $strong_bindings = (SELECT count() AS c FROM lexical_binding WHERE weight > 0.5 AND co_occurrence_count > 5 GROUP ALL)[0].c ?? 0;

  LET $top_bindings = (SELECT
    in.content AS speech, out.content AS motor_content,
    weight, co_occurrence_count
    FROM lexical_binding
    WHERE weight > 0.1
    LIMIT 10);

  RETURN {
    lexical_traces: $lexical_traces,
    total_bindings: $bindings,
    grounded_symbols: $strong_bindings,
    top_bindings: $top_bindings
  };
};

-- ═══════════════════════════════════════════
-- PART 3: INTEGRATE INTO BRAIN_TICK
-- PLN engine at freq_deep, language binding at freq_med
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
      fn::predictor_replay($cfg.predictor_replay_batch ?? 5);
      IF $x % ($freq_low * ($cfg.prune_freq_multiplier ?? 3)) = 0 {
        fn::prune_dissimilar_edges($cfg.prune_min_similarity ?? 0.15);
        fn::synaptic_homeostasis();
      };
    };

    IF $x % $freq_deep = 0 {
      fn::build_world_model();
      fn::introspect();
      fn::extract_all_sections();
      CREATE config_snapshot SET config = $cfg, cycle = (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0;
    };
  };

  RETURN (SELECT * FROM kernel_state LIMIT 1)[0];
};

-- ═══════════════════════════════════════════
-- PART 4: INTEGRATE SPEECH INTO brain_tick_auto
-- When sensory_input has speech (action_id = -1), call process_speech
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::brain_tick_auto() {
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  IF $state = NONE OR ($state.running ?? false) = false { RETURN { ticked: false }; };

  LET $cursor = $state.sensory_seq ?? 0;
  LET $inputs = (SELECT * FROM sensory_input WHERE seq > $cursor LIMIT 10);

  IF array::len($inputs) > 0 {
    FOR $inp IN $inputs {
      LET $action = $inp.action_id ?? 0;

      IF $action < 0 {
        -- Speech event: mama said something
        fn::process_speech($inp.speech ?? [], $inp.valence ?? 0);
      } ELSE {
        -- Regular sensory event
        fn::process_sensory($action, $inp.channels ?? [], $inp.speech ?? [],
          $inp.valence ?? 0, $inp.object_idx ?? 0);

        IF $inp.is_consequence = true {
          LET $tkey = type::string($action) + ':' + type::string($inp.object_idx ?? 0);
          LET $tr = (SELECT trace_id FROM trace_state WHERE content = $tkey AND archived = false LIMIT 1)[0];
          IF $tr IS NOT NONE AND $tr.trace_id IS NOT NONE {
            fn::cognitive_cycle($tr.trace_id, $action, $tkey, $inp.valence ?? 0);
          };
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
