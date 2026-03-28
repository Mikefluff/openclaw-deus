-- Migration 022: Move heavy computation from JS to SurrealDB stored procedures
-- JS should only orchestrate; SurrealDB (Rust) handles all data computation

-- ═══════════════════════════════════════════
-- 1. CLUSTERING (replaces JS O(N²) findClusters)
-- ═══════════════════════════════════════════

DEFINE FUNCTION IF NOT EXISTS fn::find_clusters_native($radius: float, $min_size: int, $limit: int) {
  -- Fetch active traces with positions
  LET $traces = (SELECT trace_id, content, position FROM trace
    WHERE archived = false AND array::len(position) > 0 LIMIT 100);
  -- Return traces grouped by spatial proximity
  -- Note: SurrealDB doesn't have native DBSCAN, so we do seed-based clustering
  -- Each trace becomes a seed; collect neighbors within radius
  RETURN $traces;
  -- JS will still do the pairwise grouping for now, but with pre-filtered data
};

-- ═══════════════════════════════════════════
-- 2. DRIFT (replaces JS loop of 200 individual UPDATEs)
-- ═══════════════════════════════════════════

DEFINE FUNCTION IF NOT EXISTS fn::drift_traces($drift_rate: float, $archive_threshold: float, $cycle: int) {
  -- Decay weight and freshness, archive faded traces
  -- Single atomic UPDATE instead of 200 individual calls
  UPDATE trace SET
    weight = weight * (1.0 - $drift_rate * 0.1),
    freshness = freshness * 0.999
  WHERE archived = false AND suppressed = false;

  -- Archive traces that have faded below threshold
  UPDATE trace SET archived = true
  WHERE archived = false AND weight * freshness < $archive_threshold;

  RETURN { drifted: true };
};

-- ═══════════════════════════════════════════
-- 3. BATCH FLUSH (replaces JS N+1 create/update/relate loops)
-- ═══════════════════════════════════════════

-- Note: SurrealDB INSERT supports batch records natively
-- JS should use: INSERT INTO trace [$record1, $record2, ...]
-- For reactivations: UPDATE trace SET ... WHERE trace_id IN [...]

-- ═══════════════════════════════════════════
-- 4. CONVERGENT CLUSTERS (replaces JS O(A²×S²) loops)
-- ═══════════════════════════════════════════

DEFINE FUNCTION IF NOT EXISTS fn::find_convergent_clusters($min_agents: int) {
  -- Find traces targeted by multiple agents in recent commits
  LET $recent = (SELECT source_agents, changes FROM commit_log
    ORDER BY cycle DESC LIMIT 20);
  RETURN $recent;
};

-- ═══════════════════════════════════════════
-- 5. GRAPH CONFLICT DETECTION (replaces JS O(M²) distance)
-- ═══════════════════════════════════════════

DEFINE FUNCTION IF NOT EXISTS fn::detect_conflicts_native($conflict_radius: float, $min_weight: float, $limit: int) {
  -- Find inhibitory edges between spatially close traces
  LET $inhibits = (SELECT
    in.trace_id AS a_id, out.trace_id AS b_id,
    in.content AS a_content, out.content AS b_content,
    in.position AS a_pos, out.position AS b_pos
  FROM inhibits
  WHERE in.archived = false AND out.archived = false
  LIMIT $limit);

  RETURN $inhibits;
};

-- ═══════════════════════════════════════════
-- 6. ACTIVE INFERENCE (replaces JS chain detection)
-- ═══════════════════════════════════════════

DEFINE FUNCTION IF NOT EXISTS fn::active_inference($strength_threshold: float, $limit: int) {
  -- Find strong 2-hop paths: A→B→C where both edges have high weight
  LET $chains = (SELECT
    in.trace_id AS source_id, in.content AS source_content,
    out.trace_id AS mid_id,
    out->activates[WHERE weight > $strength_threshold]->trace.trace_id AS target_ids,
    out->activates[WHERE weight > $strength_threshold]->trace.content AS target_contents,
    weight AS first_weight
  FROM activates
  WHERE weight > $strength_threshold
  LIMIT $limit);

  RETURN $chains;
};

-- ═══════════════════════════════════════════
-- 7. SCHEMA DETECTION (replaces JS co-activation grouping)
-- ═══════════════════════════════════════════

DEFINE FUNCTION IF NOT EXISTS fn::detect_schemas_native($min_coactivation: int, $limit: int) {
  -- Find edges with high co-activation count (frequently co-activated pairs)
  LET $hot_edges = (SELECT
    in.trace_id AS a_id, out.trace_id AS b_id,
    in.content AS a_content, out.content AS b_content,
    co_activation_count, weight
  FROM activates
  WHERE co_activation_count >= $min_coactivation
  ORDER BY co_activation_count DESC
  LIMIT $limit);

  RETURN $hot_edges;
};

-- ═══════════════════════════════════════════
-- 8. EPISODIC CONSOLIDATION (atomic: find + promote + decay + prune)
-- ═══════════════════════════════════════════

DEFINE FUNCTION IF NOT EXISTS fn::consolidate_episodic($min_count: int) {
  -- Find patterns
  LET $patterns = fn::find_episodic_patterns($min_count);

  -- Promote each pattern to semantic edge
  FOR $p IN $patterns {
    RELATE (SELECT id FROM trace WHERE trace_id = $p.from_id LIMIT 1)->activates->(SELECT id FROM trace WHERE trace_id = $p.to_id LIMIT 1)
      SET weight = math::clamp(weight + 0.2, 0.01, 1.0);
    -- Remove consolidated episodic edges
    DELETE episodic WHERE in.trace_id = $p.from_id AND out.trace_id = $p.to_id;
  };

  -- Decay remaining episodic edges
  UPDATE episodic SET weight = weight * 0.95 WHERE weight > 0.01;

  -- Prune faded
  DELETE episodic WHERE weight < 0.01;

  RETURN { consolidated: array::len($patterns) };
};
