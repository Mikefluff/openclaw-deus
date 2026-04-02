-- Migration 067: Fix edge creation
-- trace_state.trace field is empty — edge_sprout can't find trace records.
-- Fix: resolve trace_id → trace record ID directly via trace table.

-- Backfill trace_state.trace field from trace table
UPDATE trace_state SET trace = (SELECT id FROM trace WHERE trace_id = trace_state.trace_id LIMIT 1)[0].id
  WHERE trace IS NONE OR trace = NONE;

-- fn::edge_sprout — resolve trace records via trace_id, not trace_state.trace
DEFINE FUNCTION OVERWRITE fn::edge_sprout() {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $init_w = $cfg.sprout_initial_weight ?? 0.15;

  -- Find active trace with excess synaptic elements
  LET $source_state = (SELECT trace_id, synaptic_elements FROM trace_state
    WHERE archived = false AND (synaptic_elements ?? 0) > 1.0
    LIMIT 1)[0];
  IF $source_state IS NONE { RETURN { sprouted: 0 }; };

  -- Resolve trace record
  LET $source_rec = (SELECT id, position FROM trace WHERE trace_id = $source_state.trace_id LIMIT 1)[0];
  IF $source_rec IS NONE OR $source_rec.id IS NONE { RETURN { sprouted: 0 }; };

  -- Find candidate target traces (different from source, with elements)
  LET $candidates = (SELECT trace_id, synaptic_elements FROM trace_state
    WHERE archived = false AND trace_id != $source_state.trace_id
    AND (synaptic_elements ?? 0) > 0.5
    AND string::starts_with(content, 'self:') = false
    LIMIT 5);

  LET $before = (SELECT count() AS c FROM activates GROUP ALL)[0].c ?? 0;

  FOR $c IN $candidates {
    LET $target_rec = (SELECT id, position FROM trace WHERE trace_id = $c.trace_id LIMIT 1)[0];
    IF $target_rec IS NOT NONE AND $target_rec.id IS NOT NONE {
      -- Check not already connected
      LET $exists = (SELECT count() AS c FROM activates
        WHERE in = $source_rec.id AND out = $target_rec.id GROUP ALL)[0].c ?? 0;

      IF $exists = 0 {
        -- Cosine similarity check
        LET $sim = IF $source_rec.position IS NOT NONE AND $target_rec.position IS NOT NONE
          AND array::len($source_rec.position) > 0 AND array::len($target_rec.position) > 0
          THEN vector::similarity::cosine($source_rec.position, $target_rec.position)
          ELSE 0.3 END;

        IF $sim > 0.2 OR rand::float() < 0.1 {
          RELATE ($source_rec.id)->activates->($target_rec.id) SET
            weight = $init_w * math::max([0.1, $sim]),
            eligibility = 0,
            co_activation_count = 0;

          UPDATE trace_state SET synaptic_elements = math::max([0.0, (synaptic_elements ?? 1) - 0.5])
            WHERE trace_id = $source_state.trace_id;
          UPDATE trace_state SET synaptic_elements = math::max([0.0, (synaptic_elements ?? 1) - 0.3])
            WHERE trace_id = $c.trace_id;

          RETURN { sprouted: 1, similarity: $sim };
        };
      };
    };
  };

  LET $after = (SELECT count() AS c FROM activates GROUP ALL)[0].c ?? 0;
  RETURN { sprouted: $after - $before };
};

-- fn::learn_edge — resolve via trace_id too, and CREATE new edges when needed
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

  LET $edge = (SELECT * FROM activates WHERE in = $from_id AND out = $to_id LIMIT 1)[0];

  IF $edge != NONE {
    LET $new_elig = $lambda * ($edge.eligibility ?? 0) + $pre * $post;
    LET $new_w = math::clamp(($edge.weight ?? 0.3) + $lr * $new_elig * $M * $sim_mod, 0.01, 1.0);
    UPDATE activates SET
      eligibility = $new_elig, weight = $new_w,
      co_activation_count = (co_activation_count ?? 0) + 1
    WHERE in = $from_id AND out = $to_id;
  } ELSE {
    -- Create new edge (re-enabled — with guards)
    IF $from_id IS NOT NONE AND $to_id IS NOT NONE AND $from_id != $to_id {
      LET $init_w = math::clamp(($cfg.initial_edge_weight ?? 0.3) + $lr * $pre * $post * $M * $sim_mod, 0.01, 1.0);
      RELATE ($from_id)->activates->($to_id) SET
        weight = $init_w,
        eligibility = $pre * $post,
        co_activation_count = 1;
    };
  };

  RETURN true;
};
