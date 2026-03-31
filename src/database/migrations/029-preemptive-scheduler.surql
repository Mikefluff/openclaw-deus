-- Migration 029: Preemptive Scheduler
-- Multiple concurrent loops with priorities and semaphores.
-- CRITICAL preempts HIGH preempts MEDIUM preempts LOW.
-- Each loop = separate table + self-triggering EVENT chain.

-- ═══════════════════════════════════════════
-- SEMAPHORE TABLES (one per priority level)
-- ═══════════════════════════════════════════

DEFINE TABLE IF NOT EXISTS sched_critical SCHEMALESS;
DEFINE TABLE IF NOT EXISTS sched_high SCHEMALESS;
DEFINE TABLE IF NOT EXISTS sched_medium SCHEMALESS;
DEFINE TABLE IF NOT EXISTS sched_low SCHEMALESS;

-- ═══════════════════════════════════════════
-- CRITICAL LOOP: energy + sleep + emergency
-- Runs ALWAYS. Cannot be preempted. ~1ms per tick.
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::sched_critical_tick($tick: int) {
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  IF $state = NONE OR ($state.running ?? false) = false { RETURN { stopped: true }; };

  LET $cfg = $state.config ?? {};
  LET $fatigue = $state.fatigue ?? 0.0;
  LET $drain = ($cfg.energy_drain_rate ?? 0.002) * (1.0 + $fatigue);
  LET $energy = math::max([0.0, ($state.energy ?? 1.0) - $drain]);
  LET $fatigue = math::min([1.0, $fatigue + ($cfg.fatigue_rate ?? 0.001)]);

  -- Sleep check
  LET $needs_sleep = $energy < ($cfg.sleep_threshold ?? 0.1);
  IF $needs_sleep {
    fn::sleep_consolidation(0.001);
    LET $energy = math::min([($state.max_energy ?? 1.5), $energy + 0.8]);
    LET $fatigue = 0.0;
  };

  UPDATE kernel_state SET
    energy = $energy,
    fatigue = $fatigue,
    cycles_since_sleep = IF $needs_sleep THEN 0 ELSE (cycles_since_sleep ?? 0) + 1 END;

  UPDATE sched_critical SET tick = $tick, ts = time::now();
  RETURN { tick: $tick, energy: $energy, fatigue: $fatigue, slept: $needs_sleep };
};

DEFINE EVENT IF NOT EXISTS critical_loop ON sched_critical
  ASYNC RETRY 1 MAXDEPTH 1024
  WHEN $event = 'UPDATE'
  THEN {
    LET $running = (SELECT running FROM kernel_state LIMIT 1)[0].running ?? false;
    IF $running = true {
      fn::sched_critical_tick(($after.tick ?? 0) + 1);
    };
  };

-- ═══════════════════════════════════════════
-- HIGH LOOP: affect + trace decay
-- Runs when energy > 0. Preempted by CRITICAL (sleep).
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::sched_high_tick($tick: int) {
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  IF $state = NONE OR ($state.running ?? false) = false { RETURN { stopped: true }; };
  IF ($state.energy ?? 0) < 0.05 { RETURN { preempted: 'low_energy' }; };

  -- Affect forward pass (hormones)
  fn::nn_forward('affect', 'input', 'hidden');
  fn::nn_forward('affect', 'hidden', 'output');

  -- Cone forward (depth/spread)
  fn::nn_forward('cone', 'input', 'output');

  -- Trace decay
  UPDATE trace SET
    weight = math::clamp(weight * 0.999, 0.0, 1.0),
    freshness = freshness * 0.999
  WHERE archived = false AND weight > 0.05;

  UPDATE sched_high SET tick = $tick, ts = time::now();
  RETURN { tick: $tick };
};

DEFINE EVENT IF NOT EXISTS high_loop ON sched_high
  ASYNC RETRY 1 MAXDEPTH 1024
  WHEN $event = 'UPDATE'
  THEN {
    LET $running = (SELECT running FROM kernel_state LIMIT 1)[0].running ?? false;
    IF $running = true {
      fn::sched_high_tick(($after.tick ?? 0) + 1);
    };
  };

-- ═══════════════════════════════════════════
-- MEDIUM LOOP: inference + schemas + forgetting
-- Runs when energy > 0.2. Preempted by HIGH.
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::sched_medium_tick($tick: int) {
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  IF $state = NONE OR ($state.running ?? false) = false { RETURN { stopped: true }; };
  IF ($state.energy ?? 0) < 0.2 { RETURN { preempted: 'low_energy' }; };

  -- Active inference
  fn::active_inference(0.3, 10);

  -- Schema detection
  fn::detect_schemas_native(3, 10);

  -- Forgetting
  fn::forget_traces(0.02, 0.03);

  -- Drift
  fn::drift_traces(0.01, 0.02, $tick);

  -- Spend energy
  UPDATE kernel_state SET energy = math::max([0.0, energy - 0.01]);

  UPDATE sched_medium SET tick = $tick, ts = time::now();
  RETURN { tick: $tick };
};

DEFINE EVENT IF NOT EXISTS medium_loop ON sched_medium
  ASYNC RETRY 1 MAXDEPTH 512
  WHEN $event = 'UPDATE'
  THEN {
    LET $running = (SELECT running FROM kernel_state LIMIT 1)[0].running ?? false;
    LET $energy = (SELECT energy FROM kernel_state LIMIT 1)[0].energy ?? 0;
    IF $running = true AND $energy > 0.2 {
      fn::sched_medium_tick(($after.tick ?? 0) + 1);
    };
  };

-- ═══════════════════════════════════════════
-- LOW LOOP: world model + introspection + nightly + neural decay
-- Runs when energy > 0.4 and fatigue manageable.
-- Preempted by MEDIUM.
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::sched_low_tick($tick: int) {
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  IF $state = NONE OR ($state.running ?? false) = false { RETURN { stopped: true }; };
  IF ($state.energy ?? 0) < 0.4 { RETURN { preempted: 'low_energy' }; };

  -- Neural graph maintenance
  fn::nn_decay_all(0.001);
  fn::consolidate_episodic(3);

  -- Belief decay
  fn::belief_decay(0.005);

  -- Narrative compaction
  fn::narrative_compact(50);

  -- World model rebuild (every 10 ticks)
  IF $tick % 10 = 0 {
    fn::build_world_model();
  };

  -- Introspection (every 20 ticks)
  IF $tick % 20 = 0 {
    fn::introspect();
  };

  -- Nightly (when fatigued enough)
  LET $cfg = $state.config ?? {};
  IF ($state.fatigue ?? 0) > ($cfg.nightly_fatigue_threshold ?? 0.3)
    AND ($state.energy ?? 0) > ($cfg.nightly_energy_threshold ?? 0.5) {
    fn::nightly_run();
    UPDATE kernel_state SET fatigue = math::max([0.0, fatigue - 0.2]);
  };

  -- Spend energy
  UPDATE kernel_state SET energy = math::max([0.0, energy - 0.02]);

  UPDATE sched_low SET tick = $tick, ts = time::now();
  RETURN { tick: $tick };
};

DEFINE EVENT IF NOT EXISTS low_loop ON sched_low
  ASYNC RETRY 1 MAXDEPTH 256
  WHEN $event = 'UPDATE'
  THEN {
    LET $running = (SELECT running FROM kernel_state LIMIT 1)[0].running ?? false;
    LET $energy = (SELECT energy FROM kernel_state LIMIT 1)[0].energy ?? 0;
    IF $running = true AND $energy > 0.4 {
      fn::sched_low_tick(($after.tick ?? 0) + 1);
    };
  };

-- ═══════════════════════════════════════════
-- fn::kernel_start — kick ALL loops
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::kernel_start() {
  -- Initialize state
  LET $exists = (SELECT count() AS c FROM kernel_state GROUP ALL)[0].c ?? 0;
  IF $exists = 0 {
    CREATE kernel_state CONTENT {
      cycle: 0, energy: 1.0, max_energy: 1.5, fatigue: 0.0,
      cycles_since_sleep: 0, total_spent: 0.0, mode: 'default',
      running: true, debug_break: false,
      last_tick_at: time::now(), config: {}
    };
  } ELSE {
    UPDATE kernel_state SET running = true, debug_break = false;
  };

  -- Initialize semaphores (kick all loops)
  UPSERT sched_critical:main SET tick = 0, ts = time::now();
  UPSERT sched_high:main SET tick = 0, ts = time::now();
  UPSERT sched_medium:main SET tick = 0, ts = time::now();
  UPSERT sched_low:main SET tick = 0, ts = time::now();

  RETURN { started: true, loops: ['critical', 'high', 'medium', 'low'] };
};

-- ═══════════════════════════════════════════
-- fn::kernel_stop — stop ALL loops
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::kernel_stop() {
  UPDATE kernel_state SET running = false;
  RETURN { stopped: true };
};

-- ═══════════════════════════════════════════
-- fn::kernel_reset — full reset + restart
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::kernel_reset() {
  -- Stop first
  UPDATE kernel_state SET running = false;

  -- Reset state
  UPDATE kernel_state SET
    cycle = 0, energy = 1.0, fatigue = 0.0,
    cycles_since_sleep = 0, total_spent = 0.0,
    mode = 'default', debug_break = false;

  -- Reset semaphores
  UPDATE sched_critical:main SET tick = 0;
  UPDATE sched_high:main SET tick = 0;
  UPDATE sched_medium:main SET tick = 0;
  UPDATE sched_low:main SET tick = 0;

  RETURN { reset: true };
};

-- ═══════════════════════════════════════════
-- fn::kernel_status — health check across all loops
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::kernel_status() {
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  LET $critical = (SELECT tick, ts FROM sched_critical:main);
  LET $high = (SELECT tick, ts FROM sched_high:main);
  LET $medium = (SELECT tick, ts FROM sched_medium:main);
  LET $low = (SELECT tick, ts FROM sched_low:main);

  RETURN {
    running: $state.running ?? false,
    energy: $state.energy ?? 0,
    fatigue: $state.fatigue ?? 0,
    cycle: $state.cycle ?? 0,
    debug_break: $state.debug_break ?? false,
    loops: {
      critical: $critical[0] ?? { tick: 0 },
      high: $high[0] ?? { tick: 0 },
      medium: $medium[0] ?? { tick: 0 },
      low: $low[0] ?? { tick: 0 }
    }
  };
};
