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
