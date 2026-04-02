-- Migration 062: Resilient brain_tick_auto
-- Brain ticks autonomously via ASYNC tick_pump. Membrane only feeds sensory_input.
-- brain_tick_auto must NEVER crash — process inputs safely, tick, pump.
-- Split sensory processing from brain_tick to avoid transaction conflicts.

-- fn::process_one_input — process a single sensory input safely
-- Must NEVER crash — brain_tick_auto depends on it for pump chain continuity
DEFINE FUNCTION OVERWRITE fn::process_one_input($inp: object) {
  LET $action = $inp.action_id ?? 0;

  IF $action < 0 {
    fn::process_speech($inp.speech ?? [], $inp.valence ?? 0);
    RETURN true;
  };

  fn::process_sensory($action, $inp.channels ?? [], $inp.speech ?? [],
    $inp.valence ?? 0, $inp.object_idx ?? 0);

  IF $inp.is_consequence = true {
    LET $tkey = type::string($action) + ':' + type::string($inp.object_idx ?? 0);
    LET $tr = (SELECT trace_id FROM trace_state WHERE content = $tkey AND archived = false LIMIT 1)[0];
    IF $tr IS NOT NONE AND $tr.trace_id IS NOT NONE {
      fn::cognitive_cycle($tr.trace_id, $action, $tkey, $inp.valence ?? 0);
    };
  };

  RETURN true;
};

-- fn::learn_edge — NEVER RELATE new edges (causes RELATE NONE crash in ASYNC)
-- Only UPDATE existing edges. New edges created by fn::edge_sprout.
DEFINE FUNCTION OVERWRITE fn::learn_edge(
  $from_id: record, $to_id: record, $valence: float, $pred_error: float
) {
  LET $from = (SELECT * FROM $from_id)[0];
  LET $to = (SELECT * FROM $to_id)[0];
  IF $from = NONE OR $to = NONE { RETURN false; };

  LET $dopamine = (SELECT * FROM nn_node WHERE node_id = 'hormone:dopamine' LIMIT 1)[0].value ?? 0.5;
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $lr = $cfg.hebbian_lr ?? 0.01;
  LET $gamma = $cfg.td_gamma ?? 0.9;
  LET $lambda = $cfg.eligibility_decay ?? 0.95;

  LET $pre = ($from.weight ?? 0.5) * ($from.freshness ?? 1.0);
  LET $post = ($to.weight ?? 0.5) * ($to.freshness ?? 1.0);
  LET $td = $valence + $gamma * ($to.weight ?? 0.5) - ($from.weight ?? 0.5);
  LET $surprise = 1.0 - math::pow(math::E, 0.0 - $pred_error * $pred_error);
  LET $M = $dopamine * $td + (1.0 - $dopamine) * $surprise;

  LET $sim = IF $from.position IS NOT NONE AND $to.position IS NOT NONE
    AND array::len($from.position) > 0 AND array::len($to.position) > 0
    THEN vector::similarity::cosine($from.position, $to.position)
    ELSE 0.5
  END;
  LET $sim_mod = math::max([0.1, $sim]);

  -- ONLY update existing edges (no RELATE — prevents NONE crash in ASYNC chain)
  LET $edge = (SELECT * FROM activates WHERE in = $from_id AND out = $to_id LIMIT 1)[0];
  IF $edge != NONE {
    LET $new_elig = $lambda * ($edge.eligibility ?? 0) + $pre * $post;
    LET $new_w = math::clamp(($edge.weight ?? 0.3) + $lr * $new_elig * $M * $sim_mod, 0.01, 1.0);
    UPDATE activates SET
      eligibility = $new_elig, weight = $new_w,
      co_activation_count = (co_activation_count ?? 0) + 1
    WHERE in = $from_id AND out = $to_id;

    CREATE learning_event SET
      edge_in = $from_id, edge_out = $to_id,
      weight_before = $edge.weight ?? 0, weight_after = $new_w,
      dopamine = $dopamine, eligibility = $new_elig, modulator = $M,
      cosine_sim = $sim, pred_error = $pred_error,
      cycle = (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0;
  };
  -- No ELSE RELATE — edge_sprout handles new edge creation safely

  RETURN true;
};

-- fn::brain_tick_auto — resilient autonomous tick
-- Process inputs ONE AT A TIME (each advances cursor independently).
-- Then tick brain. Then pump.
DEFINE FUNCTION OVERWRITE fn::brain_tick_auto() {
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  IF $state = NONE OR ($state.running ?? false) = false { RETURN { ticked: false }; };

  -- Process pending sensory inputs (up to 20 per call)
  LET $cursor = $state.sensory_seq ?? 0;
  LET $inputs = (SELECT * FROM sensory_input WHERE seq > $cursor LIMIT 20);

  -- Process each input
  FOR $inp IN $inputs {
    fn::process_one_input($inp);
  };

  -- Advance cursor past all processed inputs (use .map to get max seq)
  IF array::len($inputs) > 0 {
    LET $seqs = $inputs.map(|$i| $i.seq ?? 0);
    LET $max_seq = math::max($seqs) ?? $cursor;
    UPDATE kernel_state SET sensory_seq = $max_seq;
  };

  -- Brain tick (200 = at least 1 agency_tick at freq_agency=200)
  fn::brain_tick(200);

  -- Clean old requests
  UPDATE kernel_request SET status = 'done'
    WHERE status = 'pending' AND created_at < time::now() - 500ms;

  -- Self-pump: trigger next tick_pump event
  LET $exists = (SELECT count() AS c FROM _tick GROUP ALL)[0].c ?? 0;
  IF $exists = 0 { CREATE _tick SET cycle = (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0; }
  ELSE { UPDATE _tick SET cycle = (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0; };

  RETURN { ticked: true, processed: $processed };
};

-- fn::start_brain — start autonomous ticking
DEFINE FUNCTION OVERWRITE fn::start_brain() {
  UPDATE kernel_state SET running = true, debug_break = false, sensory_seq = 0;
  LET $exists = (SELECT count() AS c FROM _tick GROUP ALL)[0].c ?? 0;
  IF $exists = 0 { CREATE _tick SET cycle = 0; }
  ELSE { UPDATE _tick SET cycle = 0; };
  RETURN true;
};

-- Ensure tick_pump event exists
DEFINE EVENT OVERWRITE tick_pump ON _tick
  ASYNC RETRY 1 MAXDEPTH 16
  WHEN $event = 'CREATE' OR $event = 'UPDATE'
  THEN {
    LET $s = (SELECT * FROM kernel_state LIMIT 1)[0];
    IF $s.running ?? false = true { fn::brain_tick_auto() };
  };
