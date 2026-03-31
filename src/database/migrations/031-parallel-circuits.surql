-- Migration 031: Parallel Circuit Functions + Pointer Architecture Fixes
-- 4 circuits run on separate connections, no transaction conflicts.
-- Archive never delete (pointer architecture: computational memory).

-- ═══════════════════════════════════════════
-- 1. CIRCUIT FUNCTIONS (each writes own semaphore only)
-- ═══════════════════════════════════════════

-- CRITICAL: energy master, only writer to kernel_state
DEFINE FUNCTION OVERWRITE fn::circuit_critical($n: int) {
  FOR $x IN 0..$n {
    IF $x % 100 = 0 {
      UPDATE kernel_state SET
        cycle = (cycle ?? 0) + 100,
        energy = math::max([0.0, (energy ?? 1.0) - 0.2]),
        fatigue = math::min([1.0, (fatigue ?? 0.0) + 0.1]);
      LET $e = (SELECT energy FROM kernel_state LIMIT 1)[0].energy ?? 0;
      IF $e < 0.1 {
        fn::sleep_consolidation(0.001);
        UPDATE kernel_state SET energy = math::min([1.5, energy + 0.8]), fatigue = 0.0;
      };
    };
  };
  UPDATE sched_critical:main SET tick = $n, last_run = time::now();
  RETURN $n;
};

-- HIGH: affect forward + trace decay (writes sched_high only)
DEFINE FUNCTION OVERWRITE fn::circuit_high($n: int) {
  FOR $x IN 0..$n {
    IF $x % 10 = 0 {
      fn::nn_forward('affect', 'input', 'hidden');
    };
    IF $x % 5 = 0 {
      UPDATE trace SET weight = weight * 0.999, freshness = freshness * 0.999
        WHERE archived = false AND weight > 0.05;
    };
  };
  UPDATE sched_high:main SET tick = $n, last_run = time::now();
  RETURN $n;
};

-- MEDIUM: inference + forgetting (writes sched_medium only)
DEFINE FUNCTION OVERWRITE fn::circuit_medium($n: int) {
  FOR $x IN 0..$n {
    IF $x % 5 = 0 { fn::active_inference(0.3, 5); };
    IF $x % 10 = 0 { fn::forget_traces(0.02, 0.03); };
    IF $x % 20 = 0 { fn::belief_decay(0.005); };
  };
  UPDATE sched_medium:main SET tick = $n, last_run = time::now();
  RETURN $n;
};

-- LOW: deep synthesis (writes sched_low only)
DEFINE FUNCTION OVERWRITE fn::circuit_low($n: int) {
  FOR $x IN 0..$n {
    IF $x % 10 = 0 { fn::nn_decay_all(0.001); };
    IF $x % 50 = 0 { fn::build_world_model(); };
    IF $x % 100 = 0 { fn::introspect(); };
    IF $x % 20 = 0 { fn::consolidate_episodic(3); };
    IF $x % 50 = 0 { fn::narrative_compact(50); };
  };
  UPDATE sched_low:main SET tick = $n, last_run = time::now();
  RETURN $n;
};

-- ═══════════════════════════════════════════
-- 2. fn::run_parallel — kick all 4 circuits with correct ratios
-- Called from NestJS with 4 parallel connections
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::run_parallel_status() {
  LET $state = (SELECT cycle, energy, fatigue FROM kernel_state LIMIT 1)[0];
  LET $crit = (SELECT tick, last_run FROM sched_critical:main)[0];
  LET $high = (SELECT tick, last_run FROM sched_high:main)[0];
  LET $med = (SELECT tick, last_run FROM sched_medium:main)[0];
  LET $low = (SELECT tick, last_run FROM sched_low:main)[0];
  RETURN {
    cycle: $state.cycle ?? 0,
    energy: $state.energy ?? 0,
    fatigue: $state.fatigue ?? 0,
    critical_tick: $crit.tick ?? 0,
    high_tick: $high.tick ?? 0,
    medium_tick: $med.tick ?? 0,
    low_tick: $low.tick ?? 0
  };
};

-- ═══════════════════════════════════════════
-- 3. FIX: Archive, never delete (Pointer Architecture)
-- Pointers are computational memory — deleting destroys history
-- ═══════════════════════════════════════════

-- Override forget_traces: ARCHIVE instead of DELETE
DEFINE FUNCTION OVERWRITE fn::forget_traces($base_decay: float, $archive_threshold: float) {
  UPDATE trace SET
    freshness = freshness * (1.0 - $base_decay)
  WHERE archived = false AND suppressed = false;

  LET $archived = (UPDATE trace SET archived = true
    WHERE archived = false AND weight * freshness < $archive_threshold
    RETURN BEFORE);

  RETURN { archived: array::len($archived) };
};

-- Override nn_decay: set weight to 0 (dead synapse), never DELETE edge
DEFINE FUNCTION OVERWRITE fn::nn_decay($model: string, $decay_rate: float) {
  UPDATE nn_edge SET
    weight = weight * (1.0 - $decay_rate),
    grad_acc = grad_acc * 0.9
  WHERE in.model = $model AND update_count > 0;

  UPDATE nn_edge SET weight = 0.0
  WHERE in.model = $model AND math::abs(weight) < 0.001 AND update_count > 10;

  RETURN true;
};

-- Override sleep_consolidation: archive weak, never delete
DEFINE FUNCTION OVERWRITE fn::sleep_consolidation($decay_rate: float) {
  LET $consolidated = fn::consolidate_episodic(3);

  UPDATE activates SET weight = math::min([1.0, weight * 1.05])
    WHERE co_activation_count > 5 AND weight > 0.3;

  UPDATE activates SET weight = weight * 0.95 WHERE weight < 0.2;

  -- Archive (NOT delete) very weak edges
  UPDATE activates SET weight = 0.0 WHERE weight < 0.02;

  LET $sleep_rate = $decay_rate * 5.0;
  fn::nn_decay('affect', $sleep_rate);
  fn::nn_decay('cone', $sleep_rate);
  fn::nn_decay('predictor', $sleep_rate);

  LET $archived = (UPDATE trace SET archived = true
    WHERE archived = false AND weight * freshness < 0.02
    RETURN BEFORE);

  RETURN {
    consolidated: $consolidated.consolidated ?? 0,
    archived: array::len($archived)
  };
};
