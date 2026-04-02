-- Migration 071: Brain circuits — self-ticking inside SurrealDB
-- Brain runs ITSELF. No external caller. Membrane only feeds sensory_input.
--
-- Architecture: multiple clock tables, each with ASYNC event.
-- Each circuit fires independently at its own rate.
-- MAXDEPTH 1 — no recursion, just fire once per UPDATE.

-- ═══════════════════════════════════════════
-- CLOCK TABLES (one per circuit)
-- ═══════════════════════════════════════════

DEFINE TABLE IF NOT EXISTS _clock_sensory SCHEMALESS;
DEFINE TABLE IF NOT EXISTS _clock_vitals SCHEMALESS;
DEFINE TABLE IF NOT EXISTS _clock_attention SCHEMALESS;
DEFINE TABLE IF NOT EXISTS _clock_affect SCHEMALESS;
DEFINE TABLE IF NOT EXISTS _clock_agency SCHEMALESS;
DEFINE TABLE IF NOT EXISTS _clock_learning SCHEMALESS;
DEFINE TABLE IF NOT EXISTS _clock_plasticity SCHEMALESS;
DEFINE TABLE IF NOT EXISTS _clock_deep SCHEMALESS;

-- ═══════════════════════════════════════════
-- CIRCUIT: Sensory — process pending inputs
-- ═══════════════════════════════════════════

DEFINE EVENT OVERWRITE circuit_sensory ON _clock_sensory
  WHEN $event = 'CREATE' OR $event = 'UPDATE'
  THEN {
    LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
    IF ($state.running ?? false) = true {
      LET $cursor = $state.sensory_seq ?? 0;
      LET $inputs = (SELECT * FROM sensory_input WHERE seq > $cursor LIMIT 20);
      FOR $inp IN $inputs { fn::process_one_input($inp); };
      IF array::len($inputs) > 0 {
        LET $seqs = $inputs.map(|$i| $i.seq ?? 0);
        UPDATE kernel_state SET sensory_seq = math::max($seqs) ?? $cursor;
      };
    };
  };

-- ═══════════════════════════════════════════
-- CIRCUIT: Vitals — energy, fatigue, sleep, cycle counter
-- ═══════════════════════════════════════════

DEFINE EVENT OVERWRITE circuit_vitals ON _clock_vitals
  WHEN $event = 'CREATE' OR $event = 'UPDATE'
  THEN {
    LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
    IF ($state.running ?? false) = true {
      LET $cfg = $state.config ?? {};
      UPDATE _cfg_cache SET cfg = $cfg;
      UPDATE kernel_state SET
        cycle = (cycle ?? 0) + 100,
        energy = math::max([0.0, (energy ?? 1.0) - ($cfg.energy_drain_rate ?? 0.002) * (1.0 + (fatigue ?? 0.0))]),
        fatigue = math::min([1.0, (fatigue ?? 0.0) + ($cfg.fatigue_rate ?? 0.005)]);
      LET $e = (SELECT energy FROM kernel_state LIMIT 1)[0].energy ?? 0;
      IF $e < ($cfg.sleep_threshold ?? 0.15) {
        fn::sleep_consolidation($cfg.nn_decay_rate ?? 0.001);
        UPDATE kernel_state SET
          energy = math::min([1.5, energy + ($cfg.sleep_energy_restore ?? 0.5)]),
          fatigue = math::max([0.0, fatigue * 0.5]);
      };
    };
  };

-- ═══════════════════════════════════════════
-- CIRCUIT: Attention — STI rent + Hebbian bind + freshness decay
-- ═══════════════════════════════════════════

DEFINE EVENT OVERWRITE circuit_attention ON _clock_attention
  WHEN $event = 'CREATE' OR $event = 'UPDATE'
  THEN {
    LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
    IF ($state.running ?? false) = true {
      UPDATE trace_state SET freshness = freshness * 0.9995
        WHERE archived = false AND freshness > 0.01;
      fn::sti_rent();
      fn::hebbian_bind_af();
      fn::sti_diffuse();
    };
  };

-- ═══════════════════════════════════════════
-- CIRCUIT: Affect — hormones + forward + config deltas
-- ═══════════════════════════════════════════

DEFINE EVENT OVERWRITE circuit_affect ON _clock_affect
  WHEN $event = 'CREATE' OR $event = 'UPDATE'
  THEN {
    LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
    IF ($state.running ?? false) = true {
      fn::hormone_decay_tick();
      fn::hormone_drive();
      fn::affect_forward_output();
      fn::apply_config_deltas();
      fn::ecan_collect_rent();
      UPDATE nn_node SET value = value * 0.9995
        WHERE model = 'affect' AND layer = 'input' AND value > 0.01;
    };
  };

-- ═══════════════════════════════════════════
-- CIRCUIT: Agency — action selection
-- ═══════════════════════════════════════════

DEFINE EVENT OVERWRITE circuit_agency ON _clock_agency
  WHEN $event = 'CREATE' OR $event = 'UPDATE'
  THEN {
    LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
    IF ($state.running ?? false) = true {
      fn::agency_tick($state.cycle ?? 0);
    };
  };

-- ═══════════════════════════════════════════
-- CIRCUIT: Learning — spreading, forgetting, Hebbian update
-- ═══════════════════════════════════════════

DEFINE EVENT OVERWRITE circuit_learning ON _clock_learning
  WHEN $event = 'CREATE' OR $event = 'UPDATE'
  THEN {
    LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
    IF ($state.running ?? false) = true {
      LET $cfg = $state.config ?? {};
      fn::active_inference($cfg.active_inference_threshold ?? 0.3, $cfg.active_inference_limit ?? 10);
      fn::forget_traces($cfg.forget_weight_threshold ?? 0.02, $cfg.forget_freshness_threshold ?? 0.03);
      fn::apply_meta_modulation();
      fn::ecan_update_hebbian();
    };
  };

-- ═══════════════════════════════════════════
-- CIRCUIT: Plasticity — edges, consolidation, predictor
-- ═══════════════════════════════════════════

DEFINE EVENT OVERWRITE circuit_plasticity ON _clock_plasticity
  WHEN $event = 'CREATE' OR $event = 'UPDATE'
  THEN {
    LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
    IF ($state.running ?? false) = true {
      fn::consolidation_replay();
      fn::edge_sprout();
      fn::edge_death();
      fn::ecan_create_hebbian();
      fn::predictor_replay(1);
    };
  };

-- ═══════════════════════════════════════════
-- CIRCUIT: Deep — introspection, PLN, sheaves, maturity
-- ═══════════════════════════════════════════

DEFINE EVENT OVERWRITE circuit_deep ON _clock_deep
  WHEN $event = 'CREATE' OR $event = 'UPDATE'
  THEN {
    LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
    IF ($state.running ?? false) = true {
      fn::introspect_self();
      fn::extract_causal_patterns();
      fn::pln_infer_chain();
      fn::extract_all_sections();
      fn::build_world_model();
      fn::compute_maturity();
    };
  };

-- ═══════════════════════════════════════════
-- fn::start_brain — initialize all clocks
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::start_brain() {
  UPDATE kernel_state SET running = true, debug_break = false;

  -- Create clock records (triggers ASYNC events)
  DELETE _clock_sensory; CREATE _clock_sensory SET t = 0;
  DELETE _clock_vitals; CREATE _clock_vitals SET t = 0;
  DELETE _clock_attention; CREATE _clock_attention SET t = 0;
  DELETE _clock_affect; CREATE _clock_affect SET t = 0;
  DELETE _clock_agency; CREATE _clock_agency SET t = 0;
  DELETE _clock_learning; CREATE _clock_learning SET t = 0;
  DELETE _clock_plasticity; CREATE _clock_plasticity SET t = 0;
  DELETE _clock_deep; CREATE _clock_deep SET t = 0;

  RETURN true;
};

-- fn::stop_brain — stop all circuits
DEFINE FUNCTION OVERWRITE fn::stop_brain() {
  UPDATE kernel_state SET running = false;
  RETURN true;
};
