-- Migration 069: Real Attention-Based Binding (AtomSpace-inspired)
--
-- Replace hardcoded object_idx binding with pure STI co-activation.
-- Key: STI is a conserved quantity. Attentional Focus = top-N by STI.
-- Hebbian links form between ANYTHING co-present in AF.
-- Word-object binding emerges from repeated co-activation, not wiring.

-- ═══════════════════════════════════════════
-- CONFIG
-- ═══════════════════════════════════════════

UPDATE kernel_state SET
  config.sti_budget = config.sti_budget ?? 100.0,
  config.sti_stimulus_sensory = config.sti_stimulus_sensory ?? 5.0,
  config.sti_stimulus_speech = config.sti_stimulus_speech ?? 8.0,
  config.sti_stimulus_consequence = config.sti_stimulus_consequence ?? 10.0,
  config.sti_rent_per_tick = config.sti_rent_per_tick ?? 0.2,
  config.af_size = config.af_size ?? 10,
  config.hebbian_creation_threshold = config.hebbian_creation_threshold ?? 0.3,
  config.sti_diffusion_rate = config.sti_diffusion_rate ?? 0.1;

-- Add STI field to trace_state (Short-Term Importance)
UPDATE trace_state SET sti = sti ?? 0.0 WHERE sti IS NONE;

-- ═══════════════════════════════════════════
-- fn::stimulate — add STI to a trace (AtomSpace: cog-stimulate)
-- STI is drawn from budget. Conservation ensures bounded attention.
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::stimulate($trace_id: string, $amount: float) {
  LET $ts = (SELECT id, sti FROM trace_state WHERE trace_id = $trace_id AND archived = false LIMIT 1)[0];
  IF $ts IS NONE { RETURN false; };

  UPDATE trace_state SET sti = (sti ?? 0) + $amount WHERE id = $ts.id;
  RETURN true;
};

-- ═══════════════════════════════════════════
-- fn::get_attentional_focus — top-N traces by STI
-- These are what the brain is "attending to" right now.
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::get_attentional_focus() {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $af_size = $cfg.af_size ?? 10;

  RETURN (SELECT trace_id, content, sti, weight, freshness FROM trace_state
    WHERE archived = false AND sti > 0.1
    ORDER BY sti DESC
    LIMIT $af_size);
};

-- ═══════════════════════════════════════════
-- fn::sti_rent — tax all STI (attention decays without stimulation)
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::sti_rent() {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $rent = $cfg.sti_rent_per_tick ?? 0.2;

  UPDATE trace_state SET sti = math::max([0.0, (sti ?? 0) - $rent])
    WHERE archived = false AND (sti ?? 0) > 0;

  RETURN true;
};

-- ═══════════════════════════════════════════
-- fn::hebbian_bind_af — create Hebbian links between all AF members
-- Pure co-activation: anything in focus together gets linked.
-- This is how language binds to concepts without hardcoded mapping.
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::hebbian_bind_af() {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $af = fn::get_attentional_focus();

  IF array::len($af) < 2 { RETURN { bound: 0 }; };

  -- Pick the hottest trace (highest STI) as source
  LET $source = $af[0];
  LET $source_rec = (SELECT id FROM trace WHERE trace_id = $source.trace_id AND archived = false LIMIT 1)[0];
  IF $source_rec IS NONE { RETURN { bound: 0 }; };

  -- Bind to other AF members
  LET $bound = 0;
  FOR $target IN array::slice($af, 1, array::len($af)) {
    LET $target_rec = (SELECT id FROM trace WHERE trace_id = $target.trace_id AND archived = false LIMIT 1)[0];
    IF $target_rec IS NOT NONE AND $target_rec.id IS NOT NONE AND $source_rec.id != $target_rec.id {
      -- Compute co-activation strength
      LET $norm_src = ($source.sti ?? 0) / 10.0;
      LET $norm_tgt = ($target.sti ?? 0) / 10.0;
      LET $strength = $norm_src * $norm_tgt;

      IF $strength > ($cfg.hebbian_creation_threshold ?? 0.01) {
        -- Check if lexical_binding exists (for speech↔sensorimotor)
        LET $is_speech_src = string::starts_with($source.content ?? '', 'speech:');
        LET $is_speech_tgt = string::starts_with($target.content ?? '', 'speech:');

        IF $is_speech_src OR $is_speech_tgt {
          -- Language binding: speech ↔ sensorimotor
          LET $speech_id = IF $is_speech_src THEN $source_rec.id ELSE $target_rec.id END;
          LET $motor_id = IF $is_speech_src THEN $target_rec.id ELSE $source_rec.id END;

          LET $existing = (SELECT id, weight, co_occurrence_count FROM lexical_binding
            WHERE in = $speech_id AND out = $motor_id LIMIT 1)[0];

          IF $existing IS NOT NONE {
            -- Strengthen: EMA update (0.1 * new + 0.9 * old)
            UPDATE lexical_binding SET
              weight = 0.1 * $strength + 0.9 * (weight ?? 0),
              co_occurrence_count = (co_occurrence_count ?? 0) + 1,
              last_cycle = (SELECT cycle FROM kernel_state LIMIT 1)[0].cycle ?? 0
            WHERE id = $existing.id;
          } ELSE {
            RELATE ($speech_id)->lexical_binding->($motor_id) SET
              weight = $strength,
              co_occurrence_count = 1,
              created_cycle = (SELECT cycle FROM kernel_state LIMIT 1)[0].cycle ?? 0,
              last_cycle = (SELECT cycle FROM kernel_state LIMIT 1)[0].cycle ?? 0;
          };
          LET $bound = $bound + 1;
        } ELSE {
          -- Non-language: structural Hebbian (activates)
          LET $existing = (SELECT id FROM activates
            WHERE in = $source_rec.id AND out = $target_rec.id LIMIT 1)[0];
          IF $existing IS NONE AND $source_rec.id IS NOT NONE AND $target_rec.id IS NOT NONE {
            RELATE ($source_rec.id)->activates->($target_rec.id) SET
              weight = $strength * 0.3,
              co_activation_count = 1,
              eligibility = 0;
          } ELSE IF $existing IS NOT NONE {
            UPDATE activates SET
              weight = math::min([1.0, weight + $strength * 0.05]),
              co_activation_count = (co_activation_count ?? 0) + 1
            WHERE id = $existing.id;
          };
          LET $bound = $bound + 1;
        };
      };
    };
  };

  RETURN { bound: $bound, af_size: array::len($af) };
};

-- ═══════════════════════════════════════════
-- fn::sti_diffuse — spread STI along Hebbian/lexical links
-- Activating "мячик" word → spreads STI to bound concept traces.
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::sti_diffuse() {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $rate = $cfg.sti_diffusion_rate ?? 0.1;

  -- Find traces with STI to spread
  LET $hot = (SELECT trace_id, sti FROM trace_state
    WHERE archived = false AND (sti ?? 0) > 1.0
    LIMIT 10);

  FOR $h IN $hot {
    LET $trace_rec = (SELECT id FROM trace WHERE trace_id = $h.trace_id LIMIT 1)[0];
    IF $trace_rec IS NOT NONE {
      LET $spread = ($h.sti ?? 0) * $rate;

      -- Spread via lexical_binding
      LET $lex_targets = (SELECT out.trace_id AS tid, weight FROM lexical_binding
        WHERE in = $trace_rec.id AND weight > 0.1 LIMIT 5);
      FOR $lt IN $lex_targets {
        IF $lt.tid IS NOT NONE {
          UPDATE trace_state SET sti = (sti ?? 0) + $spread * ($lt.weight ?? 0.1)
            WHERE trace_id = $lt.tid AND archived = false;
        };
      };

      -- Spread via activates
      LET $act_targets = (SELECT out.trace_id AS tid, weight FROM activates
        WHERE in = $trace_rec.id AND weight > 0.1 LIMIT 5);
      FOR $at IN $act_targets {
        IF $at.tid IS NOT NONE {
          UPDATE trace_state SET sti = (sti ?? 0) + $spread * ($at.weight ?? 0.1)
            WHERE trace_id = $at.tid AND archived = false;
        };
      };

      -- Deduct spread from source (conservation)
      UPDATE trace_state SET sti = math::max([0.0, sti - $spread])
        WHERE trace_id = $h.trace_id AND archived = false;
    };
  };

  RETURN true;
};

-- ═══════════════════════════════════════════
-- fn::process_sensory — stimulate STI on perception
-- Brain perceives → trace gets STI boost → enters AF.
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::process_sensory(
  $action_id: int, $channels: array, $speech: array, $valence: float, $object_idx: int
) {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $cap = $cfg.accumulator_cap ?? 5.0;

  LET $position = array::concat($channels, $speech);
  LET $padded = IF array::len($position) < 64 THEN
    array::concat($position, [0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f])
  ELSE $position END;
  LET $pos64 = array::slice($padded, 0, 64);

  LET $trace_key = type::string($action_id) + ':' + type::string($object_idx);
  LET $cycle = (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0;

  LET $existing_state = (SELECT * FROM trace_state WHERE content = $trace_key AND archived = false LIMIT 1)[0];

  IF $existing_state != NONE {
    -- Reactivation
    UPDATE trace_state SET
      weight = math::min([1.0, weight + ($cfg.reactivation_weight_boost ?? 0.1) + math::abs($valence) * ($cfg.reactivation_valence_scale ?? 0.2)]),
      freshness = 1.0,
      reactivation_count = reactivation_count + 1,
      emotional_charge = emotional_charge * ($cfg.emotional_blend_old ?? 0.7) + $valence * ($cfg.emotional_blend_new ?? 0.3),
      sti = (sti ?? 0) + ($cfg.sti_stimulus_sensory ?? 5.0),
      cycle = $cycle
    WHERE id = $existing_state.id;

    UPDATE trace SET position = $pos64 WHERE id = $existing_state.trace;

    -- Accumulators
    UPDATE nn_node SET value = math::min([$cap, value + ($cfg.acc_convergence_boost ?? 0.1)]) WHERE node_id = 'acc:convergence';
    UPDATE nn_node SET value = math::min([$cap, value + ($cfg.acc_stability_boost ?? 0.15)]) WHERE node_id = 'acc:stability';

    LET $old_charge = $existing_state.emotional_charge ?? 0;
    IF ($old_charge > 0 AND $valence < 0) OR ($old_charge < 0 AND $valence > 0) {
      fn::hormone_spike('norepinephrine', $cfg.ne_spike_pred_error ?? 0.25);
      UPDATE nn_node SET value = math::min([$cap, value + ($cfg.acc_pred_error_boost ?? 0.3)]) WHERE node_id = 'acc:pred_error';
    };

    IF $valence > ($cfg.accumulator_valence_threshold ?? 0.1) {
      UPDATE nn_node SET value = math::min([$cap, value + $valence]) WHERE node_id = 'acc:reward';
      fn::hormone_spike('dopamine', $valence * ($cfg.da_spike_reward ?? 0.2));
    };
    IF $valence < (0.0 - ($cfg.accumulator_valence_threshold ?? 0.1)) {
      UPDATE nn_node SET value = math::min([$cap, value + math::abs($valence)]) WHERE node_id = 'acc:pain';
      fn::hormone_spike('cortisol', math::abs($valence) * ($cfg.cortisol_spike_pain ?? 0.4));
    };

    LET $trace_obj = (SELECT trace_id FROM trace WHERE id = $existing_state.trace LIMIT 1)[0];
    RETURN { trace_id: $trace_obj.trace_id ?? '', is_new: false };
  };

  -- New trace
  LET $trace_id = 'T' + rand::string(8);
  CREATE trace CONTENT {
    trace_id: $trace_id, source_type: 'event', source_id: type::string($action_id),
    content: $trace_key,
    weight: ($cfg.initial_trace_weight ?? 0.5) + math::abs($valence) * ($cfg.initial_trace_valence_scale ?? 0.3),
    initial_weight: $cfg.initial_trace_weight ?? 0.5,
    freshness: 1.0, confidence: 0.5, emotional_charge: $valence,
    reactivation_count: 0, reactivation_history: [],
    created_at_cycle: $cycle, last_reactivated_cycle: $cycle,
    position: $pos64,
    velocity: [0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f,0f],
    suppressed: false, archived: false
  };

  LET $trace_rec = (SELECT id FROM trace WHERE trace_id = $trace_id LIMIT 1)[0];
  CREATE trace_state SET
    trace = $trace_rec.id, trace_id = $trace_id, content = $trace_key,
    weight = ($cfg.initial_trace_weight ?? 0.5) + math::abs($valence) * ($cfg.initial_trace_valence_scale ?? 0.3),
    freshness = 1.0, emotional_charge = $valence, reactivation_count = 0,
    sti = $cfg.sti_stimulus_sensory ?? 5.0,
    archived = false, suppressed = false, cycle = $cycle;

  UPDATE nn_node SET value = math::min([$cap, value + ($cfg.acc_novelty_boost ?? 0.2)]) WHERE node_id = 'acc:novelty';
  UPDATE nn_node SET value = math::min([$cap, value + ($cfg.acc_pred_error_boost ?? 0.3)]) WHERE node_id = 'acc:pred_error';
  fn::hormone_spike('dopamine', $cfg.da_spike_novelty ?? 0.1);
  fn::hormone_spike('norepinephrine', $cfg.ne_spike_novelty ?? 0.15);

  IF $valence > ($cfg.accumulator_valence_threshold ?? 0.1) {
    UPDATE nn_node SET value = math::min([$cap, value + $valence]) WHERE node_id = 'acc:reward';
  };
  IF $valence < (0.0 - ($cfg.accumulator_valence_threshold ?? 0.1)) {
    UPDATE nn_node SET value = math::min([$cap, value + math::abs($valence)]) WHERE node_id = 'acc:pain';
  };

  RETURN { trace_id: $trace_id, is_new: true };
};

-- ═══════════════════════════════════════════
-- fn::process_speech — NO object_idx. Pure STI stimulation.
-- Word enters AF. Binding happens in hebbian_bind_af.
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::process_speech($speech: array, $valence: float) {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $cycle = (SELECT cycle FROM kernel_state LIMIT 1)[0].cycle ?? 0;

  LET $speech_key = 'speech:' + type::string($speech);

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
      reactivation_count = 0, sti = $cfg.sti_stimulus_speech ?? 8.0,
      archived = false, suppressed = false, cycle = $cycle;
  } ELSE {
    -- Reactivate + STI boost
    UPDATE trace_state SET
      weight = math::min([1.0, weight + 0.1]),
      freshness = 1.0,
      reactivation_count = reactivation_count + 1,
      sti = (sti ?? 0) + ($cfg.sti_stimulus_speech ?? 8.0),
      cycle = $cycle
    WHERE id = $existing.id;
  };

  -- NO binding here. Binding happens in hebbian_bind_af
  -- when this speech trace enters AF alongside sensorimotor traces.

  RETURN { speech_key: $speech_key };
};

-- ═══════════════════════════════════════════
-- fn::process_one_input — remove object_idx from speech
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::process_one_input($inp: object) {
  LET $action = $inp.action_id ?? 0;

  IF $action < 0 {
    -- Speech: just stimulate, no object_idx binding
    fn::process_speech($inp.speech ?? [], $inp.valence ?? 0);
    RETURN true;
  };

  -- Sensory: creates/reactivates trace with STI boost
  fn::process_sensory($action, $inp.channels ?? [], $inp.speech ?? [],
    $inp.valence ?? 0, $inp.object_idx ?? 0);

  -- Consequence: extra STI + cognitive cycle + predictor
  IF $inp.is_consequence = true {
    LET $tkey = type::string($action) + ':' + type::string($inp.object_idx ?? 0);
    LET $tr = (SELECT trace_id FROM trace_state WHERE content = $tkey AND archived = false LIMIT 1)[0];
    IF $tr IS NOT NONE AND $tr.trace_id IS NOT NONE {
      -- Extra STI for consequences (brain pays more attention to action results)
      LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
      fn::stimulate($tr.trace_id, $cfg.sti_stimulus_consequence ?? 10.0);

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
