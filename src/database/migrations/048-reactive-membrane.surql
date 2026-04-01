-- Migration 048: Reactive Membrane with TRUE Async Events
-- Each brain tick = separate transaction (ASYNC EVENT).
-- LIVE SELECT sees results immediately after each tick commits.
-- Docker: --async-event-interval 100ms for low latency.
--
-- Architecture:
--   kernel_state UPDATE → kernel_heartbeat ASYNC EVENT → fn::brain_tick_auto()
--   fn::brain_tick_auto() → brain_tick(100) + process sensory inputs
--   brain creates kernel_request → LIVE SELECT in membrane → world.act()
--   membrane writes sensory_input → sensory_wakeup ASYNC EVENT → brain processes

-- ═══════════════════════════════════════════
-- 1. TABLES
-- ═══════════════════════════════════════════

DEFINE TABLE OVERWRITE sensory_input SCHEMALESS;
DEFINE TABLE OVERWRITE _ping SCHEMALESS;

-- CHANGEFEED on kernel_request for membrane consumption
DEFINE TABLE OVERWRITE kernel_request SCHEMALESS CHANGEFEED 1h;

-- ═══════════════════════════════════════════
-- 2. fn::brain_tick_auto — one tick, commits as separate transaction
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::brain_tick_auto() {
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  IF $state = NONE OR ($state.running ?? false) = false { RETURN { ticked: false }; };

  -- Process pending sensory inputs from membrane
  LET $inputs = (SELECT * FROM sensory_input WHERE status = 'pending' LIMIT 5);
  FOR $inp IN $inputs {
    LET $sensory = fn::process_sensory(
      $inp.action_id ?? 0,
      $inp.channels ?? [],
      $inp.speech ?? [],
      $inp.valence ?? 0,
      $inp.object_idx ?? 0
    );
    IF $inp.is_consequence = true AND $sensory.trace_id IS NOT NONE {
      fn::cognitive_cycle(
        $sensory.trace_id,
        $inp.action_method ?? 'touch',
        $inp.target_content ?? '',
        $inp.valence ?? 0
      );
    };
    UPDATE sensory_input SET status = 'processed' WHERE id = $inp.id;
  };

  -- Brain tick (100 internal iterations)
  fn::brain_tick(100);

  -- Clean completed requests
  UPDATE kernel_request SET status = 'completed' WHERE status = 'processing';

  RETURN { ticked: true, cycle: (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0 };
};

-- ═══════════════════════════════════════════
-- 3. TICK PUMP: _tick table + ASYNC EVENT
-- Each write to _tick triggers ONE brain_tick_auto in a SEPARATE async batch.
-- brain_tick_auto writes to _tick again → next async batch → next tick.
-- MAXDEPTH 1 = no cascading within same batch → each tick = own transaction.
-- ═══════════════════════════════════════════

DEFINE TABLE OVERWRITE _tick SCHEMALESS;

-- This EVENT fires ONCE per async processing interval (100ms).
-- No cascading (MAXDEPTH 1): brain_tick_auto creates new _tick record
-- → but that CREATE triggers next event in NEXT interval, not same one.
DEFINE EVENT OVERWRITE tick_pump ON _tick
  ASYNC RETRY 1 MAXDEPTH 1
  WHEN $event = 'CREATE' OR $event = 'UPDATE'
  THEN {
    LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
    IF ($state.running ?? false) = true AND ($state.debug_break ?? false) = false {
      fn::brain_tick_auto();
    };
  };

-- brain_tick_auto now pumps the next tick by writing to _tick
DEFINE FUNCTION OVERWRITE fn::brain_tick_auto() {
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  IF $state = NONE OR ($state.running ?? false) = false { RETURN { ticked: false }; };

  -- Process pending sensory inputs from membrane
  LET $inputs = (SELECT * FROM sensory_input WHERE status = 'pending' LIMIT 5);
  FOR $inp IN $inputs {
    LET $sensory = fn::process_sensory(
      $inp.action_id ?? 0,
      $inp.channels ?? [],
      $inp.speech ?? [],
      $inp.valence ?? 0,
      $inp.object_idx ?? 0
    );
    IF $inp.is_consequence = true AND $sensory.trace_id IS NOT NONE {
      fn::cognitive_cycle(
        $sensory.trace_id,
        $inp.action_method ?? 'touch',
        $inp.target_content ?? '',
        $inp.valence ?? 0
      );
    };
    UPDATE sensory_input SET status = 'processed' WHERE id = $inp.id;
  };

  fn::brain_tick(100);

  -- Clean completed requests
  UPDATE kernel_request SET status = 'completed' WHERE status = 'processing';

  -- PUMP: schedule next tick (creates _tick record → triggers tick_pump in NEXT async batch)
  UPDATE _tick SET cycle = (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0;

  RETURN { ticked: true };
};

-- ═══════════════════════════════════════════
-- 4. sensory_wakeup — wake brain on new sensory input
-- ═══════════════════════════════════════════

DEFINE EVENT OVERWRITE sensory_wakeup ON sensory_input
  ASYNC RETRY 1 MAXDEPTH 1
  WHEN $event = 'CREATE' AND $after.status = 'pending'
  THEN {
    LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
    IF ($state.running ?? false) = false {
      UPDATE kernel_state SET running = true;
    };
  };

-- ═══════════════════════════════════════════
-- 5. fn::start_brain / stop_brain / pause_brain
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::start_brain() {
  UPDATE kernel_state SET running = true, debug_break = false;
  -- Kick the tick pump (first _tick triggers tick_pump EVENT)
  UPDATE _tick SET cycle = 0;
  RETURN { started: true };
};

DEFINE FUNCTION OVERWRITE fn::stop_brain() {
  UPDATE kernel_state SET running = false;
  RETURN { stopped: true };
};

DEFINE FUNCTION OVERWRITE fn::pause_brain() {
  UPDATE kernel_state SET debug_break = true;
  RETURN { paused: true };
};
