-- Migration 074: Single-chain scheduler — one clock, frequency division
--
-- Like thalamus: one global rhythm, different areas at different frequencies.
-- Cortex at gamma (40Hz), subcortical at theta/delta.
-- Zero write conflicts. One transaction at a time.
--
-- Ping-pong _clk_a ↔ _clk_b, MAXDEPTH 65535.
-- fn::brain_tick multiplexes fast/medium/slow by modulo.

-- Remove all old pump events
REMOVE EVENT IF EXISTS pump_a ON _clk_a;
REMOVE EVENT IF EXISTS pump_b ON _clk_b;
REMOVE EVENT IF EXISTS fast_a ON _fast_a;
REMOVE EVENT IF EXISTS fast_b ON _fast_b;
REMOVE EVENT IF EXISTS med_a ON _med_a;
REMOVE EVENT IF EXISTS med_b ON _med_b;
REMOVE EVENT IF EXISTS slow_a ON _slow_a;
REMOVE EVENT IF EXISTS slow_b ON _slow_b;

-- Clock tables (only two needed)
DEFINE TABLE IF NOT EXISTS _clk_a SCHEMALESS;
DEFINE TABLE IF NOT EXISTS _clk_b SCHEMALESS;

-- ═══════════════════════════════════════════
-- fn::brain_tick — single multiplexed dispatcher
-- One transaction, zero conflicts, frequency division by modulo.
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::brain_tick_dispatch() {
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  IF ($state.running ?? false) = false { RETURN false; };
  LET $cfg = $state.config ?? {};
  LET $c = $state.cycle ?? 0;

  -- Internal tick counter for frequency division
  LET $t = ($c / 100) % 100;

  -- ─── FAST (every tick) ───────────────────
  -- Sensory processing
  LET $cursor = $state.sensory_seq ?? 0;
  LET $inputs = (SELECT * FROM sensory_input WHERE seq > $cursor LIMIT 5);
  FOR $inp IN $inputs { fn::process_one_input($inp); };
  IF array::len($inputs) > 0 {
    LET $seqs = $inputs.map(|$i| $i.seq ?? 0);
    UPDATE kernel_state SET sensory_seq = math::max($seqs) ?? $cursor;
  };

  -- Vitals + sleep
  LET $new_e = math::max([0.0, ($state.energy ?? 1.0) - ($cfg.energy_drain_rate ?? 0.002) * (1.0 + ($state.fatigue ?? 0.0))]);
  LET $slept = $new_e < ($cfg.sleep_threshold ?? 0.15);
  UPDATE kernel_state SET
    cycle = $c + 100,
    energy = IF $slept THEN math::min([1.5, $new_e + ($cfg.sleep_energy_restore ?? 0.5)]) ELSE $new_e END,
    fatigue = IF $slept THEN math::max([0.0, ($state.fatigue ?? 0.0) * 0.5]) ELSE math::min([1.0, ($state.fatigue ?? 0.0) + ($cfg.fatigue_rate ?? 0.005)]) END;
  IF $slept { fn::sleep_consolidation($cfg.nn_decay_rate ?? 0.001); };

  -- Attention: STI
  fn::sti_rent();
  fn::hebbian_bind_af();

  -- Freshness decay
  UPDATE trace_state SET freshness = freshness * 0.9995
    WHERE archived = false AND freshness > 0.01;

  -- ─── AGENCY (every 2nd tick) ─────────────
  IF $t % 2 = 0 { fn::agency_tick($c); };

  -- ─── MEDIUM (every 5th tick) ─────────────
  IF $t % 5 = 0 {
    UPDATE _cfg_cache SET cfg = $cfg;
    fn::hormone_decay_tick();
    fn::hormone_drive();
    fn::affect_forward_output();
    fn::apply_config_deltas();
    fn::ecan_collect_rent();
    fn::sti_diffuse();
    UPDATE nn_node SET value = value * 0.9995
      WHERE model = 'affect' AND layer = 'input' AND value > 0.01;
  };

  -- ─── LEARNING (every 10th tick) ──────────
  IF $t % 10 = 0 {
    fn::active_inference($cfg.active_inference_threshold ?? 0.3, $cfg.active_inference_limit ?? 10);
    fn::forget_traces($cfg.forget_weight_threshold ?? 0.02, $cfg.forget_freshness_threshold ?? 0.03);
    fn::ecan_update_hebbian();
  };

  -- ─── PLASTICITY (every 20th tick) ────────
  IF $t % 20 = 0 {
    fn::consolidation_replay();
    fn::edge_sprout();
    fn::edge_death();
    fn::ecan_create_hebbian();
  };

  -- ─── AFFECT BACKWARD (every 25th tick) ───
  IF $t % 25 = 0 {
    fn::affect_backward_targeted($cfg.affect_lr ?? 0.05);
  };

  -- ─── DEEP (every 50th tick) ──────────────
  IF $t % 50 = 0 {
    fn::introspect_self();
    fn::extract_causal_patterns();
    fn::predictor_replay(1);
    fn::compute_maturity();
  };

  RETURN true;
};

-- ═══════════════════════════════════════════
-- PING-PONG: single chain, MAXDEPTH 65535
-- One kick → ~65K ticks → hours of autonomous operation
-- ═══════════════════════════════════════════

DEFINE EVENT OVERWRITE tick_a ON _clk_a
  ASYNC RETRY 10 MAXDEPTH 65535
  WHEN $event = 'CREATE'
  THEN {
    LET $s = (SELECT running FROM kernel_state LIMIT 1)[0];
    IF ($s.running ?? false) = true {
      fn::brain_tick_dispatch();
      DELETE _clk_b; CREATE _clk_b SET t = 0;
    };
  };

DEFINE EVENT OVERWRITE tick_b ON _clk_b
  ASYNC RETRY 10 MAXDEPTH 65535
  WHEN $event = 'CREATE'
  THEN {
    LET $s = (SELECT running FROM kernel_state LIMIT 1)[0];
    IF ($s.running ?? false) = true {
      fn::brain_tick_dispatch();
      DELETE _clk_a; CREATE _clk_a SET t = 0;
    };
  };

-- ═══════════════════════════════════════════
-- fn::start_brain / fn::stop_brain
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::start_brain() {
  UPDATE kernel_state SET running = true, debug_break = false;
  DELETE _clk_a; CREATE _clk_a SET t = 0;
  RETURN true;
};

DEFINE FUNCTION OVERWRITE fn::stop_brain() {
  UPDATE kernel_state SET running = false;
  RETURN true;
};
