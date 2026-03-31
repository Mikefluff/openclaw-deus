-- Migration 037: Wire Graph×Vector into Brain Tick
-- Cosine-weighted spreading, vector pruning in LOW circuit,
-- fix consolidate_episodic hardcodes, add config params.

-- ═══════════════════════════════════════════
-- 1. CONFIG: add graph×vector params
-- ═══════════════════════════════════════════

-- Ensure ALL config params from 035 + 037 are seeded
UPDATE kernel_state SET
  -- From 035: agency
  config.agency_energy_threshold = config.agency_energy_threshold ?? 0.15,
  config.explore_dopamine_coeff = config.explore_dopamine_coeff ?? 0.4,
  config.explore_ne_coeff = config.explore_ne_coeff ?? 0.3,
  config.explore_cortisol_coeff = config.explore_cortisol_coeff ?? 0.2,
  config.explore_min = config.explore_min ?? 0.1,
  config.explore_max = config.explore_max ?? 0.9,
  config.explore_threshold = config.explore_threshold ?? 0.6,
  config.action_energy_cost = config.action_energy_cost ?? 0.05,
  -- From 035: trace creation
  config.reactivation_weight_boost = config.reactivation_weight_boost ?? 0.1,
  config.reactivation_valence_scale = config.reactivation_valence_scale ?? 0.2,
  config.emotional_blend_old = config.emotional_blend_old ?? 0.7,
  config.emotional_blend_new = config.emotional_blend_new ?? 0.3,
  config.initial_trace_weight = config.initial_trace_weight ?? 0.5,
  config.initial_trace_valence_scale = config.initial_trace_valence_scale ?? 0.3,
  -- From 035: accumulators
  config.accumulator_valence_threshold = config.accumulator_valence_threshold ?? 0.1,
  config.acc_pred_error_boost = config.acc_pred_error_boost ?? 0.3,
  config.acc_novelty_boost = config.acc_novelty_boost ?? 0.2,
  config.acc_convergence_boost = config.acc_convergence_boost ?? 0.1,
  config.accumulator_cap = config.accumulator_cap ?? 5.0,
  config.accumulator_decay = config.accumulator_decay ?? 0.99,
  -- From 035: brain tick frequencies
  config.freq_critical = config.freq_critical ?? 100,
  config.freq_high = config.freq_high ?? 100,
  config.freq_trace_decay = config.freq_trace_decay ?? 50,
  config.freq_agency = config.freq_agency ?? 200,
  config.freq_medium = config.freq_medium ?? 500,
  config.freq_low = config.freq_low ?? 2000,
  config.freq_deep = config.freq_deep ?? 5000,
  -- From 035: energy
  config.energy_drain_rate = config.energy_drain_rate ?? 0.002,
  config.fatigue_rate = config.fatigue_rate ?? 0.001,
  config.sleep_threshold = config.sleep_threshold ?? 0.1,
  -- From 035: three-factor learning
  config.hebbian_lr = config.hebbian_lr ?? 0.01,
  config.td_gamma = config.td_gamma ?? 0.9,
  config.eligibility_decay = config.eligibility_decay ?? 0.95,
  -- From 035: edge creation
  config.initial_edge_weight = config.initial_edge_weight ?? 0.3,
  config.edge_coactivation_boost = config.edge_coactivation_boost ?? 0.05,
  -- From 035: nightly
  config.nightly_fatigue_threshold = config.nightly_fatigue_threshold ?? 0.3,
  config.nightly_energy_threshold = config.nightly_energy_threshold ?? 0.5,
  -- From 035: depth thresholds
  config.depth_reflect = config.depth_reflect ?? 3,
  config.depth_restructure = config.depth_restructure ?? 5,
  config.depth_consolidate = config.depth_consolidate ?? 10,
  -- From 037: graph×vector
  config.active_inference_threshold = config.active_inference_threshold ?? 0.3,
  config.active_inference_limit = config.active_inference_limit ?? 10,
  config.cosine_spread_floor = config.cosine_spread_floor ?? 0.2,
  config.prune_min_similarity = config.prune_min_similarity ?? 0.15,
  config.prune_freq_multiplier = config.prune_freq_multiplier ?? 3,
  config.consolidation_min_count = config.consolidation_min_count ?? 3,
  config.consolidation_promote_boost = config.consolidation_promote_boost ?? 0.15,
  config.consolidation_decay = config.consolidation_decay ?? 0.95,
  config.nn_decay_rate = config.nn_decay_rate ?? 0.001,
  config.forget_weight_threshold = config.forget_weight_threshold ?? 0.02,
  config.forget_freshness_threshold = config.forget_freshness_threshold ?? 0.03,
  config.trace_weight_decay = config.trace_weight_decay ?? 0.999,
  config.trace_freshness_decay = config.trace_freshness_decay ?? 0.999,
  config.spread_weight_rate = config.spread_weight_rate ?? 0.05,
  config.spread_freshness_rate = config.spread_freshness_rate ?? 0.02,
  config.sleep_energy_restore = config.sleep_energy_restore ?? 0.8,
  config.sleep_energy_cap = config.sleep_energy_cap ?? 1.5,
  config.trace_decay_min_weight = config.trace_decay_min_weight ?? 0.05,
  config.episodic_archive_threshold = config.episodic_archive_threshold ?? 0.01;

-- ═══════════════════════════════════════════
-- 2. fn::active_inference — cosine-weighted spreading activation
-- Strong edges with similar positions → stronger inference signal
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::active_inference($strength_threshold: float, $limit: int) {
  LET $cfg = (SELECT * FROM kernel_state LIMIT 1)[0].config ?? {};
  LET $floor = $cfg.cosine_spread_floor ?? 0.2;
  LET $w_rate = $cfg.spread_weight_rate ?? 0.05;
  LET $f_rate = $cfg.spread_freshness_rate ?? 0.02;

  LET $chains = (SELECT
    in AS source_node, in.trace_id AS source_id, in.content AS source_content,
    in.weight AS source_weight, in.position AS source_pos,
    out AS mid_node, out.trace_id AS mid_id, out.weight AS mid_weight,
    out.confidence AS mid_confidence, out.position AS mid_pos,
    weight AS first_weight
  FROM activates
  WHERE weight > $strength_threshold AND in.archived = false AND out.archived = false
  LIMIT $limit);

  FOR $c IN $chains {
    -- Cosine similarity between source and mid positions
    LET $sim = IF $c.source_pos IS NOT NONE AND $c.mid_pos IS NOT NONE
      AND array::len($c.source_pos) > 0 AND array::len($c.mid_pos) > 0
      THEN vector::similarity::cosine($c.source_pos, $c.mid_pos)
      ELSE 0.5
    END;
    LET $boost = math::max([$floor, $sim]);

    -- Spread activation: mid node gets weight boost proportional to edge weight × cosine similarity
    UPDATE trace SET
      weight = math::clamp(weight + $c.first_weight * $boost * $w_rate, 0.01, 1.0),
      freshness = math::min([1.0, freshness + $boost * $f_rate])
    WHERE trace_id = $c.mid_id AND archived = false;
  };

  RETURN { spread: array::len($chains) };
};

-- ═══════════════════════════════════════════
-- 3. fn::consolidate_episodic — zero hardcode, ARCHIVE not DELETE
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::consolidate_episodic($min_count: int) {
  LET $cfg = (SELECT * FROM kernel_state LIMIT 1)[0].config ?? {};
  LET $promote_boost = $cfg.consolidation_promote_boost ?? 0.15;
  LET $decay = $cfg.consolidation_decay ?? 0.95;

  LET $patterns = (SELECT * FROM (
    SELECT in.trace_id AS from_id, out.trace_id AS to_id, count() AS cnt
    FROM episodic GROUP BY in, out
  ) WHERE cnt >= $min_count LIMIT 20);

  FOR $p IN $patterns {
    RELATE (SELECT id FROM trace WHERE trace_id = $p.from_id LIMIT 1)->activates->(SELECT id FROM trace WHERE trace_id = $p.to_id LIMIT 1)
      SET weight = math::clamp(weight + $promote_boost, 0.01, 1.0);
    -- Archive consolidated episodic edges (not delete)
    UPDATE episodic SET archived = true WHERE in.trace_id = $p.from_id AND out.trace_id = $p.to_id;
  };

  -- Decay remaining active episodic edges
  LET $archive_thresh = $cfg.episodic_archive_threshold ?? 0.01;
  UPDATE episodic SET weight = weight * $decay WHERE weight > $archive_thresh AND (archived IS NONE OR archived = false);

  -- Archive faded
  UPDATE episodic SET archived = true WHERE weight < $archive_thresh;

  RETURN { consolidated: array::len($patterns) };
};

-- ═══════════════════════════════════════════
-- 4. fn::brain_tick — all from config, prune in LOW, cosine in MEDIUM
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::brain_tick($n: int) {
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  LET $cfg = $state.config ?? {};

  LET $freq_crit = $cfg.freq_critical ?? 100;
  LET $freq_high = $cfg.freq_high ?? 100;
  LET $freq_trace = $cfg.freq_trace_decay ?? 50;
  LET $freq_agency = $cfg.freq_agency ?? 200;
  LET $freq_med = $cfg.freq_medium ?? 500;
  LET $freq_low = $cfg.freq_low ?? 2000;
  LET $freq_deep = $cfg.freq_deep ?? 5000;

  FOR $x IN 0..$n {
    -- CRITICAL: energy + sleep
    IF $x % $freq_crit = 0 {
      UPDATE kernel_state SET
        cycle = (cycle ?? 0) + $freq_crit,
        energy = math::max([0.0, (energy ?? 1.0) - ($cfg.energy_drain_rate ?? 0.002) * $freq_crit * (1.0 + (fatigue ?? 0.0))]),
        fatigue = math::min([1.0, (fatigue ?? 0.0) + ($cfg.fatigue_rate ?? 0.001) * $freq_crit]);
      LET $e = (SELECT * FROM kernel_state LIMIT 1)[0].energy ?? 0;
      IF $e < ($cfg.sleep_threshold ?? 0.1) {
        fn::sleep_consolidation($cfg.nn_decay_rate ?? 0.001);
        UPDATE kernel_state SET energy = math::min([($cfg.sleep_energy_cap ?? 1.5), energy + ($cfg.sleep_energy_restore ?? 0.8)]), fatigue = 0.0;
      };
    };

    -- HIGH: affect forward
    IF $x % $freq_high = 0 {
      LET $h_nodes = (SELECT id, bias FROM nn_node WHERE model = 'affect' AND layer = 'hidden');
      FOR $h IN $h_nodes {
        LET $ws = (SELECT math::sum(in.value * weight) AS s FROM nn_edge
          WHERE out = $h.id AND in.layer = 'input' GROUP ALL)[0].s ?? 0.0;
        UPDATE nn_node SET value = fn::sigmoid($ws + $h.bias) WHERE id = $h.id;
      };

      -- Backward
      LET $pred_err = (SELECT * FROM nn_node WHERE node_id = 'acc:pred_error' LIMIT 1)[0].value ?? 0;
      LET $pain = (SELECT * FROM nn_node WHERE node_id = 'acc:pain' LIMIT 1)[0].value ?? 0;
      LET $convergence = (SELECT * FROM nn_node WHERE node_id = 'acc:convergence' LIMIT 1)[0].value ?? 0;
      LET $reward = (SELECT * FROM nn_node WHERE node_id = 'acc:reward' LIMIT 1)[0].value ?? 0;
      LET $loss = $pred_err + $pain - $convergence - $reward;
      LET $loss_sign = IF $loss > 0 THEN 1.0 ELSE -1.0 END;
      fn::nn_backward('affect', $cfg.hebbian_lr ?? 0.01, $loss_sign);

      -- Decay accumulators
      UPDATE nn_node SET value = value * ($cfg.accumulator_decay ?? 0.99) WHERE model = 'affect' AND layer = 'input';
    };

    -- Trace decay (from config)
    IF $x % $freq_trace = 0 {
      UPDATE trace SET
        weight = weight * ($cfg.trace_weight_decay ?? 0.999),
        freshness = freshness * ($cfg.trace_freshness_decay ?? 0.999)
      WHERE archived = false AND weight > ($cfg.trace_decay_min_weight ?? 0.05);
    };

    -- AGENCY: brain decides to act
    IF $x % $freq_agency = 0 { fn::agency_tick($x); };

    -- MEDIUM: cosine-weighted inference + forget + eligibility decay
    IF $x % $freq_med = 0 {
      fn::active_inference($cfg.active_inference_threshold ?? 0.3, $cfg.active_inference_limit ?? 10);
      fn::forget_traces($cfg.forget_weight_threshold ?? 0.02, $cfg.forget_freshness_threshold ?? 0.03);
      fn::decay_eligibility();
    };

    -- LOW: neural decay + consolidation + vector pruning
    IF $x % $freq_low = 0 {
      fn::nn_decay_all($cfg.nn_decay_rate ?? 0.001);
      fn::consolidate_episodic($cfg.consolidation_min_count ?? 3);
      -- Prune edges between vector-dissimilar traces every Nth LOW tick
      IF $x % ($freq_low * ($cfg.prune_freq_multiplier ?? 3)) = 0 {
        fn::prune_dissimilar_edges($cfg.prune_min_similarity ?? 0.15);
      };
    };

    -- DEEP: world model + introspection
    IF $x % $freq_deep = 0 { fn::build_world_model(); fn::introspect(); };
  };

  RETURN (SELECT * FROM kernel_state LIMIT 1)[0];
};
