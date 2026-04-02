-- Migration 073: Self-Pumping Scheduler
-- Tested: ASYNC events fire on DELETE+CREATE (not UPDATE).
-- Ping-pong A↔B with MAXDEPTH 100 = 100 ticks per kick.
-- Daemon kicks once per 200ms → 500 dispatches/sec inside SurrealDB.

-- Remove old events
REMOVE EVENT IF EXISTS tick_dispatch ON _tick;
REMOVE EVENT IF EXISTS circuit_sensory ON _clock_sensory;
REMOVE EVENT IF EXISTS circuit_vitals ON _clock_vitals;
REMOVE EVENT IF EXISTS circuit_attention ON _clock_attention;
REMOVE EVENT IF EXISTS circuit_affect ON _clock_affect;
REMOVE EVENT IF EXISTS circuit_agency ON _clock_agency;
REMOVE EVENT IF EXISTS circuit_learning ON _clock_learning;
REMOVE EVENT IF EXISTS circuit_plasticity ON _clock_plasticity;
REMOVE EVENT IF EXISTS circuit_deep ON _clock_deep;
REMOVE EVENT IF EXISTS brain_tick ON _clk;

-- Ping-pong clock tables
DEFINE TABLE IF NOT EXISTS _clk_a SCHEMALESS;
DEFINE TABLE IF NOT EXISTS _clk_b SCHEMALESS;

-- fn::brain_fast — lightweight, runs on every pump tick
-- ONLY: sensory + vitals + attention. No heavy ops.
DEFINE FUNCTION OVERWRITE fn::brain_fast() {
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  IF ($state.running ?? false) = false { RETURN false; };
  LET $cfg = $state.config ?? {};

  -- Process sensory inputs
  LET $cursor = $state.sensory_seq ?? 0;
  LET $inputs = (SELECT * FROM sensory_input WHERE seq > $cursor LIMIT 5);
  FOR $inp IN $inputs { fn::process_one_input($inp); };
  IF array::len($inputs) > 0 {
    LET $seqs = $inputs.map(|$i| $i.seq ?? 0);
    UPDATE kernel_state SET sensory_seq = math::max($seqs) ?? $cursor;
  };

  -- Vitals
  UPDATE kernel_state SET
    cycle = ($state.cycle ?? 0) + 100,
    energy = math::max([0.0, ($state.energy ?? 1.0) - ($cfg.energy_drain_rate ?? 0.002) * (1.0 + ($state.fatigue ?? 0.0))]),
    fatigue = math::min([1.0, ($state.fatigue ?? 0.0) + ($cfg.fatigue_rate ?? 0.005)]);

  -- Attention
  fn::sti_rent();
  fn::hebbian_bind_af();

  -- Agency (every 2nd)
  IF ($state.cycle ?? 0) % 200 = 0 { fn::agency_tick($state.cycle ?? 0); };

  RETURN true;
};

-- fn::brain_medium — hormones, learning, diffusion. Slower pump.
DEFINE FUNCTION OVERWRITE fn::brain_medium() {
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  IF ($state.running ?? false) = false { RETURN false; };
  LET $cfg = $state.config ?? {};
  UPDATE _cfg_cache SET cfg = $cfg;

  fn::hormone_decay_tick();
  fn::hormone_drive();
  fn::affect_forward_output();
  fn::apply_config_deltas();
  fn::ecan_collect_rent();
  fn::sti_diffuse();

  UPDATE nn_node SET value = value * 0.9995
    WHERE model = 'affect' AND layer = 'input' AND value > 0.01;
  UPDATE trace_state SET freshness = freshness * 0.9995
    WHERE archived = false AND freshness > 0.01;

  fn::active_inference($cfg.active_inference_threshold ?? 0.3, $cfg.active_inference_limit ?? 10);
  fn::forget_traces($cfg.forget_weight_threshold ?? 0.02, $cfg.forget_freshness_threshold ?? 0.03);
  fn::ecan_update_hebbian();

  -- Sleep check
  IF ($state.energy ?? 1) < ($cfg.sleep_threshold ?? 0.15) {
    fn::sleep_consolidation($cfg.nn_decay_rate ?? 0.001);
    UPDATE kernel_state SET
      energy = math::min([1.5, energy + ($cfg.sleep_energy_restore ?? 0.5)]),
      fatigue = math::max([0.0, fatigue * 0.5]);
  };

  RETURN true;
};

-- fn::brain_slow — plasticity, deep ops. Slowest pump.
DEFINE FUNCTION OVERWRITE fn::brain_slow() {
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  IF ($state.running ?? false) = false { RETURN false; };
  LET $cfg = $state.config ?? {};

  fn::affect_backward_targeted($cfg.affect_lr ?? 0.05);
  fn::consolidation_replay();
  fn::edge_sprout();
  fn::edge_death();
  fn::ecan_create_hebbian();
  fn::predictor_replay(1);
  fn::introspect_self();
  fn::extract_causal_patterns();
  fn::compute_maturity();

  RETURN true;
};

-- 3 self-pumping circuits at different speeds:
-- Fast pump (A↔B): brain_fast — sensory + vitals + attention + agency
-- Medium pump (C↔D): brain_medium — hormones + learning + diffusion
-- Slow pump (E↔F): brain_slow — plasticity + deep ops

DEFINE TABLE IF NOT EXISTS _fast_a SCHEMALESS;
DEFINE TABLE IF NOT EXISTS _fast_b SCHEMALESS;
DEFINE TABLE IF NOT EXISTS _med_a SCHEMALESS;
DEFINE TABLE IF NOT EXISTS _med_b SCHEMALESS;
DEFINE TABLE IF NOT EXISTS _slow_a SCHEMALESS;
DEFINE TABLE IF NOT EXISTS _slow_b SCHEMALESS;

-- FAST pump: ~65K ticks
DEFINE EVENT OVERWRITE fast_a ON _fast_a ASYNC MAXDEPTH 65535
  WHEN $event = 'CREATE' THEN {
    LET $s = (SELECT running FROM kernel_state LIMIT 1)[0];
    IF ($s.running ?? false) = true { fn::brain_fast(); DELETE _fast_b; CREATE _fast_b SET t = 0; };
  };
DEFINE EVENT OVERWRITE fast_b ON _fast_b ASYNC MAXDEPTH 65535
  WHEN $event = 'CREATE' THEN {
    LET $s = (SELECT running FROM kernel_state LIMIT 1)[0];
    IF ($s.running ?? false) = true { fn::brain_fast(); DELETE _fast_a; CREATE _fast_a SET t = 0; };
  };

-- MEDIUM pump: ~65K ticks (slower handler = slower effective rate)
DEFINE EVENT OVERWRITE med_a ON _med_a ASYNC MAXDEPTH 65535
  WHEN $event = 'CREATE' THEN {
    LET $s = (SELECT running FROM kernel_state LIMIT 1)[0];
    IF ($s.running ?? false) = true { fn::brain_medium(); DELETE _med_b; CREATE _med_b SET t = 0; };
  };
DEFINE EVENT OVERWRITE med_b ON _med_b ASYNC MAXDEPTH 65535
  WHEN $event = 'CREATE' THEN {
    LET $s = (SELECT running FROM kernel_state LIMIT 1)[0];
    IF ($s.running ?? false) = true { fn::brain_medium(); DELETE _med_a; CREATE _med_a SET t = 0; };
  };

-- SLOW pump: ~65K ticks
DEFINE EVENT OVERWRITE slow_a ON _slow_a ASYNC MAXDEPTH 65535
  WHEN $event = 'CREATE' THEN {
    LET $s = (SELECT running FROM kernel_state LIMIT 1)[0];
    IF ($s.running ?? false) = true { fn::brain_slow(); DELETE _slow_b; CREATE _slow_b SET t = 0; };
  };
DEFINE EVENT OVERWRITE slow_b ON _slow_b ASYNC MAXDEPTH 65535
  WHEN $event = 'CREATE' THEN {
    LET $s = (SELECT running FROM kernel_state LIMIT 1)[0];
    IF ($s.running ?? false) = true { fn::brain_slow(); DELETE _slow_a; CREATE _slow_a SET t = 0; };
  };

-- fn::start_brain — one kick per circuit, brain runs for hours
DEFINE FUNCTION OVERWRITE fn::start_brain() {
  UPDATE kernel_state SET running = true, debug_break = false;
  -- Kick all 3 pumps
  DELETE _fast_a; CREATE _fast_a SET t = 0;
  DELETE _med_a; CREATE _med_a SET t = 0;
  DELETE _slow_a; CREATE _slow_a SET t = 0;
  RETURN true;
};

DEFINE FUNCTION OVERWRITE fn::stop_brain() {
  UPDATE kernel_state SET running = false;
  RETURN true;
};
