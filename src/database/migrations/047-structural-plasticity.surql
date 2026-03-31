-- Migration 047: Structural Plasticity
-- Principled edge growth + pruning based on Butz-Wörgötter homeostatic model.
-- Replaces random sprouting with activity-dependent + distance-weighted connections.
-- Sleep consolidation: prune weak, strengthen strong (Tononi SHY).

-- ═══════════════════════════════════════════
-- 1. CONFIG
-- ═══════════════════════════════════════════

UPDATE kernel_state SET
  -- Synaptic element growth
  config.growth_rate = config.growth_rate ?? 0.01,
  config.growth_target_activity = config.growth_target_activity ?? 0.3,
  config.growth_sigma = config.growth_sigma ?? 0.2,

  -- Sprouting
  config.sprout_distance_threshold = config.sprout_distance_threshold ?? 0.8,
  config.sprout_initial_weight = config.sprout_initial_weight ?? 0.15,

  -- Pruning
  config.prune_inactivity_cycles = config.prune_inactivity_cycles ?? 5000,
  config.prune_max_per_call = config.prune_max_per_call ?? 3,
  config.max_incoming_edges = config.max_incoming_edges ?? 15,

  -- Sleep consolidation
  config.sleep_weak_decay = config.sleep_weak_decay ?? 0.9,
  config.sleep_strong_boost = config.sleep_strong_boost ?? 1.05,
  config.sleep_strength_threshold = config.sleep_strength_threshold ?? 0.3,

  -- Maturity: raise thresholds (was too easy to reach 0.95)
  config.levelup_maturity_threshold = 0.7;

-- ═══════════════════════════════════════════
-- 2. Add synaptic_elements field to trace_state
-- ═══════════════════════════════════════════

-- Update existing trace_state records
UPDATE trace_state SET synaptic_elements = synaptic_elements ?? 0.5 WHERE synaptic_elements IS NONE;

-- ═══════════════════════════════════════════
-- 3. fn::grow_synaptic_elements — calcium-based element growth
-- Each trace grows/shrinks elements based on how close its activity
-- is to target. High activity OR very low → fewer elements. Optimal → more.
-- Gaussian: dz = η × exp(-(activity - target)² / 2σ²)
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::grow_synaptic_elements() {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $eta = $cfg.growth_rate ?? 0.01;
  LET $mu = $cfg.growth_target_activity ?? 0.3;
  LET $sigma = $cfg.growth_sigma ?? 0.2;

  -- Activity proxy: weight × freshness (both 0..1)
  LET $traces = (SELECT id, trace, weight, freshness, synaptic_elements FROM trace_state
    WHERE archived = false LIMIT 30);

  FOR $t IN $traces {
    LET $activity = ($t.weight ?? 0.5) * ($t.freshness ?? 0.5);
    LET $diff = $activity - $mu;
    LET $growth = $eta * math::pow(math::E, 0.0 - $diff * $diff / (2.0 * $sigma * $sigma));
    UPDATE trace_state SET synaptic_elements = math::clamp(
      (synaptic_elements ?? 0.5) + $growth, 0.0, 3.0
    ) WHERE id = $t.id;
  };

  RETURN true;
};

-- ═══════════════════════════════════════════
-- 4. fn::edge_sprout — distance-weighted, element-based
-- Pick trace with excess elements (>1.0), find closest unconnected trace
-- with also excess elements, connect them.
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::edge_sprout() {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $init_w = $cfg.sprout_initial_weight ?? 0.15;

  -- Find a trace with excess synaptic elements
  LET $source_state = (SELECT trace, synaptic_elements FROM trace_state
    WHERE archived = false AND (synaptic_elements ?? 0) > 1.0
    LIMIT 1)[0];

  IF $source_state IS NONE { RETURN { sprouted: 0 }; };

  -- Find nearest unconnected trace (also with excess elements)
  -- Use random sampling from active traces (O(1))
  LET $candidates = (SELECT trace, synaptic_elements FROM trace_state
    WHERE archived = false AND trace != $source_state.trace
    AND (synaptic_elements ?? 0) > 0.5
    LIMIT 5);

  FOR $c IN $candidates {
    -- Check not already connected
    LET $exists = (SELECT count() AS c FROM activates
      WHERE in = $source_state.trace AND out = $c.trace GROUP ALL)[0].c ?? 0;

    IF $exists = 0 AND $source_state.trace IS NOT NONE AND $c.trace IS NOT NONE {
      -- Check vector distance (closer = more likely)
      LET $src_pos = (SELECT position FROM trace WHERE id = $source_state.trace LIMIT 1)[0].position;
      LET $dst_pos = (SELECT position FROM trace WHERE id = $c.trace LIMIT 1)[0].position;

      LET $sim = IF $src_pos IS NOT NONE AND $dst_pos IS NOT NONE
        AND array::len($src_pos) > 0 AND array::len($dst_pos) > 0
        THEN vector::similarity::cosine($src_pos, $dst_pos)
        ELSE 0.3 END;

      -- Higher similarity → higher probability of connection
      IF $sim > 0.2 OR rand::float() < 0.1 {
        RELATE ($source_state.trace)->activates->($c.trace) SET
          weight = $init_w * $sim,
          eligibility = 0,
          co_activation_count = 0;

        -- Consume synaptic elements from both
        UPDATE trace_state SET synaptic_elements = math::max([0.0, (synaptic_elements ?? 1) - 0.5])
          WHERE trace = $source_state.trace;
        UPDATE trace_state SET synaptic_elements = math::max([0.0, (synaptic_elements ?? 1) - 0.3])
          WHERE trace = $c.trace;

        RETURN { sprouted: 1, similarity: $sim };
      };
    };
  };

  RETURN { sprouted: 0 };
};

-- ═══════════════════════════════════════════
-- 5. fn::edge_death — inactivity + competitive pruning
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::edge_death() {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $max_prune = $cfg.prune_max_per_call ?? 3;
  LET $max_in = $cfg.max_incoming_edges ?? 15;
  LET $cycle = (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0;

  -- 1. Inactivity pruning: edges never reinforced
  LET $inactive = (SELECT id FROM activates
    WHERE weight < ($cfg.edge_death_threshold ?? 0.02)
    AND (co_activation_count ?? 0) < 2
    LIMIT $max_prune);

  FOR $e IN $inactive {
    UPDATE activates SET weight = 0, archived = true WHERE id = $e.id;
  };

  -- 2. Competitive pruning: limit incoming edges per trace
  -- Pick one random trace and prune excess
  LET $random_trace = (SELECT trace FROM trace_state WHERE archived = false LIMIT 1)[0];
  IF $random_trace IS NOT NONE AND $random_trace.trace IS NOT NONE {
    LET $incoming = (SELECT id, weight FROM activates
      WHERE out = $random_trace.trace AND (archived IS NONE OR archived = false));
    IF array::len($incoming) > $max_in {
      -- Sort by weight, prune weakest
      LET $sorted = $incoming; -- SurrealDB doesn't support ORDER BY in subquery easily
      -- Prune edges with weight below median of this trace's inputs
      LET $weights = $incoming.map(|$e| $e.weight ?? 0);
      LET $median_w = math::median($weights) ?? 0.1;
      LET $pruned = 0;
      FOR $e IN $incoming {
        IF ($e.weight ?? 0) < $median_w AND $pruned < 3 {
          UPDATE activates SET weight = 0, archived = true WHERE id = $e.id;
          LET $pruned = $pruned + 1;
        };
      };
    };
  };

  RETURN { pruned: array::len($inactive) };
};

-- ═══════════════════════════════════════════
-- 6. fn::sleep_consolidation — Tononi SHY + replay + homeostasis
-- Weak edges × decay, strong edges × boost
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::sleep_consolidation($decay_rate: float) {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $weak_decay = $cfg.sleep_weak_decay ?? 0.9;
  LET $strong_boost = $cfg.sleep_strong_boost ?? 1.05;
  LET $threshold = $cfg.sleep_strength_threshold ?? 0.3;

  -- Phase 1: Neural weight decay
  fn::nn_decay_all($decay_rate);

  -- Phase 2: Tononi SHY — scale down weak, scale up strong
  UPDATE activates SET weight = weight * $weak_decay
    WHERE weight < $threshold AND weight > 0.01 AND (archived IS NONE OR archived = false);
  UPDATE activates SET weight = math::min([1.0, weight * $strong_boost])
    WHERE weight >= $threshold AND (archived IS NONE OR archived = false);

  -- Phase 3: Memory replay
  fn::consolidation_replay();

  -- Phase 4: Synaptic homeostasis (normalize to target mean)
  fn::synaptic_homeostasis();

  -- Phase 5: Grow elements (sleep promotes structural growth)
  fn::grow_synaptic_elements();

  -- Phase 6: Prune dead edges
  fn::edge_death();

  RETURN true;
};

-- ═══════════════════════════════════════════
-- 7. fn::brain_tick — integrate structural plasticity
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::brain_tick($n: int) {
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  LET $cfg = $state.config ?? {};
  UPDATE _cfg_cache SET cfg = $cfg;

  LET $freq_crit = $cfg.freq_critical ?? 100;
  LET $freq_high = $cfg.freq_high ?? 100;
  LET $freq_trace = $cfg.freq_trace_decay ?? 50;
  LET $freq_agency = $cfg.freq_agency ?? 200;
  LET $freq_med = $cfg.freq_medium ?? 500;
  LET $freq_low = $cfg.freq_low ?? 2000;
  LET $freq_deep = $cfg.freq_deep ?? 5000;

  FOR $x IN 0..$n {
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

    IF $x % $freq_high = 0 {
      fn::hormone_decay_tick();
      fn::affect_forward_output();
      fn::apply_config_deltas();
      fn::affect_backward_targeted($cfg.affect_lr ?? 0.05);
      UPDATE nn_node SET value = value * ($cfg.accumulator_decay ?? 0.99) WHERE model = 'affect' AND layer = 'input';
    };

    IF $x % $freq_trace = 0 {
      UPDATE trace_state SET
        weight = weight * ($cfg.trace_weight_decay ?? 0.999),
        freshness = freshness * ($cfg.trace_freshness_decay ?? 0.999)
      WHERE archived = false AND weight > ($cfg.trace_decay_min_weight ?? 0.05);
    };

    IF $x % $freq_agency = 0 { fn::agency_tick($x); };

    IF $x % $freq_med = 0 {
      fn::active_inference($cfg.active_inference_threshold ?? 0.3, $cfg.active_inference_limit ?? 10);
      fn::forget_traces($cfg.forget_weight_threshold ?? 0.02, $cfg.forget_freshness_threshold ?? 0.03);
      fn::decay_eligibility();
    };

    -- LOW: structural plasticity + consolidation
    IF $x % $freq_low = 0 {
      fn::nn_decay_all($cfg.nn_decay_rate ?? 0.001);
      fn::consolidate_episodic($cfg.consolidation_min_count ?? 3);
      fn::consolidation_replay();
      -- Structural plasticity: grow elements + sprout + prune
      fn::grow_synaptic_elements();
      fn::edge_sprout();
      fn::edge_death();
      IF $x % ($freq_low * ($cfg.prune_freq_multiplier ?? 3)) = 0 {
        fn::prune_dissimilar_edges($cfg.prune_min_similarity ?? 0.15);
        fn::synaptic_homeostasis();
      };
    };

    IF $x % $freq_deep = 0 {
      fn::build_world_model();
      fn::introspect();
      CREATE config_snapshot SET config = $cfg, cycle = (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0;
    };
  };

  RETURN (SELECT * FROM kernel_state LIMIT 1)[0];
};

-- ═══════════════════════════════════════════
-- 8. fn::compute_maturity — harder thresholds
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::compute_maturity() {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};

  -- Component 1: Convergence (needs higher reactivation count)
  LET $active = (SELECT count() AS c FROM trace_state WHERE archived = false GROUP ALL)[0].c ?? 0;
  LET $react_vals = (SELECT reactivation_count FROM trace_state WHERE archived = false);
  LET $mean_react = IF $active > 1
    THEN math::mean($react_vals.map(|$r| $r.reactivation_count ?? 0)) ?? 0
    ELSE 0 END;
  -- Need mean reactivation > 200 for full score (was 100)
  LET $conv_score = math::clamp($mean_react / 200.0, 0.0, 1.0);

  -- Component 2: Edge density (need 1000+ edges for full score)
  LET $edge_count = (SELECT count() AS c FROM activates WHERE (archived IS NONE OR archived = false) GROUP ALL)[0].c ?? 0;
  LET $edge_score = math::clamp($edge_count / 1000.0, 0.0, 1.0);

  -- Component 3: Prediction quality from RPE
  LET $ce_count = (SELECT count() AS c FROM cognitive_event GROUP ALL)[0].c ?? 0;
  LET $recent_rpe = IF $ce_count > 1
    THEN (SELECT math::mean(math::abs(prediction_error)) AS m FROM cognitive_event GROUP ALL)[0].m ?? 0.5
    ELSE 0.5 END;
  LET $predict_score = math::clamp(1.0 - $recent_rpe * 2.0, 0.0, 1.0);

  -- Component 4: Mode diversity
  LET $mode_vals = (SELECT * FROM nn_node WHERE model = 'affect' AND layer = 'mode');
  LET $mode_probs = $mode_vals.map(|$m| $m.value ?? 0.25);
  LET $mode_max = math::max($mode_probs) ?? 0.25;
  LET $mode_min = math::min($mode_probs) ?? 0.25;
  LET $diversity_score = IF $mode_max > 0.01 THEN math::clamp($mode_min / $mode_max, 0.0, 1.0) ELSE 1.0 END;

  LET $maturity = $conv_score * ($cfg.maturity_convergence_weight ?? 0.3)
    + $edge_score * ($cfg.maturity_edge_weight ?? 0.2)
    + $predict_score * ($cfg.maturity_reactivation_weight ?? 0.3)
    + $diversity_score * ($cfg.maturity_mode_diversity_weight ?? 0.2);

  UPDATE kernel_state SET config.developmental_maturity = math::clamp($maturity, 0.0, 1.0);

  RETURN {
    maturity: $maturity,
    convergence: $conv_score,
    edges: $edge_score,
    prediction: $predict_score,
    diversity: $diversity_score
  };
};
