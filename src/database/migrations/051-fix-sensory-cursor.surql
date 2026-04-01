-- Migration 051: Fix Sensory Cursor
-- Problem: sensory_input IDs are random (not sequential), so WHERE id > cursor is broken.
-- Fix: use sequential counter field. Brain tracks last processed seq number.

DEFINE INDEX IF NOT EXISTS idx_sensory_seq ON sensory_input FIELDS seq;

-- brain_tick_auto: use seq cursor instead of id cursor
DEFINE FUNCTION OVERWRITE fn::brain_tick_auto() {
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  IF $state = NONE OR ($state.running ?? false) = false { RETURN { ticked: false }; };

  -- Read new sensory inputs by sequential counter
  LET $cursor = $state.sensory_seq ?? 0;
  LET $inputs = (SELECT * FROM sensory_input WHERE seq > $cursor LIMIT 10);

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
    -- Advance cursor using .map (LET doesn't mutate in FOR)
    LET $seqs = $inputs.map(|$i| $i.seq ?? 0);
    LET $max_seq = math::max($seqs) ?? $cursor;
    UPDATE kernel_state SET sensory_seq = $max_seq;
  };

  fn::brain_tick(100);

  -- Mark old requests done
  UPDATE kernel_request SET status = 'done'
    WHERE status = 'pending' AND created_at < time::now() - 500ms;

  -- Self-pump
  UPDATE _tick SET cycle = (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0;

  RETURN { ticked: true };
};

-- fn::start_brain: reset seq cursor
DEFINE FUNCTION OVERWRITE fn::start_brain() {
  UPDATE kernel_state SET running = true, debug_break = false, sensory_seq = 0;
  LET $exists = (SELECT count() AS c FROM _tick GROUP ALL)[0].c ?? 0;
  IF $exists = 0 { CREATE _tick SET cycle = 0; }
  ELSE { UPDATE _tick SET cycle = 0; };
  RETURN true;
};
