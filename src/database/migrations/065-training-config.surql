-- Migration 065: Training Configuration + Unified Report
-- Fixes known issues before proper curriculum training.

-- ═══════════════════════════════════════════
-- 1. CONFIG FIXES
-- ═══════════════════════════════════════════

UPDATE kernel_state SET
  -- Accumulator balance (was capping too fast)
  config.accumulator_cap = 5.0,
  config.accumulator_decay = 0.9995,
  config.accumulator_floor = 0.01,
  -- Language (stricter grounding, no production until Phase 5)
  config.lang_binding_threshold = 10,
  config.speech_attempt_prob = 0.0,
  -- Energy (longer awake periods)
  config.energy_drain_rate = 0.005,
  -- Predictor (more learning)
  config.predictor_replay_batch = 10;

-- ═══════════════════════════════════════════
-- 2. TRAINING CHECKPOINT TABLE
-- ═══════════════════════════════════════════

DEFINE TABLE IF NOT EXISTS training_checkpoint SCHEMALESS;

-- ═══════════════════════════════════════════
-- 3. fn::training_report — unified metrics in one call
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::training_report() {
  LET $s = (SELECT cycle, energy, fatigue FROM kernel_state LIMIT 1)[0];
  LET $tr_active = (SELECT count() AS c FROM trace_state WHERE archived = false GROUP ALL)[0].c ?? 0;
  LET $tr_archived = (SELECT count() AS c FROM trace WHERE archived = true GROUP ALL)[0].c ?? 0;
  LET $edges = (SELECT count() AS c FROM activates WHERE (archived IS NONE OR archived = false) GROUP ALL)[0].c ?? 0;
  LET $hebbian = (SELECT count() AS c FROM hebbian GROUP ALL)[0].c ?? 0;
  LET $qv = (SELECT count() AS c FROM action_value WHERE update_count > 0 GROUP ALL)[0].c ?? 0;
  LET $qv_total = (SELECT math::sum(update_count) AS s FROM action_value GROUP ALL)[0].s ?? 0;
  LET $ce = (SELECT count() AS c FROM cognitive_event GROUP ALL)[0].c ?? 0;
  LET $rpe = IF $ce > 10
    THEN (SELECT math::mean(math::abs(prediction_error)) AS r FROM cognitive_event GROUP ALL)[0].r ?? 0
    ELSE NONE END;

  LET $horms = (SELECT node_id, `value` AS val FROM nn_node WHERE model = 'affect' AND layer = 'hidden');
  LET $accs = (SELECT node_id, `value` AS val FROM nn_node WHERE model = 'affect' AND layer = 'input');

  LET $lang = fn::language_report();
  LET $causal = (SELECT count() AS c FROM causal_link GROUP ALL)[0].c ?? 0;
  LET $speech_out = (SELECT count() AS c FROM speech_output GROUP ALL)[0].c ?? 0;
  LET $self_traces = (SELECT count() AS c FROM trace WHERE source_type = 'introspective' AND archived = false GROUP ALL)[0].c ?? 0;
  LET $predictor_trans = (SELECT count() AS c FROM sensorimotor_transition GROUP ALL)[0].c ?? 0;
  LET $sections = (SELECT count() AS c FROM trace_section WHERE connector_count > 0 GROUP ALL)[0].c ?? 0;

  LET $maturity = fn::compute_maturity();

  RETURN {
    cycle: $s.cycle ?? 0,
    energy: $s.energy ?? 0,
    fatigue: $s.fatigue ?? 0,
    traces: { active: $tr_active, archived: $tr_archived },
    edges: $edges,
    hebbian: $hebbian,
    q_learning: { pairs: $qv, total_updates: $qv_total },
    cognitive_events: $ce,
    mean_rpe: $rpe,
    hormones: $horms,
    accumulators: $accs,
    language: $lang,
    causal_links: $causal,
    speech_outputs: $speech_out,
    self_traces: $self_traces,
    predictor_transitions: $predictor_trans,
    sheaf_sections: $sections,
    maturity: $maturity
  };
};
