-- Migration 025: Reactive Neural Graph
-- The neural graph modifies ITSELF. Edges strengthen, decay, and sprout.
-- No JS intervention needed — SurrealDB events handle neuroplasticity.

-- ═══════════════════════════════════════════
-- 1. HEBBIAN STRENGTHENING ON NEURAL EDGES
-- When an edge fires strongly (high in.value × weight), nudge weight up.
-- "Neurons that fire together wire together" — but in the NEURAL graph.
-- ═══════════════════════════════════════════

DEFINE EVENT IF NOT EXISTS nn_hebbian ON nn_edge
  WHEN $event = 'UPDATE'
    AND $after.update_count > $before.update_count
    AND math::abs($after.weight) > 0.01
  THEN {
    -- Hebbian nudge: strengthen edge if input node was active (>0.3)
    UPDATE nn_edge SET
      weight = math::clamp(weight + 0.001 * in.value * math::sign(weight), -2.0, 2.0)
    WHERE id = $after.id AND in.value > 0.3;
  };

-- ═══════════════════════════════════════════
-- 2. WEIGHT DECAY ON UNUSED EDGES
-- Edges not updated recently lose weight slowly.
-- Prevents infinite growth, encourages sparsity.
-- Triggered by fn::nn_decay (called on RESTRUCTURE cadence).
-- ═══════════════════════════════════════════

DEFINE FUNCTION IF NOT EXISTS fn::nn_decay($model: string, $decay_rate: float) {
  -- Decay all edges that haven't been updated recently
  -- grad_acc tracks cumulative gradient magnitude — low grad_acc = unused
  UPDATE nn_edge SET
    weight = weight * (1.0 - $decay_rate),
    grad_acc = grad_acc * 0.9
  WHERE in.model = $model AND update_count > 0;

  -- Prune near-zero edges (neuronal pruning)
  -- Don't delete — just mark weight as exactly 0 (dead synapse)
  UPDATE nn_edge SET weight = 0.0
  WHERE in.model = $model AND math::abs(weight) < 0.001 AND update_count > 10;

  RETURN true;
};

-- ═══════════════════════════════════════════
-- 3. GRADIENT ACCUMULATION STATS
-- Track which edges learn the most — useful for introspection
-- and deciding where to add new edges (neuroplasticity).
-- ═══════════════════════════════════════════

DEFINE FUNCTION IF NOT EXISTS fn::nn_edge_stats($model: string) {
  RETURN SELECT
    in.node_id AS from_node,
    out.node_id AS to_node,
    weight,
    grad_acc,
    update_count,
    math::abs(weight) * grad_acc AS importance
  FROM nn_edge
  WHERE in.model = $model
  ORDER BY importance DESC
  LIMIT 20;
};

-- ═══════════════════════════════════════════
-- 4. NEUROPLASTICITY: topology mutation
-- When prediction error stays high for a model, the graph
-- can grow new connections. Called explicitly, not as event.
-- ═══════════════════════════════════════════

-- Simplified neuroplasticity: sprout edges where connectivity is missing
-- Avoids nested LET (SurrealDB 3.0.4 limitation)
-- Neuroplasticity: sprout missing edges between layers
DEFINE FUNCTION IF NOT EXISTS fn::nn_sprout($model: string, $from_layer: string, $to_layer: string) {
  -- For each output node, check if all input nodes are connected
  -- If not, create the missing edge with small random weight
  LET $outputs = (SELECT id FROM nn_node WHERE model = $model AND layer = $to_layer);
  LET $inputs = (SELECT id FROM nn_node WHERE model = $model AND layer = $from_layer);

  FOR $out_rec IN $outputs {
    FOR $inp_rec IN $inputs {
      LET $exists = (SELECT count() AS c FROM nn_edge
        WHERE in = $inp_rec.id AND out = $out_rec.id GROUP ALL)[0].c ?? 0;
      IF $exists = 0 {
        RELATE ($inp_rec.id)->nn_edge->($out_rec.id) SET
          weight = (rand::float() - 0.5) * 0.1,
          grad_acc = 0.0,
          update_count = 0;
      };
    };
  };

  RETURN true;
};

-- ═══════════════════════════════════════════
-- 5. NEURAL METRICS: introspectable graph state
-- Same pattern as cognitive_metrics (migration 021).
-- ═══════════════════════════════════════════

-- Decay all 3 neural models in one call (no JS round-trips)
DEFINE FUNCTION IF NOT EXISTS fn::nn_decay_all($decay_rate: float) {
  fn::nn_decay('affect', $decay_rate);
  fn::nn_decay('cone', $decay_rate);
  fn::nn_decay('predictor', $decay_rate);
  RETURN true;
};

DEFINE FUNCTION IF NOT EXISTS fn::nn_metrics() {
  LET $models = ['affect', 'cone', 'predictor'];
  LET $results = [];

  FOR $m IN $models {
    LET $node_count = (SELECT count() AS c FROM nn_node WHERE model = $m GROUP ALL)[0].c ?? 0;
    LET $edge_count = (SELECT count() AS c FROM nn_edge WHERE in.model = $m GROUP ALL)[0].c ?? 0;
    LET $total_updates = (SELECT math::sum(update_count) AS s FROM nn_edge WHERE in.model = $m GROUP ALL)[0].s ?? 0;
    LET $mean_weight = (SELECT math::mean(math::abs(weight)) AS m FROM nn_edge WHERE in.model = $m GROUP ALL)[0].m ?? 0;
    LET $dead_edges = (SELECT count() AS c FROM nn_edge WHERE in.model = $m AND math::abs(weight) < 0.001 GROUP ALL)[0].c ?? 0;
    LET $mean_grad = (SELECT math::mean(grad_acc) AS m FROM nn_edge WHERE in.model = $m GROUP ALL)[0].m ?? 0;

    LET $results = array::push($results, {
      model: $m,
      nodes: $node_count,
      edges: $edge_count,
      total_updates: $total_updates,
      mean_weight: $mean_weight,
      dead_edges: $dead_edges,
      mean_grad_acc: $mean_grad
    });
  };

  RETURN $results;
};
