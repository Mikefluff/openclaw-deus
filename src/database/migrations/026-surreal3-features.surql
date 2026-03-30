-- Migration 026: SurrealDB 3.0 Feature Adoption
-- Recursive graph traversal, native vector ops, async events, computed fields.
-- Every feature SurrealDB 3.0 gives us, we use.

-- ═══════════════════════════════════════════
-- 1. COMPUTED FIELDS — no repeated calculation
-- ═══════════════════════════════════════════

-- nn_edge: importance = how much this synapse matters
DEFINE FIELD IF NOT EXISTS importance ON nn_edge
  VALUE math::abs(weight) * grad_acc;

-- trace: effective strength (what matters for attention)
DEFINE FIELD IF NOT EXISTS effective_strength ON trace
  VALUE weight * freshness;

-- nn_node: whether this neuron is "firing"
DEFINE FIELD IF NOT EXISTS is_firing ON nn_node
  VALUE IF value > 0.3 THEN true ELSE false END;

-- activates edge: effective strength (weight × co-activation frequency)
DEFINE FIELD IF NOT EXISTS effective_weight ON activates
  VALUE weight * math::log2(2.0 + co_activation_count);

-- ═══════════════════════════════════════════
-- 2. ASYNC EVENTS WITH RETRY
-- Non-blocking, fault-tolerant cognitive cascades
-- ═══════════════════════════════════════════

-- Upgrade cognitive_spread to ASYNC with retry
REMOVE EVENT IF EXISTS cognitive_spread ON trace;
DEFINE EVENT cognitive_spread ON trace
  ASYNC RETRY 3 MAXDEPTH 5
  WHEN $event = 'UPDATE'
    AND $after.weight > 0.5
    AND ($before.weight <= 0.5 OR $before.weight IS NONE)
    AND $after.archived = false
  THEN {
    LET $neighbors = (SELECT out.id AS target, weight AS w
      FROM activates WHERE in = $after.id AND weight > 0.1 LIMIT 5);
    FOR $n IN $neighbors {
      UPDATE $n.target SET
        weight = math::min(1.0, weight + $n.w * 0.1),
        freshness = math::min(1.0, freshness + 0.05)
      WHERE archived = false;
    };
  };

-- Upgrade cognitive_archive to ASYNC
REMOVE EVENT IF EXISTS cognitive_archive ON trace;
DEFINE EVENT cognitive_archive ON trace
  ASYNC RETRY 2
  WHEN $event = 'UPDATE'
    AND ($after.weight * $after.freshness) < 0.03
    AND $after.archived = false
  THEN {
    UPDATE $after.id SET archived = true;
  };

-- Upgrade cognitive_hebbian to ASYNC
REMOVE EVENT IF EXISTS cognitive_hebbian ON activates;
DEFINE EVENT cognitive_hebbian ON activates
  ASYNC RETRY 2
  WHEN $event = 'UPDATE'
    AND $after.weight > $before.weight
  THEN {
    UPDATE $after.id SET co_activation_count = co_activation_count + 1;
  };

-- Upgrade cognitive_backprop to ASYNC with retry
REMOVE EVENT IF EXISTS cognitive_backprop ON commit_log;
DEFINE EVENT cognitive_backprop ON commit_log
  ASYNC RETRY 3
  WHEN $event = 'CREATE'
    AND $after.prediction_error > 0.15
  THEN {
    LET $traces = $after.changes.traces_activated ?? [];
    FOR $tid IN $traces {
      LET $edges = (SELECT id, weight FROM activates WHERE out.trace_id = $tid AND weight > 0.1 LIMIT 10);
      FOR $e IN $edges {
        UPDATE $e.id SET weight = math::max(0.01, weight - $after.prediction_error * 0.05);
      };
    };
  };

-- Upgrade nn_hebbian to ASYNC
REMOVE EVENT IF EXISTS nn_hebbian ON nn_edge;
DEFINE EVENT nn_hebbian ON nn_edge
  ASYNC RETRY 2
  WHEN $event = 'UPDATE'
    AND $after.update_count > $before.update_count
    AND math::abs($after.weight) > 0.01
  THEN {
    LET $in_active = (SELECT value FROM nn_node WHERE id = $after.in)[0].value;
    IF $in_active > 0.3 THEN
      UPDATE $after.id SET
        weight = math::clamp(weight + 0.001 * $in_active * math::sign(weight), -2.0, 2.0);
    END;
  };

-- ═══════════════════════════════════════════
-- 3. NATIVE VECTOR FUNCTIONS IN STORED PROCS
-- Replace JS distance with Rust-native vector ops
-- ═══════════════════════════════════════════

-- Spatial nearest-neighbor using native vector distance
DEFINE FUNCTION IF NOT EXISTS fn::find_nearest_traces($position: array, $radius: float, $limit: int) {
  RETURN SELECT
    trace_id,
    position,
    weight,
    freshness,
    vector::distance::euclidean(position, $position) AS dist
  FROM trace
  WHERE archived = false
    AND position IS NOT NONE
    AND vector::distance::euclidean(position, $position) < $radius
  ORDER BY dist ASC
  LIMIT $limit;
};

-- Cosine similarity for belief/knowledge embedding search
DEFINE FUNCTION IF NOT EXISTS fn::find_similar_embeddings($table: string, $embedding: array, $limit: int) {
  RETURN SELECT
    *,
    vector::similarity::cosine(embedding, $embedding) AS similarity
  FROM type::table($table)
  WHERE embedding IS NOT NONE
  ORDER BY similarity DESC
  LIMIT $limit;
};

-- Vector-based cluster centroid computation (native)
DEFINE FUNCTION IF NOT EXISTS fn::compute_centroid($trace_ids: array) {
  LET $positions = (SELECT position FROM trace WHERE trace_id IN $trace_ids AND position IS NOT NONE);
  IF array::len($positions) = 0 { RETURN []; };

  -- Average across all dimensions
  LET $dim = array::len($positions[0].position);
  LET $count = array::len($positions);
  LET $centroid = [];

  -- Sum each dimension
  FOR $d IN 0..$dim {
    LET $sum = math::sum($positions.map(|$p| $p.position[$d] ?? 0.0));
    LET $centroid = array::push($centroid, $sum / $count);
  };

  RETURN $centroid;
};

-- ═══════════════════════════════════════════
-- 4. RECURSIVE GRAPH TRAVERSAL
-- Replace manual FOR-loop depth with native .{n} syntax
-- ═══════════════════════════════════════════

-- Multi-hop spreading activation using recursive traversal
DEFINE FUNCTION IF NOT EXISTS fn::spread_recursive($source_id: record, $depth: int, $decay: float) {
  -- Depth 1: direct neighbors
  LET $d1 = SELECT id, weight FROM $source_id->activates->trace
    WHERE archived = false AND weight > 0.1;

  FOR $n IN $d1 {
    UPDATE $n.id SET
      weight = math::min(1.0, weight + $decay * 0.1),
      freshness = math::min(1.0, freshness + 0.02);
  };

  -- Depth 2: 2-hop neighbors (if depth >= 2)
  IF $depth >= 2 THEN {
    LET $d2 = SELECT id, weight FROM $source_id->activates->trace->activates->trace
      WHERE archived = false AND weight > 0.1;
    FOR $n IN $d2 {
      UPDATE $n.id SET
        weight = math::min(1.0, weight + $decay * $decay * 0.05),
        freshness = math::min(1.0, freshness + 0.01);
    };
  } END;

  -- Depth 3: 3-hop neighbors (if depth >= 3)
  IF $depth >= 3 THEN {
    LET $d3 = SELECT id, weight FROM $source_id->activates->trace->activates->trace->activates->trace
      WHERE archived = false AND weight > 0.1;
    FOR $n IN $d3 {
      UPDATE $n.id SET
        weight = math::min(1.0, weight + $decay * $decay * $decay * 0.02);
    };
  } END;

  RETURN true;
};

-- Find causal chains (A caused B caused C) using recursive traversal
DEFINE FUNCTION IF NOT EXISTS fn::find_causal_chain($source_tid: string, $max_depth: int) {
  LET $source = (SELECT id FROM trace WHERE trace_id = $source_tid LIMIT 1)[0];
  IF $source = NONE { RETURN []; };

  -- 2-hop causal chain
  IF $max_depth >= 2 THEN {
    RETURN SELECT
      in.trace_id AS step1,
      out.trace_id AS step2,
      out->caused_by->trace.trace_id AS step3
    FROM caused_by
    WHERE in = $source.id
    LIMIT 20;
  } END;

  RETURN SELECT out.trace_id AS step FROM caused_by WHERE in = $source.id LIMIT 10;
};

-- ═══════════════════════════════════════════
-- 5. CONCURRENTLY INDEX BUILDING
-- Non-blocking index operations for production
-- ═══════════════════════════════════════════

-- Rebuild trace position index concurrently (non-blocking)
REMOVE INDEX IF EXISTS idx_trace_position ON trace;
DEFINE INDEX idx_trace_position ON trace FIELDS position
  HNSW DIMENSION 64 TYPE F32 DIST EUCLIDEAN
  CONCURRENTLY;

-- Add COUNT index for fast GROUP ALL on common tables
DEFINE INDEX IF NOT EXISTS idx_trace_count ON trace FIELDS archived COUNT;
DEFINE INDEX IF NOT EXISTS idx_nn_edge_count ON nn_edge FIELDS in COUNT;
DEFINE INDEX IF NOT EXISTS idx_commit_count ON commit_log FIELDS cycle COUNT;

-- ═══════════════════════════════════════════
-- 6. SEQUENCE for monotonic IDs
-- ═══════════════════════════════════════════

DEFINE SEQUENCE IF NOT EXISTS cycle_counter;
DEFINE SEQUENCE IF NOT EXISTS commit_counter;

-- ═══════════════════════════════════════════
-- 7. BATCH OPERATIONS — kill N+1 patterns
-- Every loop-with-DB-call in JS becomes one proc
-- ═══════════════════════════════════════════

-- Batch insert sensorimotor transitions (replaces N+1 create loop)
DEFINE FUNCTION IF NOT EXISTS fn::batch_insert_transitions($transitions: array) {
  FOR $t IN $transitions {
    CREATE sensorimotor_transition CONTENT {
      position_t: $t.position_t,
      position_t1: $t.position_t1,
      action: $t.action,
      reward: $t.reward,
      cycle: $t.cycle,
      trained: false
    };
  };
  RETURN { inserted: array::len($transitions) };
};

-- Batch update edge weights (replaces N+1 UPDATE activates loop)
DEFINE FUNCTION IF NOT EXISTS fn::batch_update_edges($updates: array) {
  FOR $u IN $updates {
    UPDATE activates SET
      weight = math::clamp(weight + $u.delta_weight, 0.01, 1.0),
      co_activation_count = co_activation_count + 1
    WHERE in.trace_id = $u.from AND out.trace_id = $u.to;
  };
  RETURN { updated: array::len($updates) };
};

-- Batch name dimensions (replaces N+1 UPDATE concept_dimension loop)
DEFINE FUNCTION IF NOT EXISTS fn::batch_name_dimensions($dims: array) {
  FOR $d IN $dims {
    UPDATE concept_dimension SET
      label = $d.label,
      named_at_cycle = $d.cycle
    WHERE dimension_id = $d.dimension_id;
  };
  RETURN { named: array::len($dims) };
};

-- Batch create hierarchy relations (replaces N+1 RELATE loop)
DEFINE FUNCTION IF NOT EXISTS fn::batch_create_hierarchy($pairs: array) {
  FOR $p IN $pairs {
    RELATE (SELECT id FROM cluster WHERE cluster_id = $p.parent LIMIT 1)
      ->contains->(SELECT id FROM cluster WHERE cluster_id = $p.child LIMIT 1)
      SET hierarchy_level = 1;
  };
  RETURN { created: array::len($pairs) };
};

-- Batch accuracy measurement (replaces N+1 SELECT-per-object loop)
DEFINE FUNCTION IF NOT EXISTS fn::measure_accuracy($object_names: array) {
  LET $correct = 0;
  FOR $name IN $object_names {
    LET $found = (SELECT count() AS c FROM trace
      WHERE archived = false AND content CONTAINS $name
      GROUP ALL)[0].c ?? 0;
    IF $found > 0 THEN
      LET $correct = $correct + 1;
    END;
  };
  RETURN { total: array::len($object_names), correct: $correct };
};

-- ═══════════════════════════════════════════
-- 7. SLEEP CONSOLIDATION — one proc, zero JS
-- Memory reorganization during sleep:
--   episodic→semantic, Hebbian boost, prune, neural decay
-- ═══════════════════════════════════════════

DEFINE FUNCTION IF NOT EXISTS fn::sleep_consolidation($decay_rate: float) {
  -- 1. Consolidate episodic → semantic (reuse existing proc)
  LET $consolidated = fn::consolidate_episodic(3);

  -- 2. Hebbian boost: strengthen frequently co-activated edges
  UPDATE activates SET weight = math::min(1.0, weight * 1.05)
    WHERE co_activation_count > 5 AND weight > 0.3;

  -- 3. Synaptic homeostasis: decay weak edges
  UPDATE activates SET weight = weight * 0.95 WHERE weight < 0.2;

  -- 4. Prune dead synapses
  DELETE activates WHERE weight < 0.02;

  -- 5. Neural graph decay (all 3 models, stronger during sleep)
  LET $sleep_rate = $decay_rate * 5.0;
  fn::nn_decay('affect', $sleep_rate);
  fn::nn_decay('cone', $sleep_rate);
  fn::nn_decay('predictor', $sleep_rate);

  -- 6. Archive faded traces
  LET $archived = (UPDATE trace SET archived = true
    WHERE archived = false AND weight * freshness < 0.02
    RETURN BEFORE);

  -- 7. Compact old narrative frames (keep last 10)
  LET $old_frames = (SELECT id FROM narrative_frame ORDER BY created_at DESC LIMIT 1000 START 10);
  FOR $f IN $old_frames {
    DELETE $f.id;
  };

  RETURN {
    consolidated: $consolidated.consolidated ?? 0,
    archived: array::len($archived),
    pruned: true
  };
};
