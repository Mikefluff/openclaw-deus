-- Migration 068: Fix language binding — object-specific, not broadcast
-- Problem: mama says "кубик" but brain binds word to ALL active traces.
-- Fix: use object_idx from speech event to bind ONLY to traces for that object.

DEFINE FUNCTION OVERWRITE fn::process_speech($speech: array, $valence: float, $object_idx: int) {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $cycle = (SELECT cycle FROM kernel_state LIMIT 1)[0].cycle ?? 0;
  LET $binding_lr = $cfg.lang_binding_lr ?? 0.1;
  LET $inhibition = $cfg.lang_lateral_inhibition ?? 0.92;

  LET $speech_key = 'speech:' + type::string($speech);

  -- Find or create speech trace
  LET $existing = (SELECT * FROM trace_state WHERE content = $speech_key AND archived = false LIMIT 1)[0];

  IF $existing IS NONE {
    LET $trace_id = 'L' + rand::string(8);
    LET $position = array::concat([0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f], $speech);
    LET $padded = IF array::len($position) < 64 THEN
      array::concat($position, [0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f])
    ELSE $position END;
    LET $pos64 = array::slice($padded, 0, 64);

    CREATE trace CONTENT {
      trace_id: $trace_id, source_type: 'lexical', source_id: 'mama',
      content: $speech_key,
      weight: 0.5, initial_weight: 0.5, freshness: 1.0, confidence: 0.3,
      emotional_charge: $valence, reactivation_count: 0, reactivation_history: [],
      created_at_cycle: $cycle, last_reactivated_cycle: $cycle,
      position: $pos64,
      velocity: [0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f],
      suppressed: false, archived: false
    };

    LET $trace_rec = (SELECT id FROM trace WHERE trace_id = $trace_id LIMIT 1)[0];
    CREATE trace_state SET
      trace = $trace_rec.id, trace_id = $trace_id, content = $speech_key,
      weight = 0.5, freshness = 1.0, emotional_charge = $valence,
      reactivation_count = 0, archived = false, suppressed = false, cycle = $cycle;

    LET $existing = (SELECT * FROM trace_state WHERE trace_id = $trace_id LIMIT 1)[0];
  } ELSE {
    UPDATE trace_state SET
      weight = math::min([1.0, weight + 0.1]),
      freshness = 1.0,
      reactivation_count = reactivation_count + 1,
      cycle = $cycle
    WHERE id = $existing.id;
  };

  -- BINDING: connect speech trace ONLY to traces for THIS object
  -- Match by content pattern "*:object_idx" (e.g. "1:3" = action 1 on object 3)
  LET $speech_trace = (SELECT id FROM trace WHERE content = $speech_key AND archived = false LIMIT 1)[0];
  IF $speech_trace IS NONE OR $speech_trace.id IS NONE {
    RETURN { speech_trace: $existing.trace_id ?? '', bindings: 0, speech_key: $speech_key };
  };

  LET $object_suffix = ':' + type::string($object_idx);

  -- Find traces for THIS specific object (content ends with :object_idx)
  LET $object_traces = (SELECT trace_id, weight, freshness, content FROM trace_state
    WHERE archived = false AND suppressed = false
    AND string::ends_with(content, $object_suffix)
    AND string::starts_with(content, 'speech:') = false
    AND string::starts_with(content, 'self:') = false
    LIMIT 10);

  LET $bound = 0;
  FOR $motor IN $object_traces {
    LET $motor_rec = (SELECT id FROM trace WHERE trace_id = $motor.trace_id AND archived = false LIMIT 1)[0];
    IF $motor_rec IS NOT NONE AND $motor_rec.id IS NOT NONE {
      LET $binding = (SELECT * FROM lexical_binding
        WHERE in = $speech_trace.id AND out = $motor_rec.id LIMIT 1)[0];

      LET $activation = ($motor.weight ?? 0) * ($motor.freshness ?? 0);

      IF $binding IS NOT NONE {
        UPDATE lexical_binding SET
          weight = math::min([1.0, weight + $binding_lr * $activation]),
          co_occurrence_count = (co_occurrence_count ?? 0) + 1,
          last_cycle = $cycle
        WHERE id = $binding.id;
      } ELSE {
        RELATE ($speech_trace.id)->lexical_binding->($motor_rec.id) SET
          weight = $binding_lr * $activation,
          speech_trace_id = $existing.trace_id ?? '',
          motor_trace_id = $motor.trace_id ?? '',
          co_occurrence_count = 1,
          created_cycle = $cycle,
          last_cycle = $cycle;
      };
      LET $bound = $bound + 1;
    };
  };

  -- Lateral inhibition: competing words for SAME object traces weaken
  FOR $motor IN $object_traces {
    LET $motor_rec = (SELECT id FROM trace WHERE trace_id = $motor.trace_id LIMIT 1)[0];
    IF $motor_rec IS NOT NONE {
      UPDATE lexical_binding SET weight = weight * $inhibition
        WHERE out = $motor_rec.id AND in != $speech_trace.id AND weight > 0.01;
    };
  };

  RETURN {
    speech_trace: $existing.trace_id ?? '',
    bindings: $bound,
    object_idx: $object_idx,
    speech_key: $speech_key
  };
};

-- fn::process_one_input — pass object_idx to process_speech
DEFINE FUNCTION OVERWRITE fn::process_one_input($inp: object) {
  LET $action = $inp.action_id ?? 0;

  IF $action < 0 {
    fn::process_speech($inp.speech ?? [], $inp.valence ?? 0, $inp.object_idx ?? 0);
    RETURN true;
  };

  fn::process_sensory($action, $inp.channels ?? [], $inp.speech ?? [],
    $inp.valence ?? 0, $inp.object_idx ?? 0);

  IF $inp.is_consequence = true {
    LET $tkey = type::string($action) + ':' + type::string($inp.object_idx ?? 0);
    LET $tr = (SELECT trace_id FROM trace_state WHERE content = $tkey AND archived = false LIMIT 1)[0];
    IF $tr IS NOT NONE AND $tr.trace_id IS NOT NONE {
      fn::cognitive_cycle($tr.trace_id, $action, $tkey, $inp.valence ?? 0);

      LET $channels = $inp.channels ?? [];
      IF array::len($channels) >= 13 {
        LET $trace_pos = (SELECT position FROM trace WHERE trace_id = $tr.trace_id LIMIT 1)[0].position ?? [];
        IF array::len($trace_pos) >= 13 {
          fn::predictor_step(array::slice($trace_pos, 0, 13), array::slice($channels, 0, 13), $action);
        };
      };
    };
  };

  RETURN true;
};
