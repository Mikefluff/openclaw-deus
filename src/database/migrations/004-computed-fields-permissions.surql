-- Computed fields on beliefs (virtual, recalculated on read)
DEFINE FIELD days_since_update ON belief VALUE
  ((time::millis(time::now()) - time::millis(timestamp_updated)) / 86400000);

DEFINE FIELD is_stale ON belief VALUE
  ((time::millis(time::now()) - time::millis(timestamp_updated)) / 86400000) > 7;

DEFINE FIELD effective_confidence ON belief VALUE
  math::max(
    confidence_floor,
    confidence * math::exp(
      -(
        IF decay_mode = 'slow' THEN 0.001
        ELSE IF decay_mode = 'normal' THEN 0.01
        ELSE IF decay_mode = 'fast' THEN 0.02
        ELSE 0
        END
      ) * ((time::millis(time::now()) - time::millis(timestamp_updated)) / 86400000)
    )
  );

-- DB-level permissions (enforced when using scoped auth)
DEFINE TABLE belief PERMISSIONS
  FOR select FULL
  FOR create WHERE $auth != NONE
  FOR update WHERE $auth != NONE
  FOR delete WHERE $auth != NONE;

DEFINE TABLE activity_log PERMISSIONS
  FOR select FULL
  FOR create FULL
  FOR update WHERE $auth != NONE
  FOR delete WHERE $auth != NONE;

DEFINE TABLE review_candidate PERMISSIONS
  FOR select FULL
  FOR create FULL
  FOR update WHERE $auth != NONE
  FOR delete WHERE $auth != NONE;

-- Migration tracking entry
CREATE migration_history SET version = '004', applied_at = time::now();
