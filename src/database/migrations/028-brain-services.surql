-- Migration 028: Move remaining brain services into SurrealDB
-- WorldModel, Introspection, Narrative, BeliefDecay — all pure logic → stored procs.
-- The brain must be able to introspect and update itself without NestJS.

-- ═══════════════════════════════════════════
-- 1. fn::build_world_model — assembles unified world model
-- Was: WorldModelService.build() (290 lines JS, 12 subqueries)
-- Now: one stored proc, zero NestJS
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::build_world_model() {
  LET $beliefs = (SELECT count() AS c, math::mean(confidence) AS avg FROM belief WHERE status = 'active' GROUP ALL);
  LET $axioms = (SELECT belief_id AS id, content, confidence FROM belief WHERE string::starts_with(belief_id, 'I') AND status = 'active');
  LET $knowledge_count = (SELECT count() AS c FROM knowledge WHERE status = 'active' GROUP ALL);
  LET $k_axioms = (SELECT knowledge_id AS id, content FROM knowledge WHERE kind = 'axiom' AND status = 'active');
  LET $intentions = (SELECT * FROM intention WHERE status IN ['recognized', 'adopted', 'active', 'suspended'] ORDER BY priority DESC LIMIT 20);
  LET $gaps_open = (SELECT * FROM knowledge_gap WHERE status = 'open' ORDER BY impact DESC);
  LET $gaps_high = (SELECT * FROM knowledge_gap WHERE status = 'open' AND impact >= 0.7);
  LET $ep_stats = (SELECT count() AS total FROM episode GROUP ALL);
  LET $ep_success = (SELECT count() AS c FROM episode WHERE outcome IN ['success', 'partial_success'] GROUP ALL);
  LET $contradictions = (SELECT count() AS c FROM contradicts GROUP ALL);

  LET $belief_count = $beliefs[0].c ?? 0;
  LET $avg_conf = $beliefs[0].avg ?? 0.0;
  LET $k_count = $knowledge_count[0].c ?? 0;
  LET $ep_total = $ep_stats[0].total ?? 0;
  LET $ep_succ = $ep_success[0].c ?? 0;
  LET $gap_count = array::len($gaps_open);
  LET $contra_count = $contradictions[0].c ?? 0;

  LET $success_rate = IF $ep_total > 0 THEN $ep_succ / $ep_total ELSE 0.5 END;

  -- Confidence = weighted formula
  LET $confidence = math::min([1.0,
    ($belief_count / 20.0) * 0.2 +
    ($k_count / 10.0) * 0.15 +
    (array::len($intentions) / 5.0) * 0.15 +
    $success_rate * 0.2 +
    $avg_conf * 0.15 +
    (1.0 - math::min([1.0, $gap_count / 10.0])) * 0.1 +
    (1.0 - math::min([1.0, $contra_count / 5.0])) * 0.05
  ]);

  RETURN {
    beliefs: { count: $belief_count, avg_confidence: $avg_conf },
    axioms: $axioms,
    knowledge_count: $k_count,
    knowledge_axioms: $k_axioms,
    intentions: $intentions,
    gaps_open: $gaps_open,
    gaps_high: $gaps_high,
    episode_stats: { total: $ep_total, successes: $ep_succ, success_rate: $success_rate },
    contradictions: $contra_count,
    confidence: $confidence
  };
};

-- ═══════════════════════════════════════════
-- 2. fn::introspect — coherence + posture
-- Was: IntrospectionService.calculateCoherence/classifyPosture
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::introspect() {
  LET $beliefs = (SELECT confidence FROM belief WHERE status = 'active');
  LET $total = array::len($beliefs);
  IF $total = 0 { RETURN { coherence: 0.5, posture: 'review', low_count: 0 }; };

  LET $avg_conf = math::mean($beliefs.confidence);
  LET $low = array::len($beliefs.filter(|$b| $b.confidence < 0.3));
  LET $contradictions = (SELECT count() AS c FROM contradicts GROUP ALL)[0].c ?? 0;

  -- Coherence = avg_confidence × 0.6 + (1 - low_ratio) × 0.3 - contradiction_penalty × 0.1
  LET $low_ratio = $low / $total;
  LET $contra_penalty = math::min([1.0, $contradictions / 5.0]);
  LET $coherence = math::max([0.0, math::min([1.0,
    $avg_conf * 0.6 + (1.0 - $low_ratio) * 0.3 - $contra_penalty * 0.1
  ])]);

  LET $posture = IF $coherence >= 0.7 THEN 'stable'
    ELSE IF $coherence >= 0.4 THEN 'review'
    ELSE 'repair' END;

  RETURN {
    coherence: $coherence,
    posture: $posture,
    low_confidence_count: $low,
    total_beliefs: $total,
    contradictions: $contradictions
  };
};

-- ═══════════════════════════════════════════
-- 3. fn::narrative_compact — deterministic narrative compaction
-- Was: NarrativeService.compact() (rule-based path)
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::narrative_compact($window_size: int) {
  -- Get commits outside attention window
  LET $all_commits = (SELECT * FROM commit_log ORDER BY id ASC);
  LET $total = array::len($all_commits);
  IF $total <= $window_size { RETURN { compacted: 0, frames: 0 }; };

  LET $old_count = $total - $window_size;
  LET $old_commits = array::slice($all_commits, 0, $old_count);

  -- Compute stats for old commits
  LET $types = $old_commits.map(|$c| $c.type);
  LET $avg_novelty = math::mean($old_commits.map(|$c| $c.novelty_cost ?? 0.0));
  LET $avg_error = math::mean($old_commits.map(|$c| $c.prediction_error ?? 0.0));
  LET $escalations = array::len($old_commits.filter(|$c| $c.is_escalation = true));

  -- Create narrative frame
  CREATE narrative_frame CONTENT {
    commit_count: $old_count,
    avg_novelty: $avg_novelty,
    avg_prediction_error: $avg_error,
    escalation_count: $escalations,
    temporal_quality: IF $avg_error < 0.2 THEN 'stable' ELSE IF $avg_error < 0.5 THEN 'learning' ELSE 'turbulent' END,
    created_at: time::now()
  };

  -- Delete compacted commits
  FOR $c IN $old_commits {
    DELETE $c.id;
  };

  RETURN { compacted: $old_count, frames: 1 };
};

-- ═══════════════════════════════════════════
-- 4. fn::belief_decay — age-based confidence decay
-- Was: BeliefDecayService.runDecayCycle()
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::belief_decay($decay_rate: float) {
  -- Decay non-axiom beliefs
  LET $decayed = (UPDATE belief SET
    confidence = math::max([0.0, confidence - $decay_rate])
  WHERE status = 'active'
    AND decay_mode != 'no_decay'
    AND confidence > confidence_floor
  RETURN BEFORE);

  -- Flag beliefs needing review
  UPDATE belief SET status = 'review_needed'
  WHERE status = 'active' AND confidence < review_threshold;

  RETURN { decayed: array::len($decayed) };
};

-- ═══════════════════════════════════════════
-- 5. fn::nightly_run — all deterministic nightly stages
-- Was: NightlyService 12-stage orchestration (deterministic parts)
-- LLM stages stay in NestJS
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::nightly_run() {
  -- Stage 1: Memory aggregation (count recent activity)
  LET $mem_stats = (SELECT count() AS c FROM activity_log GROUP ALL);

  -- Stage 2: Introspection (coherence + posture)
  LET $intro = fn::introspect();

  -- Stage 3: Belief decay
  LET $decay = fn::belief_decay(0.01);

  -- Stage 4: World model rebuild
  LET $wm = fn::build_world_model();

  -- Stage 5: Narrative compaction
  LET $narrative = fn::narrative_compact(50);

  -- Stage 6: Neural graph maintenance
  fn::nn_decay_all(0.002);

  -- Stage 7: Sleep consolidation
  LET $sleep = fn::sleep_consolidation(0.001);

  -- Stage 8: Kernel state update
  UPDATE kernel_state SET
    mode = 'default',
    last_tick_at = time::now();

  RETURN {
    memory_count: $mem_stats[0].c ?? 0,
    introspection: $intro,
    decay: $decay,
    world_model_confidence: $wm.confidence,
    narrative: $narrative,
    sleep: $sleep
  };
};
