-- Migration 048: Reactive Membrane
-- Brain ticks autonomously via ASYNC EVENT.
-- Membrane subscribes via LIVE SELECT on kernel_request.
-- 0 roundtrips from JS per tick. JS only reacts to events.
--
-- Flow:
-- 1. fn::start_brain() → sets running=true → triggers kernel_heartbeat
-- 2. kernel_heartbeat → fn::brain_tick_auto() → updates kernel_state → re-triggers
-- 3. When brain wants action → CREATE kernel_request → membrane sees via LIVE SELECT
-- 4. Membrane executes action in world → CREATE sensory_input (new table)
-- 5. sensory_input_event → fn::process_sensory + fn::cognitive_cycle → back to brain_tick

-- ═══════════════════════════════════════════
-- 1. NEW TABLE: sensory_input — membrane writes world results here
-- Brain picks up via EVENT, not polling
-- ═══════════════════════════════════════════

DEFINE TABLE OVERWRITE sensory_input SCHEMALESS;

-- ═══════════════════════════════════════════
-- 2. fn::brain_tick_auto — one tick iteration (not loop)
-- Called by EVENT, does ONE brain_tick(100) + processes pending sensory inputs
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::brain_tick_auto() {
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  IF $state = NONE OR ($state.running ?? false) = false { RETURN { ticked: false }; };

  -- Process any pending sensory inputs (from membrane)
  LET $inputs = (SELECT * FROM sensory_input WHERE status = 'pending' LIMIT 5);
  FOR $inp IN $inputs {
    -- Process sensory
    LET $sensory = fn::process_sensory(
      $inp.action_id ?? 0,
      $inp.channels ?? [],
      $inp.speech ?? [],
      $inp.valence ?? 0,
      $inp.object_idx ?? 0
    );

    -- If this is an action consequence, run cognitive cycle
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

  -- Run brain internal tick
  fn::brain_tick(100);

  -- Mark completed requests
  UPDATE kernel_request SET status = 'completed'
    WHERE status = 'processing' OR (status = 'pending' AND created_at < time::now() - 10s);

  RETURN { ticked: true, cycle: (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0 };
};

-- ═══════════════════════════════════════════
-- 3. EVENT: kernel_heartbeat — self-triggering brain tick
-- When kernel_state updates + running=true → tick again
-- MAXDEPTH 1024 = ~1024 ticks per chain, then needs re-kick
-- ═══════════════════════════════════════════

DEFINE EVENT OVERWRITE kernel_heartbeat ON kernel_state
  ASYNC RETRY 1 MAXDEPTH 1024
  WHEN $event = 'UPDATE'
    AND $after.running = true
    AND ($after.debug_break ?? false) = false
  THEN {
    fn::brain_tick_auto();
  };

-- ═══════════════════════════════════════════
-- 4. EVENT: sensory_input_event — process new sensory data
-- When membrane writes sensory_input → brain picks it up
-- ═══════════════════════════════════════════

DEFINE EVENT OVERWRITE sensory_input_event ON sensory_input
  WHEN $event = 'CREATE' AND $after.status = 'pending'
  THEN {
    -- Brain will process this on next brain_tick_auto iteration
    -- No need to do anything here — brain_tick_auto reads pending inputs
    -- This event just ensures the brain wakes up if sleeping
    LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
    IF ($state.running ?? false) = false {
      UPDATE kernel_state SET running = true;
    };
  };

-- ═══════════════════════════════════════════
-- 5. fn::start_brain — kick off autonomous brain
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::start_brain() {
  UPDATE kernel_state SET running = true, debug_break = false;
  -- The UPDATE triggers kernel_heartbeat EVENT → brain starts ticking
  RETURN { started: true };
};

-- ═══════════════════════════════════════════
-- 6. fn::stop_brain — graceful stop
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::stop_brain() {
  UPDATE kernel_state SET running = false;
  RETURN { stopped: true };
};

-- ═══════════════════════════════════════════
-- 7. fn::pause_brain — temporary pause (debug)
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::pause_brain() {
  UPDATE kernel_state SET debug_break = true;
  RETURN { paused: true };
};

-- ═══════════════════════════════════════════
-- 8. Self re-kick: when MAXDEPTH exhausted, brain writes to _ping
--    → EVENT on _ping re-kicks kernel_state → heartbeat restarts
-- ═══════════════════════════════════════════

DEFINE TABLE OVERWRITE _ping SCHEMALESS;

DEFINE EVENT OVERWRITE ping_rekick ON _ping
  WHEN $event = 'CREATE' OR $event = 'UPDATE'
  THEN {
    -- Re-kick: touch kernel_state to restart heartbeat EVENT chain
    LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
    IF ($state.running ?? false) = true AND ($state.debug_break ?? false) = false {
      UPDATE kernel_state SET _rekick = rand::float();
    };
  };

-- Modify brain_tick_auto: at end of MAXDEPTH chain, write _ping
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

  -- Brain tick
  fn::brain_tick(100);

  -- Clean old requests
  UPDATE kernel_request SET status = 'completed'
    WHERE status = 'processing';

  -- Self re-kick: write to _ping so the chain can restart after MAXDEPTH
  UPDATE _ping SET cycle = (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0;

  RETURN { ticked: true, cycle: (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0 };
};
