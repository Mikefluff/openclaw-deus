-- Migration 066: Fix kernel_request lifecycle
-- Brain creates requests, membrane/curriculum reads and marks them completed.
-- brain_tick_auto should NOT auto-clear requests — that's membrane's job.

DEFINE FUNCTION OVERWRITE fn::brain_tick_auto() {
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  IF $state = NONE OR ($state.running ?? false) = false { RETURN { ticked: false }; };

  -- Process pending sensory inputs
  LET $cursor = $state.sensory_seq ?? 0;
  LET $inputs = (SELECT * FROM sensory_input WHERE seq > $cursor LIMIT 20);

  FOR $inp IN $inputs {
    fn::process_one_input($inp);
  };

  IF array::len($inputs) > 0 {
    LET $seqs = $inputs.map(|$i| $i.seq ?? 0);
    LET $max_seq = math::max($seqs) ?? $cursor;
    UPDATE kernel_state SET sensory_seq = $max_seq;
  };

  -- Brain tick
  fn::brain_tick(200);

  -- NO auto-clear of kernel_request — membrane/curriculum handles that

  RETURN { ticked: true };
};
