-- Migration 023: Reactive Cognitive Loop
-- The brain lives INSIDE SurrealDB. Events cascade through the graph.
-- JS is just the world interface. SurrealDB (Rust) handles all cognitive dynamics.

-- ═══════════════════════════════════════════
-- 1. SPREADING ACTIVATION EVENT
-- When a trace's weight crosses threshold → activate neighbors
-- This cascades: neighbor weight increase triggers THEIR spread
-- ═══════════════════════════════════════════

DEFINE EVENT IF NOT EXISTS cognitive_spread ON trace
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

-- ═══════════════════════════════════════════
-- 2. AUTO-ARCHIVE EVENT
-- When a trace fades below viability → archive it
-- ═══════════════════════════════════════════

DEFINE EVENT IF NOT EXISTS cognitive_archive ON trace
  WHEN $event = 'UPDATE'
    AND ($after.weight * $after.freshness) < 0.03
    AND $after.archived = false
  THEN {
    UPDATE $after.id SET archived = true;
  };

-- ═══════════════════════════════════════════
-- 3. HEBBIAN CO-ACTIVATION TRACKING
-- When an edge weight increases → increment co-activation counter
-- High co_activation_count → schema detection (via stored proc on SLOW cadence)
-- ═══════════════════════════════════════════

DEFINE EVENT IF NOT EXISTS cognitive_hebbian ON activates
  WHEN $event = 'UPDATE'
    AND $after.weight > $before.weight
  THEN {
    UPDATE $after.id SET co_activation_count = co_activation_count + 1;
  };

-- ═══════════════════════════════════════════
-- 4. PREDICTION ERROR BACKPROPAGATION
-- When a commit is created with high prediction error →
-- weaken edges that led to wrong predictions
-- ═══════════════════════════════════════════

DEFINE EVENT IF NOT EXISTS cognitive_backprop ON commit_log
  WHEN $event = 'CREATE'
    AND $after.prediction_error > 0.15
  THEN {
    LET $traces = $after.changes.traces_activated;
    FOR $tid IN $traces {
      LET $edges = (SELECT id, weight FROM activates
        WHERE out.trace_id = $tid LIMIT 10);
      FOR $e IN $edges {
        UPDATE $e.id SET
          weight = math::clamp(weight - $after.prediction_error * 0.1, 0.01, 1.0),
          prediction_error_sum = prediction_error_sum + $after.prediction_error;
      };
    };
  };

-- ═══════════════════════════════════════════
-- 5. COGNITIVE STATE (materialized view)
-- Auto-updating aggregate stats — zero-cost reads
-- ═══════════════════════════════════════════

DEFINE TABLE IF NOT EXISTS cognitive_state AS
  SELECT
    count() AS total_traces,
    math::mean(weight) AS avg_weight,
    math::max(weight) AS peak_weight
  FROM trace
  WHERE archived = false
  GROUP ALL;

-- ═══════════════════════════════════════════
-- 6. COGNITIVE SCOPE (stored procedure)
-- Determines processing depth + spread from cognitive state
-- No time, no ticks — pure cognitive dynamics
-- ═══════════════════════════════════════════

DEFINE FUNCTION IF NOT EXISTS fn::compute_cognitive_scope() {
  LET $traces = (SELECT count() AS c FROM trace WHERE archived = false GROUP ALL);
  LET $dims = (SELECT count() AS c FROM concept_dimension GROUP ALL);
  LET $recent_commits = (SELECT count() AS c, math::mean(prediction_error) AS avg_err 
    FROM commit_log ORDER BY cycle DESC LIMIT 20 GROUP ALL);
  LET $hot_edges = (SELECT count() AS c FROM activates WHERE co_activation_count > 3 GROUP ALL);
  
  LET $trace_count = $traces[0].c OR 0;
  LET $dim_count = $dims[0].c OR 0;
  LET $avg_error = $recent_commits[0].avg_err OR 0;
  LET $hot_count = $hot_edges[0].c OR 0;
  
  RETURN {
    trace_count: $trace_count,
    dimension_count: $dim_count,
    avg_prediction_error: $avg_error,
    hot_edge_count: $hot_count,
    suggested_depth: IF $avg_error > 0.3 THEN 5 
      ELSE IF $hot_count > 10 THEN 3
      ELSE IF $trace_count > 500 THEN 2
      ELSE 1 END,
    suggested_spread: IF $hot_count > 20 THEN 50
      ELSE IF $dim_count > 20 THEN 20
      ELSE IF $trace_count > 100 THEN 10
      ELSE 3 END
  };
};
