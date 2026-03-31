-- Migration 033: Sensorimotor Interface
-- Brain receives 13 sensory channels + 16 speech channels = 29 numbers.
-- No text. No strings. Only numbers.

-- ═══════════════════════════════════════════
-- fn::process_sensory — brain receives numerical transition
-- Replaces fn::process_consequence (text-based)
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::process_sensory(
  $action_id: int,
  $channels: array,
  $speech: array,
  $valence: float,
  $object_idx: int
) {
  -- Trace position = sensory channels (13-dim → pad to 64 for HNSW)
  LET $position = array::concat($channels, $speech);
  -- Pad to 64 dims
  LET $pad_len = 64 - array::len($position);
  LET $padded = IF $pad_len > 0 THEN
    array::concat($position, [0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f])
  ELSE $position END;
  LET $pos64 = array::slice($padded, 0, 64);

  -- Dedup: find existing trace with similar sensory signature
  -- (exact match on action + object for now, HNSW KNN later)
  LET $trace_key = type::string($action_id) + ':' + type::string($object_idx);
  LET $existing = (SELECT * FROM trace WHERE content = $trace_key AND archived = false LIMIT 1)[0];

  LET $cycle = (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0;

  IF $existing != NONE {
    -- Reactivate: same action on same object → strengthen
    UPDATE trace SET
      weight = math::min([1.0, weight + 0.1 + math::abs($valence) * 0.2]),
      freshness = 1.0,
      reactivation_count = reactivation_count + 1,
      last_reactivated_cycle = $cycle,
      position = $pos64,
      emotional_charge = emotional_charge * 0.7 + $valence * 0.3
    WHERE trace_id = $existing.trace_id;

    -- Convergence: saw same thing again = world predictable
    UPDATE nn_node SET value = math::min([5.0, value + 0.1]) WHERE node_id = 'acc:convergence';

    RETURN { trace_id: $existing.trace_id, is_new: false };
  };

  -- New trace: first time seeing this action-object combination
  LET $trace_id = 'T' + rand::string(8);
  CREATE trace CONTENT {
    trace_id: $trace_id,
    source_type: 'event',
    source_id: type::string($action_id),
    content: $trace_key,
    weight: 0.5 + math::abs($valence) * 0.3,
    initial_weight: 0.5,
    freshness: 1.0,
    confidence: 0.5,
    emotional_charge: $valence,
    reactivation_count: 0,
    reactivation_history: [],
    created_at_cycle: $cycle,
    last_reactivated_cycle: $cycle,
    position: $pos64,
    velocity: [0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f],
    suppressed: false,
    archived: false
  };

  -- Novelty: genuinely new observation
  UPDATE nn_node SET value = math::min([5.0, value + 0.3]) WHERE node_id = 'acc:novelty';

  -- Prediction error: new = unpredicted
  UPDATE nn_node SET value = math::min([5.0, value + 0.2]) WHERE node_id = 'acc:pred_error';

  -- Valence → affect accumulators
  IF $valence > 0.2 {
    UPDATE nn_node SET value = math::min([5.0, value + $valence]) WHERE node_id = 'acc:reward';
  };
  IF $valence < -0.2 {
    UPDATE nn_node SET value = math::min([5.0, value + math::abs($valence)]) WHERE node_id = 'acc:pain';
  };

  RETURN { trace_id: $trace_id, is_new: true };
};
