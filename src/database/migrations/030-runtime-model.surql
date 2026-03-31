-- Migration 030: Formal Runtime Model
-- Implements RUNTIME-MODEL.md spec: semaphores, interrupts, resets, budgets.
-- Replaces naive scheduler from 029 with full preemptive kernel.

-- ═══════════════════════════════════════════
-- 1. INTERRUPT LOG — every interrupt recorded for learning
-- ═══════════════════════════════════════════

DEFINE TABLE IF NOT EXISTS kernel_interrupt SCHEMALESS;

-- ═══════════════════════════════════════════
-- 2. SEMAPHORE STATE — full per-circuit state
-- Replaces simple sched_* tables from 029
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::init_semaphore($circuit: string, $priority: int, $budget: float) {
  UPSERT type::record('sched_' + $circuit, 'main') CONTENT {
    circuit: $circuit,
    state: 'ready',
    priority: $priority,
    budget_remaining: $budget,
    budget_max: $budget,
    last_run: time::now(),
    last_commit: time::now(),
    interrupt_flags: [],
    cooldown_until: NONE,
    ticks_this_chain: 0,
    error_count: 0,
    tick: 0
  };
};

-- ═══════════════════════════════════════════
-- 3. fn::interrupt — send interrupt to a circuit
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::interrupt($target: string, $reason: string, $source: string) {
  -- Log interrupt
  CREATE kernel_interrupt CONTENT {
    target: $target,
    reason: $reason,
    source: $source,
    ts: time::now()
  };

  -- Set flag on target semaphore
  LET $sem = type::record('sched_' + $target, 'main');
  UPDATE $sem SET interrupt_flags = array::push(interrupt_flags ?? [], $reason);

  -- Execute interrupt action based on reason
  IF $reason = 'energy_critical' OR $reason = 'sleep_enter' {
    -- Pause all non-critical circuits
    UPDATE sched_high:main SET state = 'sleeping';
    UPDATE sched_medium:main SET state = 'sleeping';
    UPDATE sched_low:main SET state = 'sleeping';
  };

  IF $reason = 'quarantine' {
    UPDATE $sem SET state = 'quarantined', cooldown_until = time::now() + 10s;
  };

  RETURN true;
};

-- ═══════════════════════════════════════════
-- 4. fn::check_preemption — should this circuit yield?
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::check_preemption($circuit: string) {
  LET $sem = (SELECT * FROM type::record('sched_' + $circuit, 'main'))[0];
  IF $sem = NONE { RETURN { should_yield: true, reason: 'no_semaphore' }; };

  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  IF ($state.running ?? false) = false { RETURN { should_yield: true, reason: 'stopped' }; };
  IF ($state.debug_break ?? false) = true { RETURN { should_yield: true, reason: 'debug_break' }; };

  -- Check interrupt flags
  IF array::len($sem.interrupt_flags ?? []) > 0 {
    RETURN { should_yield: true, reason: ($sem.interrupt_flags)[0] };
  };

  -- Check state
  IF $sem.state = 'quarantined' OR $sem.state = 'sleeping' OR $sem.state = 'blocked' {
    RETURN { should_yield: true, reason: $sem.state };
  };

  -- Check budget
  IF ($sem.budget_remaining ?? 0) <= 0 {
    RETURN { should_yield: true, reason: 'budget_exhausted' };
  };

  -- Energy-based preemption thresholds (from runtime model)
  LET $energy = $state.energy ?? 0;
  LET $cfg = $state.config ?? {};
  IF $circuit = 'low' AND $energy < ($cfg.low_energy_threshold ?? 0.4) {
    RETURN { should_yield: true, reason: 'energy_low' };
  };
  IF $circuit = 'medium' AND $energy < ($cfg.medium_energy_threshold ?? 0.2) {
    RETURN { should_yield: true, reason: 'energy_low' };
  };
  IF $circuit = 'high' AND $energy < ($cfg.high_energy_threshold ?? 0.05) {
    RETURN { should_yield: true, reason: 'energy_low' };
  };

  RETURN { should_yield: false };
};

-- ═══════════════════════════════════════════
-- 5. CIRCUIT TICK FUNCTIONS — with preemption + budget
-- ═══════════════════════════════════════════

-- CRITICAL: energy + sleep + watchdog + circuit breaker
DEFINE FUNCTION OVERWRITE fn::sched_critical_tick($tick: int) {
  -- Critical NEVER checks preemption — it IS the preemptor
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  IF $state = NONE OR ($state.running ?? false) = false { RETURN { stopped: true }; };
  IF ($state.debug_break ?? false) = true { RETURN { paused: true }; };

  LET $cfg = $state.config ?? {};
  LET $fatigue = $state.fatigue ?? 0.0;
  LET $drain = ($cfg.energy_drain_rate ?? 0.002) * (1.0 + $fatigue);
  LET $energy = math::max([0.0, ($state.energy ?? 1.0) - $drain]);
  LET $fatigue = math::min([1.0, $fatigue + ($cfg.fatigue_rate ?? 0.001)]);

  -- Sleep detection
  LET $needs_sleep = $energy < ($cfg.sleep_threshold ?? 0.1);
  IF $needs_sleep {
    fn::interrupt('high', 'sleep_enter', 'critical');
    fn::interrupt('medium', 'sleep_enter', 'critical');
    fn::interrupt('low', 'sleep_enter', 'critical');
    fn::sleep_consolidation(0.001);
    LET $energy = math::min([($state.max_energy ?? 1.5), $energy + 0.8]);
    LET $fatigue = 0.0;
    -- Wake circuits after sleep
    UPDATE sched_high:main SET state = 'ready', interrupt_flags = [];
    UPDATE sched_medium:main SET state = 'ready', interrupt_flags = [];
    UPDATE sched_low:main SET state = 'ready', interrupt_flags = [];
  };

  -- Watchdog: check circuit health
  LET $high_sem = (SELECT * FROM sched_high:main)[0];
  IF $high_sem != NONE AND ($high_sem.error_count ?? 0) > 3 {
    fn::interrupt('high', 'quarantine', 'critical');
  };
  LET $med_sem = (SELECT * FROM sched_medium:main)[0];
  IF $med_sem != NONE AND ($med_sem.error_count ?? 0) > 3 {
    fn::interrupt('medium', 'quarantine', 'critical');
  };

  -- Budget replenishment for all circuits
  LET $ratios = $cfg.budget_ratios ?? { high: 0.4, medium: 0.3, low: 0.2 };
  UPDATE sched_high:main SET budget_remaining = ($ratios.high ?? 0.4) * $energy;
  UPDATE sched_medium:main SET budget_remaining = ($ratios.medium ?? 0.3) * $energy;
  UPDATE sched_low:main SET budget_remaining = ($ratios.low ?? 0.2) * $energy;

  UPDATE kernel_state SET
    energy = $energy,
    fatigue = $fatigue,
    cycle = ($state.cycle ?? 0) + 1,
    cycles_since_sleep = IF $needs_sleep THEN 0 ELSE ($state.cycles_since_sleep ?? 0) + 1 END,
    last_tick_at = time::now();

  UPDATE sched_critical:main SET tick = $tick, ticks_this_chain = (ticks_this_chain ?? 0) + 1, last_run = time::now(), state = 'running';
  RETURN { tick: $tick, energy: $energy, slept: $needs_sleep };
};

-- HIGH: affect + fast dynamics
DEFINE FUNCTION OVERWRITE fn::sched_high_tick($tick: int) {
  LET $preempt = fn::check_preemption('high');
  IF $preempt.should_yield = true {
    UPDATE sched_high:main SET state = 'blocked';
    RETURN { yielded: true, reason: $preempt.reason };
  };

  UPDATE sched_high:main SET state = 'running';

  -- Affect forward
  fn::nn_forward('affect', 'input', 'hidden');
  fn::nn_forward('affect', 'hidden', 'output');
  fn::nn_forward('cone', 'input', 'output');

  -- Trace decay
  UPDATE trace SET
    weight = math::clamp(weight * 0.999, 0.0, 1.0),
    freshness = freshness * 0.999
  WHERE archived = false AND weight > 0.05;

  -- Deduct budget
  UPDATE sched_high:main SET
    tick = $tick,
    ticks_this_chain = (ticks_this_chain ?? 0) + 1,
    budget_remaining = math::max([0, (budget_remaining ?? 0) - 0.01]),
    last_run = time::now(),
    last_commit = time::now(),
    error_count = 0,
    state = 'ready';

  RETURN { tick: $tick };
};

-- MEDIUM: reflective cognition
DEFINE FUNCTION OVERWRITE fn::sched_medium_tick($tick: int) {
  LET $preempt = fn::check_preemption('medium');
  IF $preempt.should_yield = true {
    UPDATE sched_medium:main SET state = 'blocked';
    RETURN { yielded: true, reason: $preempt.reason };
  };

  UPDATE sched_medium:main SET state = 'running';

  fn::active_inference(0.3, 10);
  fn::detect_schemas_native(3, 10);
  fn::forget_traces(0.02, 0.03);
  fn::drift_traces(0.01, 0.02, $tick);
  fn::belief_decay(0.005);

  UPDATE kernel_state SET energy = math::max([0.0, energy - 0.01]);

  UPDATE sched_medium:main SET
    tick = $tick,
    ticks_this_chain = (ticks_this_chain ?? 0) + 1,
    budget_remaining = math::max([0, (budget_remaining ?? 0) - 0.02]),
    last_run = time::now(),
    last_commit = time::now(),
    error_count = 0,
    state = 'ready';

  RETURN { tick: $tick };
};

-- LOW: deep synthesis (always recompute after interruption)
DEFINE FUNCTION OVERWRITE fn::sched_low_tick($tick: int) {
  LET $preempt = fn::check_preemption('low');
  IF $preempt.should_yield = true {
    UPDATE sched_low:main SET state = 'blocked';
    RETURN { yielded: true, reason: $preempt.reason };
  };

  UPDATE sched_low:main SET state = 'running';

  fn::nn_decay_all(0.001);
  fn::consolidate_episodic(3);
  fn::narrative_compact(50);

  IF $tick % 10 = 0 { fn::build_world_model(); };
  IF $tick % 20 = 0 { fn::introspect(); };

  -- Nightly: fatigue-driven
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  LET $cfg = $state.config ?? {};
  IF ($state.fatigue ?? 0) > ($cfg.nightly_fatigue_threshold ?? 0.3)
    AND ($state.energy ?? 0) > ($cfg.nightly_energy_threshold ?? 0.5) {
    fn::nightly_run();
    UPDATE kernel_state SET fatigue = math::max([0.0, fatigue - 0.2]);
  };

  UPDATE kernel_state SET energy = math::max([0.0, energy - 0.02]);

  UPDATE sched_low:main SET
    tick = $tick,
    ticks_this_chain = (ticks_this_chain ?? 0) + 1,
    budget_remaining = math::max([0, (budget_remaining ?? 0) - 0.03]),
    last_run = time::now(),
    last_commit = time::now(),
    error_count = 0,
    state = 'ready';

  RETURN { tick: $tick };
};

-- ═══════════════════════════════════════════
-- 6. SELF-TRIGGER EVENTS — each circuit loops independently
-- ═══════════════════════════════════════════

REMOVE EVENT IF EXISTS critical_loop ON sched_critical;
DEFINE EVENT critical_loop ON sched_critical
  ASYNC RETRY 1 MAXDEPTH 1024
  WHEN $event = 'UPDATE' AND ($after.state = 'running' OR $after.state = 'ready')
  THEN {
    LET $running = (SELECT running FROM kernel_state LIMIT 1)[0].running ?? false;
    IF $running = true {
      fn::sched_critical_tick(($after.tick ?? 0) + 1);
    };
  };

REMOVE EVENT IF EXISTS high_loop ON sched_high;
DEFINE EVENT high_loop ON sched_high
  ASYNC RETRY 1 MAXDEPTH 1024
  WHEN $event = 'UPDATE' AND ($after.state = 'running' OR $after.state = 'ready')
  THEN {
    LET $running = (SELECT running FROM kernel_state LIMIT 1)[0].running ?? false;
    IF $running = true {
      fn::sched_high_tick(($after.tick ?? 0) + 1);
    };
  };

REMOVE EVENT IF EXISTS medium_loop ON sched_medium;
DEFINE EVENT medium_loop ON sched_medium
  ASYNC RETRY 1 MAXDEPTH 512
  WHEN $event = 'UPDATE' AND ($after.state = 'running' OR $after.state = 'ready')
  THEN {
    LET $running = (SELECT running FROM kernel_state LIMIT 1)[0].running ?? false;
    IF $running = true {
      fn::sched_medium_tick(($after.tick ?? 0) + 1);
    };
  };

REMOVE EVENT IF EXISTS low_loop ON sched_low;
DEFINE EVENT low_loop ON sched_low
  ASYNC RETRY 1 MAXDEPTH 256
  WHEN $event = 'UPDATE' AND ($after.state = 'running' OR $after.state = 'ready')
  THEN {
    LET $running = (SELECT running FROM kernel_state LIMIT 1)[0].running ?? false;
    IF $running = true {
      fn::sched_low_tick(($after.tick ?? 0) + 1);
    };
  };

-- ═══════════════════════════════════════════
-- 7. RESET FUNCTIONS — soft / safe_mode / hard
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::kernel_reset_soft() {
  -- Stop all circuits
  UPDATE kernel_state SET running = false;

  -- Clear volatile state
  UPDATE nn_node SET value = 0 WHERE true;
  DELETE kernel_event WHERE true;
  DELETE kernel_request WHERE true;

  -- Reset semaphores
  UPDATE sched_critical:main SET tick = 0, state = 'ready', interrupt_flags = [], error_count = 0, ticks_this_chain = 0;
  UPDATE sched_high:main SET tick = 0, state = 'ready', interrupt_flags = [], error_count = 0, ticks_this_chain = 0;
  UPDATE sched_medium:main SET tick = 0, state = 'ready', interrupt_flags = [], error_count = 0, ticks_this_chain = 0;
  UPDATE sched_low:main SET tick = 0, state = 'ready', interrupt_flags = [], error_count = 0, ticks_this_chain = 0;

  -- Reset kernel state (energy/fatigue) but keep config
  LET $cfg = (SELECT config FROM kernel_state LIMIT 1)[0].config ?? {};
  UPDATE kernel_state SET
    cycle = 0, energy = 1.0, fatigue = 0.0,
    cycles_since_sleep = 0, total_spent = 0.0,
    mode = 'default', debug_break = false,
    config = $cfg;

  -- Preserve: traces with weight > 0.3, self-traces, schemas, nn_edge weights, commit trail, narrative
  -- Clear: faded traces
  UPDATE trace SET archived = true WHERE weight < 0.1 AND archived = false;

  CREATE kernel_interrupt CONTENT { target: 'all', reason: 'reset_soft', source: 'system', ts: time::now() };
  RETURN { reset: 'soft', preserved: 'identity + strong traces + nn weights + commit trail' };
};

DEFINE FUNCTION OVERWRITE fn::kernel_reset_safe_mode() {
  -- Stop all circuits
  UPDATE kernel_state SET running = false;

  -- Clear volatile + conflicting state
  UPDATE nn_node SET value = 0 WHERE true;
  DELETE kernel_event WHERE true;
  DELETE kernel_request WHERE true;
  DELETE episodic WHERE true;

  -- Only CRITICAL ready, rest suspended
  UPDATE sched_critical:main SET tick = 0, state = 'ready', interrupt_flags = [], error_count = 0;
  UPDATE sched_high:main SET tick = 0, state = 'sleeping', interrupt_flags = [];
  UPDATE sched_medium:main SET tick = 0, state = 'sleeping', interrupt_flags = [];
  UPDATE sched_low:main SET tick = 0, state = 'sleeping', interrupt_flags = [];

  LET $cfg = (SELECT config FROM kernel_state LIMIT 1)[0].config ?? {};
  UPDATE kernel_state SET
    cycle = 0, energy = 1.0, fatigue = 0.0,
    cycles_since_sleep = 0, mode = 'safe_mode',
    debug_break = false, config = $cfg;

  UPDATE trace SET archived = true WHERE weight < 0.1;

  CREATE kernel_interrupt CONTENT { target: 'all', reason: 'reset_safe_mode', source: 'system', ts: time::now() };
  RETURN { reset: 'safe_mode', note: 'only CRITICAL loop active, others suspended' };
};

DEFINE FUNCTION OVERWRITE fn::kernel_reset_hard() {
  UPDATE kernel_state SET running = false;

  -- Clear almost everything
  UPDATE nn_node SET value = 0 WHERE true;
  UPDATE nn_edge SET weight = (rand::float() - 0.5) * 0.2, grad_acc = 0, update_count = 0 WHERE true;
  DELETE kernel_event WHERE true;
  DELETE kernel_request WHERE true;
  DELETE episodic WHERE true;

  -- Clear learned traces but keep commit trail + narrative
  UPDATE trace SET archived = true WHERE source_type != 'axiom';
  DELETE belief WHERE source_type != 'axiom' AND source_type != 'core';

  UPDATE sched_critical:main SET tick = 0, state = 'ready', interrupt_flags = [], error_count = 0;
  UPDATE sched_high:main SET tick = 0, state = 'ready', interrupt_flags = [], error_count = 0;
  UPDATE sched_medium:main SET tick = 0, state = 'ready', interrupt_flags = [], error_count = 0;
  UPDATE sched_low:main SET tick = 0, state = 'ready', interrupt_flags = [], error_count = 0;

  UPDATE kernel_state SET
    cycle = 0, energy = 1.0, fatigue = 0.0,
    cycles_since_sleep = 0, total_spent = 0.0,
    mode = 'default', debug_break = false, config = {};

  CREATE kernel_interrupt CONTENT { target: 'all', reason: 'reset_hard', source: 'system', ts: time::now() };
  RETURN { reset: 'hard', preserved: 'commit_log + narrative_frames + boot beliefs' };
};

-- ═══════════════════════════════════════════
-- 8. UPDATED kernel_start / kernel_stop / kernel_status
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::kernel_start() {
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

  -- Init semaphores with proper budget
  fn::init_semaphore('critical', 0, 1.0);
  fn::init_semaphore('high', 1, 0.4);
  fn::init_semaphore('medium', 2, 0.3);
  fn::init_semaphore('low', 3, 0.2);

  -- Kick all loops (UPDATE triggers EVENT chain)
  UPDATE sched_critical:main SET state = 'ready', tick = 1;
  UPDATE sched_high:main SET state = 'ready', tick = 1;
  UPDATE sched_medium:main SET state = 'ready', tick = 1;
  UPDATE sched_low:main SET state = 'ready', tick = 1;

  RETURN { started: true, circuits: ['critical', 'high', 'medium', 'low'] };
};

DEFINE FUNCTION OVERWRITE fn::kernel_stop() {
  UPDATE kernel_state SET running = false;
  UPDATE sched_critical:main SET state = 'sleeping';
  UPDATE sched_high:main SET state = 'sleeping';
  UPDATE sched_medium:main SET state = 'sleeping';
  UPDATE sched_low:main SET state = 'sleeping';
  CREATE kernel_interrupt CONTENT { target: 'all', reason: 'stop', source: 'external', ts: time::now() };
  RETURN { stopped: true };
};

DEFINE FUNCTION OVERWRITE fn::kernel_status() {
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  LET $crit = (SELECT * FROM sched_critical:main)[0] ?? {};
  LET $high = (SELECT * FROM sched_high:main)[0] ?? {};
  LET $med = (SELECT * FROM sched_medium:main)[0] ?? {};
  LET $low = (SELECT * FROM sched_low:main)[0] ?? {};
  LET $recent_interrupts = (SELECT * FROM kernel_interrupt ORDER BY ts DESC LIMIT 5);

  RETURN {
    running: $state.running ?? false,
    energy: $state.energy ?? 0,
    fatigue: $state.fatigue ?? 0,
    cycle: $state.cycle ?? 0,
    mode: $state.mode ?? 'unknown',
    debug_break: $state.debug_break ?? false,
    circuits: {
      critical: { state: $crit.state, tick: $crit.tick, budget: $crit.budget_remaining, errors: $crit.error_count },
      high: { state: $high.state, tick: $high.tick, budget: $high.budget_remaining, errors: $high.error_count },
      medium: { state: $med.state, tick: $med.tick, budget: $med.budget_remaining, errors: $med.error_count },
      low: { state: $low.state, tick: $low.tick, budget: $low.budget_remaining, errors: $low.error_count }
    },
    recent_interrupts: $recent_interrupts
  };
};
