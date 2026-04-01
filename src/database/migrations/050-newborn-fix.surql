-- Migration 050: Fix Autonomous Brain
-- All writes to brain tables happen ONLY in brain_tick_auto (ASYNC event).
-- Membrane ONLY writes to sensory_input (inbox). Brain reads it, never writes it.
-- process_sensory is idempotent on reactivation → safe to re-process.

DEFINE TABLE OVERWRITE kernel_request SCHEMALESS;
DEFINE TABLE OVERWRITE brain_action SCHEMALESS;
DEFINE TABLE OVERWRITE sensory_input SCHEMALESS;

UPDATE kernel_state SET
  config.energy_drain_rate = 0.002,
  config.fatigue_rate = 0.001,
  config.sleep_threshold = 0.1,
  config.sleep_energy_restore = 0.8,
  config.default_energy_drain_rate = 0.002,
  config.default_fatigue_rate = 0.001,
  config.default_sleep_threshold = 0.1;

-- brain_tick_auto: reads sensory_input (SELECT only), processes, ticks.
-- Tracks last processed sensory_input id in kernel_state to avoid reprocessing.
DEFINE FUNCTION OVERWRITE fn::brain_tick_auto() {
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  IF $state = NONE OR ($state.running ?? false) = false { RETURN { ticked: false }; };

  -- Read new sensory inputs (after last processed)
  LET $cursor = $state.last_sensory_id;
  LET $inputs = IF $cursor IS NONE THEN
    (SELECT * FROM sensory_input LIMIT 10)
  ELSE
    (SELECT * FROM sensory_input WHERE id > $cursor LIMIT 10)
  END;

  IF array::len($inputs) > 0 {
    FOR $inp IN $inputs {
      fn::process_sensory(
        $inp.action_id ?? 0, $inp.channels ?? [], $inp.speech ?? [],
        $inp.valence ?? 0, $inp.object_idx ?? 0
      );
      IF $inp.is_consequence = true {
        LET $tkey = type::string($inp.action_id ?? 0) + ':' + type::string($inp.object_idx ?? 0);
        LET $tr = (SELECT trace_id FROM trace_state WHERE content = $tkey AND archived = false LIMIT 1)[0];
        IF $tr IS NOT NONE AND $tr.trace_id IS NOT NONE {
          fn::cognitive_cycle($tr.trace_id, $inp.action_method ?? 'touch',
            $inp.target_content ?? '', $inp.valence ?? 0);
        };
      };
    };
    -- Save cursor: use .map to get last id
    LET $ids = $inputs.map(|$i| $i.id);
    LET $last_id = $ids[array::len($ids) - 1];
    IF $last_id IS NOT NONE {
      UPDATE kernel_state SET last_sensory_id = $last_id;
    };
  };

  -- Brain tick
  fn::brain_tick(100);

  -- Brain marks old requests done
  UPDATE kernel_request SET status = 'done'
    WHERE status = 'pending' AND created_at < time::now() - 500ms;

  -- Self-pump
  UPDATE _tick SET cycle = (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0;

  RETURN { ticked: true };
};

-- tick_pump: ASYNC self-loop MAXDEPTH 16 (re-kicked by membrane every 200ms)
DEFINE EVENT OVERWRITE tick_pump ON _tick
  ASYNC RETRY 1 MAXDEPTH 16
  WHEN $event = 'CREATE' OR $event = 'UPDATE'
  THEN {
    LET $s = (SELECT * FROM kernel_state LIMIT 1)[0];
    IF ($s.running ?? false) = true { fn::brain_tick_auto(); };
  };

-- Remove old conflicting events
REMOVE EVENT IF EXISTS sensory_wakeup ON sensory_input;
REMOVE EVENT IF EXISTS sensory_process ON sensory_input;
REMOVE EVENT IF EXISTS kernel_heartbeat ON kernel_state;

DEFINE FUNCTION OVERWRITE fn::start_brain() {
  UPDATE kernel_state SET running = true, debug_break = false, last_sensory_id = NONE;
  -- Ensure _tick record exists, then update to trigger event
  LET $exists = (SELECT count() AS c FROM _tick GROUP ALL)[0].c ?? 0;
  IF $exists = 0 { CREATE _tick SET cycle = 0; }
  ELSE { UPDATE _tick SET cycle = 0; };
  RETURN true;
};

DEFINE FUNCTION OVERWRITE fn::stop_brain() {
  UPDATE kernel_state SET running = false;
  RETURN true;
};
