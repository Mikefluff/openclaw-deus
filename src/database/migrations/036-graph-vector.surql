-- Migration 036: Graph × Vector Integration
-- Spreading activation weighted by cosine similarity.
-- Edge learning modulated by positional proximity.
-- Edge pruning for vector-dissimilar connections.

-- ═══════════════════════════════════════════
-- 1. fn::learn_edge — add cosine similarity modulation
-- Δw = η × eligibility × M × cosine_similarity
-- Similar traces → stronger learning signal
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::learn_edge(
  $from_id: record, $to_id: record, $valence: float, $pred_error: float
) {
  LET $from = (SELECT * FROM $from_id)[0];
  LET $to = (SELECT * FROM $to_id)[0];
  IF $from = NONE OR $to = NONE { RETURN false; };

  LET $dopamine = (SELECT * FROM nn_node WHERE node_id = 'hormone:dopamine' LIMIT 1)[0].value ?? 0.5;
  LET $cfg = (SELECT * FROM kernel_state LIMIT 1)[0].config ?? {};
  LET $lr = $cfg.hebbian_lr ?? 0.01;
  LET $gamma = $cfg.td_gamma ?? 0.9;
  LET $lambda = $cfg.eligibility_decay ?? 0.95;

  LET $pre = ($from.weight ?? 0.5) * ($from.freshness ?? 1.0);
  LET $post = ($to.weight ?? 0.5) * ($to.freshness ?? 1.0);
  LET $td = $valence + $gamma * ($to.weight ?? 0.5) - ($from.weight ?? 0.5);
  LET $surprise = 1.0 - math::pow(math::E, 0.0 - $pred_error * $pred_error);
  LET $M = $dopamine * $td + (1.0 - $dopamine) * $surprise;

  -- Vector similarity: similar traces get stronger learning signal
  LET $sim = IF $from.position IS NOT NONE AND $to.position IS NOT NONE
    AND array::len($from.position) > 0 AND array::len($to.position) > 0
    THEN vector::similarity::cosine($from.position, $to.position)
    ELSE 0.5
  END;
  LET $sim_mod = math::max([0.1, $sim]); -- minimum 0.1 to not kill learning entirely

  LET $edge = (SELECT * FROM activates WHERE in = $from_id AND out = $to_id LIMIT 1)[0];

  IF $edge != NONE {
    UPDATE activates SET
      eligibility = $lambda * (eligibility ?? 0) + $pre * $post,
      weight = math::clamp(weight + $lr * ($lambda * (eligibility ?? 0) + $pre * $post) * $M * $sim_mod, 0.01, 1.0),
      co_activation_count = (co_activation_count ?? 0) + 1
    WHERE in = $from_id AND out = $to_id;
  } ELSE {
    RELATE ($from_id)->activates->($to_id) SET
      weight = math::clamp(($cfg.initial_edge_weight ?? 0.3) + $lr * $pre * $post * $M * $sim_mod, 0.01, 1.0),
      eligibility = $pre * $post,
      co_activation_count = 1;
  };

  RETURN true;
};

-- ═══════════════════════════════════════════
-- 2. fn::prune_dissimilar_edges — remove edges between unrelated traces
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::prune_dissimilar_edges($min_similarity: float) {
  -- Edges between traces with very different sensory signatures = noise
  LET $pruned = (UPDATE activates SET weight = 0.0
    WHERE in.position IS NOT NONE AND out.position IS NOT NONE
    AND array::len(in.position) > 0 AND array::len(out.position) > 0
    AND vector::similarity::cosine(in.position, out.position) < $min_similarity
    AND weight < 0.3
    RETURN BEFORE);
  RETURN { pruned: array::len($pruned) };
};

-- ═══════════════════════════════════════════
-- 3. fn::graph_vector_retrieve — hybrid graph+vector retrieval
-- Combines graph proximity with vector similarity using RRF
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::graph_vector_retrieve($source_id: record, $k: int) {
  -- Graph neighbors (up to 2 hops)
  LET $graph = (SELECT id, trace_id, weight FROM $source_id->activates->trace
    WHERE archived = false LIMIT 20);

  -- Vector neighbors (KNN on position)
  LET $source_pos = (SELECT * FROM $source_id)[0].position;
  LET $vector = IF $source_pos IS NOT NONE AND array::len($source_pos) > 0 THEN
    (SELECT id, trace_id, vector::distance::euclidean(position, $source_pos) AS dist
     FROM trace
     WHERE archived = false AND position IS NOT NONE
     LIMIT 20)
  ELSE [] END;

  -- Return both sets (RRF done at application level or manually)
  RETURN {
    graph_neighbors: $graph,
    vector_neighbors: $vector
  };
};
