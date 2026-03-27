-- Migration 021: SurrealDB 3.0 native operations
-- Push cognitive logic from JS to DB: stored procedures, HNSW index, computed fields

-- ═══════════════════════════════════════════
-- 1. STORED PROCEDURES (fix broken HAVING → subqueries)
-- ═══════════════════════════════════════════

-- Episodic consolidation: find patterns with 3+ occurrences
DEFINE FUNCTION IF NOT EXISTS fn::find_episodic_patterns($min_count: int) {
  RETURN SELECT * FROM (
    SELECT in.trace_id AS from_id, out.trace_id AS to_id, count() AS cnt
    FROM episodic GROUP BY in, out
  ) WHERE cnt >= $min_count LIMIT 20;
};

-- High-connectivity traces for conflict detection
DEFINE FUNCTION IF NOT EXISTS fn::find_high_connectivity($min_edges: int, $limit: int) {
  RETURN SELECT * FROM (
    SELECT in.trace_id AS trace_id, in.content AS content,
           in.position AS position, count() AS edge_count
    FROM activates WHERE in.archived = false GROUP BY in
  ) WHERE edge_count > $min_edges
  ORDER BY edge_count DESC LIMIT $limit;
};

-- Cognitive metrics in 1 call (replaces 4 separate queries)
DEFINE FUNCTION IF NOT EXISTS fn::cognitive_metrics() {
  LET $abs = (SELECT count() AS c FROM trace
    WHERE (content CONTAINS '[ABSTRACT]' OR content CONTAINS '[PROPERTY]')
    AND archived = false GROUP ALL);
  LET $schema = (SELECT math::max(weight) AS m FROM activates GROUP ALL);
  LET $total = (SELECT count() AS c FROM trace GROUP ALL);
  LET $active = (SELECT count() AS c FROM trace WHERE archived = false GROUP ALL);
  LET $edges = (SELECT math::mean(weight) AS m FROM activates GROUP ALL);
  LET $strong = (SELECT count() AS c FROM activates WHERE weight > 0.5 GROUP ALL);
  RETURN {
    abstraction_count: $abs[0].c OR 0,
    schema_complexity: $schema[0].m OR 0,
    total_traces: $total[0].c OR 0,
    active_traces: $active[0].c OR 0,
    cross_modal_binding: $edges[0].m OR 0,
    strong_edges: $strong[0].c OR 0
  };
};

-- World model metrics in 1 call (replaces 5+ queries)
DEFINE FUNCTION IF NOT EXISTS fn::world_model_metrics() {
  LET $objects = (SELECT count() AS c FROM trace
    WHERE source_type = 'event' AND archived = false GROUP ALL);
  LET $lexical = (SELECT count() AS c FROM trace
    WHERE source_type = 'lexical' AND archived = false GROUP ALL);
  LET $pred = (SELECT prediction_error FROM commit_log
    WHERE prediction_error IS NOT NONE LIMIT 20);
  RETURN {
    object_traces: $objects[0].c OR 0,
    vocabulary_size: $lexical[0].c OR 0,
    prediction_errors: $pred
  };
};

-- ═══════════════════════════════════════════
-- 2. HNSW INDEX (faster approximate KNN)
-- ═══════════════════════════════════════════

REMOVE INDEX IF EXISTS idx_trace_position ON trace;
DEFINE INDEX idx_trace_position ON trace FIELDS position
  HNSW DIMENSION 64 DIST EUCLIDEAN TYPE F32;

-- ═══════════════════════════════════════════
-- 3. COMPUTED FIELD
-- ═══════════════════════════════════════════

DEFINE FIELD IF NOT EXISTS is_active ON trace
  VALUE IF archived = false AND suppressed = false AND weight > 0.1 THEN true ELSE false END;
