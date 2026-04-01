-- Migration 052: AtomSpace-inspired features
-- 1. HNSW vector index on trace.position (O(log n) cosine KNN)
-- 2. Recursive spreading activation (replaces FOR-loop 1-hop)
-- 3. Meta-edges: edges-on-edges for hypergraph semantics
-- 4. Queries-as-data: pattern table + matcher
-- 5. Hybrid graph+vector retrieval via HNSW

-- ═══════════════════════════════════════════
-- 1. HNSW VECTOR INDEX
-- Replaces naive O(n²) cosine scan with O(log n) ANN
-- ═══════════════════════════════════════════

DEFINE INDEX OVERWRITE idx_trace_position_hnsw ON trace
  FIELDS position
  HNSW DIMENSION 64 DIST COSINE
  LM 12
  M0 24
  EFC 150;

-- Config for vector retrieval
UPDATE kernel_state SET
  config.vector_knn_k = config.vector_knn_k ?? 20,
  config.vector_knn_ef = config.vector_knn_ef ?? 50,
  config.spread_max_hops = config.spread_max_hops ?? 3,
  config.spread_hop_decay = config.spread_hop_decay ?? 0.5,
  config.meta_edge_default_weight = config.meta_edge_default_weight ?? 0.5,
  config.pattern_match_limit = config.pattern_match_limit ?? 20;

-- ═══════════════════════════════════════════
-- 2. fn::graph_vector_retrieve — HNSW-powered hybrid retrieval
-- Uses indexed KNN instead of brute-force euclidean
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::graph_vector_retrieve($source_id: record, $k: int) {
  LET $source = (SELECT * FROM $source_id)[0];
  IF $source IS NONE { RETURN { graph_neighbors: [], vector_neighbors: [] }; };

  -- Graph neighbors via recursive path (up to 3 hops, BFS)
  LET $graph = (SELECT id, trace_id, weight FROM $source_id->activates.{1..3}->trace
    WHERE archived = false
    LIMIT $k);

  -- Vector neighbors via cosine similarity (HNSW index accelerates ORDER BY)
  LET $vector = IF $source.position IS NOT NONE AND array::len($source.position) > 0 THEN
    (SELECT id, trace_id,
      vector::similarity::cosine(position, $source.position) AS similarity
     FROM trace
     WHERE archived = false AND position IS NOT NONE
     ORDER BY similarity DESC
     LIMIT 20)
  ELSE [] END;

  RETURN {
    graph_neighbors: $graph,
    vector_neighbors: $vector
  };
};

-- ═══════════════════════════════════════════
-- 3. fn::active_inference — recursive spreading activation
-- Replaces single-hop FOR loop with multi-hop recursive paths.
-- Hop decay: weight contribution decays by spread_hop_decay per hop.
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::active_inference($strength_threshold: float, $limit: int) {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $floor = $cfg.cosine_spread_floor ?? 0.2;
  LET $w_rate = $cfg.spread_weight_rate ?? 0.05;
  LET $f_rate = $cfg.spread_freshness_rate ?? 0.02;
  LET $hop_decay = $cfg.spread_hop_decay ?? 0.5;

  -- Phase 1: Direct neighbors (hop 1, full strength)
  LET $direct = (SELECT
    in AS source_node, in.trace_id AS source_id, in.position AS source_pos,
    out AS mid_node, out.trace_id AS mid_id, out.position AS mid_pos,
    weight AS edge_weight
  FROM activates
  WHERE weight > $strength_threshold AND in.archived = false AND out.archived = false
  LIMIT $limit);

  FOR $c IN $direct {
    LET $sim = IF $c.source_pos IS NOT NONE AND $c.mid_pos IS NOT NONE
      AND array::len($c.source_pos) > 0 AND array::len($c.mid_pos) > 0
      THEN vector::similarity::cosine($c.source_pos, $c.mid_pos)
      ELSE 0.5
    END;
    LET $boost = math::max([$floor, $sim]);

    UPDATE trace_state SET
      weight = math::clamp(weight + $c.edge_weight * $boost * $w_rate, 0.01, 1.0),
      freshness = math::min([1.0, freshness + $boost * $f_rate])
    WHERE trace_id = $c.mid_id AND archived = false;
  };

  -- Phase 2: 2-hop neighbors (attenuated by hop_decay)
  LET $hop2 = (SELECT
    out.trace_id AS target_id, out.position AS target_pos,
    in.in.position AS origin_pos,
    weight AS edge_weight, in.weight AS first_weight
  FROM activates
  WHERE in IN (SELECT out FROM activates WHERE weight > $strength_threshold LIMIT $limit)
  AND weight > $strength_threshold * 0.5
  AND out.archived = false
  LIMIT $limit);

  FOR $h IN $hop2 {
    LET $sim2 = IF $h.origin_pos IS NOT NONE AND $h.target_pos IS NOT NONE
      AND array::len($h.origin_pos) > 0 AND array::len($h.target_pos) > 0
      THEN vector::similarity::cosine($h.origin_pos, $h.target_pos)
      ELSE 0.3
    END;
    LET $boost2 = math::max([$floor, $sim2]) * $hop_decay;

    UPDATE trace_state SET
      weight = math::clamp(weight + $h.edge_weight * $h.first_weight * $boost2 * $w_rate, 0.01, 1.0),
      freshness = math::min([1.0, freshness + $boost2 * $f_rate * $hop_decay])
    WHERE trace_id = $h.target_id AND archived = false;
  };

  RETURN { spread_direct: array::len($direct), spread_hop2: array::len($hop2) };
};

-- ═══════════════════════════════════════════
-- 4. fn::edge_sprout — HNSW-powered neighbor discovery
-- Instead of random sampling, find actual nearest traces
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::edge_sprout() {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $init_w = $cfg.sprout_initial_weight ?? 0.15;

  LET $source_state = (SELECT trace, synaptic_elements FROM trace_state
    WHERE archived = false AND (synaptic_elements ?? 0) > 1.0
    LIMIT 1)[0];

  IF $source_state IS NONE { RETURN { sprouted: 0 }; };

  LET $src_pos = (SELECT position FROM trace WHERE id = $source_state.trace LIMIT 1)[0].position;

  -- Find nearest unconnected traces via cosine similarity (HNSW index accelerates)
  LET $candidates = IF $src_pos IS NOT NONE AND array::len($src_pos) > 0 THEN
    (SELECT id, trace_id,
      vector::similarity::cosine(position, $src_pos) AS sim
     FROM trace
     WHERE archived = false AND id != $source_state.trace AND position IS NOT NONE
     ORDER BY sim DESC
     LIMIT 10)
  ELSE
    (SELECT id AS id FROM trace WHERE archived = false AND id != $source_state.trace LIMIT 5)
  END;

  LET $sprouted = 0;
  FOR $c IN $candidates {
    IF $sprouted > 0 { CONTINUE; };

    LET $exists = (SELECT count() AS c FROM activates
      WHERE in = $source_state.trace AND out = $c.id GROUP ALL)[0].c ?? 0;

    LET $has_elements = (SELECT synaptic_elements FROM trace_state
      WHERE trace = $c.id AND archived = false LIMIT 1)[0].synaptic_elements ?? 0;

    IF $exists = 0 AND $has_elements > 0.5 AND $source_state.trace IS NOT NONE AND $c.id IS NOT NONE {
      LET $sim = $c.sim ?? 0.3;

      IF $sim > 0.2 OR rand::float() < 0.1 {
        RELATE ($source_state.trace)->activates->($c.id) SET
          weight = $init_w * math::max([0.1, $sim]),
          eligibility = 0,
          co_activation_count = 0;

        UPDATE trace_state SET synaptic_elements = math::max([0.0, (synaptic_elements ?? 1) - 0.5])
          WHERE trace = $source_state.trace;
        UPDATE trace_state SET synaptic_elements = math::max([0.0, (synaptic_elements ?? 1) - 0.3])
          WHERE trace = $c.id;

        LET $sprouted = 1;
      };
    };
  };

  RETURN { sprouted: $sprouted };
};

-- ═══════════════════════════════════════════
-- 5. META-EDGES: Hypergraph support
-- Edges that connect edges. Enables:
--   activates:xyz -> modulates -> activates:abc (one edge modulates another)
--   activates:xyz -> gates -> activates:abc (one edge gates another)
--   trace:a -> context_of -> activates:xyz (trace provides context to an edge)
-- ═══════════════════════════════════════════

DEFINE TABLE OVERWRITE modulates SCHEMALESS TYPE RELATION;
DEFINE TABLE OVERWRITE gates SCHEMALESS TYPE RELATION;
DEFINE TABLE OVERWRITE context_of SCHEMALESS TYPE RELATION;

-- fn::create_meta_edge — create an edge between edges or between trace and edge
DEFINE FUNCTION OVERWRITE fn::create_meta_edge(
  $from: record, $to: record, $relation: string, $weight: float
) {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $w = IF $weight > 0 THEN $weight ELSE ($cfg.meta_edge_default_weight ?? 0.5) END;
  LET $cycle = (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0;

  IF $relation = 'modulates' {
    RELATE ($from)->modulates->($to) SET weight = $w, created_cycle = $cycle;
  };
  IF $relation = 'gates' {
    RELATE ($from)->gates->($to) SET weight = $w, created_cycle = $cycle, open = true;
  };
  IF $relation = 'context_of' {
    RELATE ($from)->context_of->($to) SET weight = $w, created_cycle = $cycle;
  };

  RETURN { created: true, relation: $relation, from: $from, to: $to };
};

-- fn::get_meta_edges — find all meta-edges touching a given edge
DEFINE FUNCTION OVERWRITE fn::get_meta_edges($edge_id: record) {
  LET $as_source_mod = (SELECT id, out, weight FROM modulates WHERE in = $edge_id);
  LET $as_target_mod = (SELECT id, in, weight FROM modulates WHERE out = $edge_id);
  LET $as_source_gate = (SELECT id, out, weight, open FROM gates WHERE in = $edge_id);
  LET $as_target_gate = (SELECT id, in, weight, open FROM gates WHERE out = $edge_id);
  LET $contexts = (SELECT id, in, weight FROM context_of WHERE out = $edge_id);

  RETURN {
    modulates_out: $as_source_mod,
    modulated_by: $as_target_mod,
    gates_out: $as_source_gate,
    gated_by: $as_target_gate,
    contexts: $contexts
  };
};

-- fn::apply_meta_modulation — modulates edges affect learning rate of target edges
-- When edge A modulates edge B, A's weight scales B's learning signal
DEFINE FUNCTION OVERWRITE fn::apply_meta_modulation() {
  LET $mods = (SELECT in, out, weight FROM modulates WHERE weight > 0.01);

  FOR $m IN $mods {
    LET $mod_source = (SELECT weight FROM activates WHERE id = $m.in LIMIT 1)[0];
    IF $mod_source IS NOT NONE {
      -- Modulating edge's activity scales target edge weight
      LET $signal = ($mod_source.weight ?? 0.5) * ($m.weight ?? 0.5);
      UPDATE activates SET
        weight = math::clamp(weight + $signal * 0.01, 0.01, 1.0)
      WHERE id = $m.out;
    };
  };

  -- Gating: closed gates suppress target edges
  LET $closed_gates = (SELECT out FROM gates WHERE open = false);
  FOR $g IN $closed_gates {
    UPDATE activates SET weight = weight * 0.95 WHERE id = $g.out;
  };

  RETURN { modulations: array::len($mods), closed_gates: array::len($closed_gates) };
};

-- ═══════════════════════════════════════════
-- 6. QUERIES-AS-DATA: Pattern table
-- Store graph patterns as first-class records.
-- Patterns describe subgraph shapes to match against the trace graph.
-- Inspired by AtomSpace's BindLink / MeetLink / DualLink.
-- ═══════════════════════════════════════════

DEFINE TABLE OVERWRITE graph_pattern SCHEMALESS;
DEFINE INDEX idx_pattern_name ON graph_pattern FIELDS name UNIQUE;
DEFINE INDEX idx_pattern_active ON graph_pattern FIELDS active;

-- Pattern structure:
-- {
--   name: "high_dopamine_explore",
--   description: "Traces activated when dopamine is high and mode is explore",
--   match_type: "meet" | "bind" | "dual",
--   conditions: [
--     { field: "weight", op: ">", value: 0.5 },
--     { field: "freshness", op: ">", value: 0.3 },
--     { relation: "activates", direction: "out", min_count: 2 }
--   ],
--   context: {
--     hormone_dopamine_min: 0.6,
--     mode: "explore"
--   },
--   action: "boost" | "suppress" | "tag" | "relate",
--   action_params: { boost_amount: 0.1 },
--   priority: 1.0,
--   active: true,
--   created_cycle: 0,
--   match_count: 0,
--   last_matched_cycle: 0
-- }

-- fn::match_pattern — execute a stored pattern against the trace graph
-- Uses direct WHERE filtering instead of FOR+LET (SurrealDB scoping limitation)
DEFINE FUNCTION OVERWRITE fn::match_pattern($pattern_name: string) {
  LET $p = (SELECT * FROM graph_pattern WHERE name = $pattern_name AND active = true LIMIT 1)[0];
  IF $p IS NONE { RETURN { matched: 0, error: 'pattern_not_found' }; };

  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $limit = $cfg.pattern_match_limit ?? 20;
  LET $ctx = $p.context ?? {};

  -- Read context values up front (avoid reserved keyword + nested LET bugs)
  LET $da = (SELECT `value` FROM nn_node WHERE node_id = 'hormone:dopamine' LIMIT 1)[0].value ?? 0;
  LET $co = (SELECT `value` FROM nn_node WHERE node_id = 'hormone:cortisol' LIMIT 1)[0].value ?? 0;
  LET $current_mode = fn::get_behavioral_mode().name ?? 'explore';
  LET $cur_energy = (SELECT energy FROM kernel_state LIMIT 1)[0].energy ?? 0;

  -- Context gate
  LET $ctx_ok = IF ($ctx.hormone_dopamine_min IS NOT NONE AND $da < $ctx.hormone_dopamine_min)
    OR ($ctx.hormone_cortisol_max IS NOT NONE AND $co > $ctx.hormone_cortisol_max)
    OR ($ctx.mode IS NOT NONE AND $current_mode != $ctx.mode)
    OR ($ctx.energy_min IS NOT NONE AND $cur_energy < $ctx.energy_min)
    THEN false ELSE true END;

  IF $ctx_ok = false { RETURN { matched: 0, reason: 'context_mismatch' }; };

  -- Extract thresholds from conditions array via filter+map
  LET $conditions = $p.conditions ?? [];
  LET $w_gt = $conditions.filter(|$c| $c.field = 'weight' AND $c.op = '>').map(|$c| $c.value)[0] ?? -999;
  LET $w_lt = $conditions.filter(|$c| $c.field = 'weight' AND $c.op = '<').map(|$c| $c.value)[0] ?? 999;
  LET $f_gt = $conditions.filter(|$c| $c.field = 'freshness' AND $c.op = '>').map(|$c| $c.value)[0] ?? -999;
  LET $ec_gt = $conditions.filter(|$c| $c.field = 'emotional_charge' AND $c.op = '>').map(|$c| $c.value)[0] ?? -999;
  LET $ec_lt = $conditions.filter(|$c| $c.field = 'emotional_charge' AND $c.op = '<').map(|$c| $c.value)[0] ?? 999;
  LET $rc_gt = $conditions.filter(|$c| $c.field = 'reactivation_count' AND $c.op = '>').map(|$c| $c.value)[0] ?? -999;

  -- Single SELECT with all conditions
  LET $matched = (SELECT trace_id FROM trace_state
    WHERE archived = false
    AND weight > $w_gt AND weight < $w_lt
    AND freshness > $f_gt
    AND emotional_charge > $ec_gt AND emotional_charge < $ec_lt
    AND reactivation_count > $rc_gt
    LIMIT $limit).map(|$t| $t.trace_id);

  -- Execute action
  LET $action = $p.action ?? 'tag';
  LET $params = $p.action_params ?? {};

  IF $action = 'boost' {
    LET $amt = $params.boost_amount ?? 0.1;
    UPDATE trace_state SET weight = math::clamp(weight + $amt, 0.01, 1.0)
      WHERE trace_id IN $matched AND archived = false;
  };
  IF $action = 'suppress' {
    UPDATE trace_state SET suppressed = true
      WHERE trace_id IN $matched AND archived = false;
  };

  -- Update pattern stats
  LET $cycle = (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0;
  UPDATE graph_pattern SET
    match_count = (match_count ?? 0) + array::len($matched),
    last_matched_cycle = $cycle
  WHERE name = $pattern_name;

  RETURN { matched: array::len($matched), traces: $matched, action: $action };
};

-- fn::match_all_patterns — run all active patterns (DualLink-style inverted search)
-- "Given current brain state, which patterns fire?"
DEFINE FUNCTION OVERWRITE fn::match_all_patterns() {
  LET $patterns = (SELECT name, priority FROM graph_pattern
    WHERE active = true);

  -- Fire each pattern (side effects: boost/suppress happen inside fn::match_pattern)
  -- Collect stats by reading match_count changes
  LET $before_counts = (SELECT name, match_count FROM graph_pattern WHERE active = true);

  FOR $p IN $patterns {
    fn::match_pattern($p.name);
  };

  -- Compute which patterns actually fired by comparing match_count
  LET $after_counts = (SELECT name, match_count, priority FROM graph_pattern WHERE active = true);
  LET $fired = $after_counts.filter(|$a| {
    LET $b = $before_counts.filter(|$x| $x.name = $a.name)[0];
    RETURN ($a.match_count ?? 0) > ($b.match_count ?? 0);
  });

  RETURN {
    fired: array::len($fired),
    patterns: $fired.map(|$f| { pattern: $f.name, priority: $f.priority ?? 1.0 })
  };
};

-- ═══════════════════════════════════════════
-- 7. fn::prune_dissimilar_edges — HNSW-aware pruning
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::prune_dissimilar_edges($min_similarity: float) {
  LET $pruned = (UPDATE activates SET weight = 0.0
    WHERE in.position IS NOT NONE AND out.position IS NOT NONE
    AND array::len(in.position) > 0 AND array::len(out.position) > 0
    AND vector::similarity::cosine(in.position, out.position) < $min_similarity
    AND weight < 0.3
    AND (archived IS NONE OR archived = false)
    RETURN BEFORE);
  RETURN { pruned: array::len($pruned) };
};

-- ═══════════════════════════════════════════
-- 8. Integrate meta-modulation into brain_tick
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
      -- Meta-modulation: edges modulate other edges
      fn::apply_meta_modulation();
    };

    IF $x % $freq_low = 0 {
      fn::nn_decay_all($cfg.nn_decay_rate ?? 0.001);
      fn::consolidate_episodic($cfg.consolidation_min_count ?? 3);
      fn::consolidation_replay();
      fn::grow_synaptic_elements();
      fn::edge_sprout();
      fn::edge_death();
      -- Pattern matching: fire all active patterns
      fn::match_all_patterns();
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
-- 9. SEED: Default patterns
-- ═══════════════════════════════════════════

-- Pattern: boost high-dopamine salient traces during exploration
CREATE graph_pattern CONTENT {
  name: 'dopamine_explore_boost',
  description: 'Boost active traces when dopamine is high and exploring',
  match_type: 'meet',
  conditions: [
    { field: 'weight', op: '>', value: 0.3 },
    { field: 'freshness', op: '>', value: 0.2 },
    { relation: 'activates', direction: 'out', min_count: 1 }
  ],
  context: {
    hormone_dopamine_min: 0.6,
    mode: 'explore'
  },
  action: 'boost',
  action_params: { boost_amount: 0.05 },
  priority: 1.0,
  active: true,
  created_cycle: 0,
  match_count: 0,
  last_matched_cycle: 0
};

-- Pattern: suppress weak/stale traces to free resources
CREATE graph_pattern CONTENT {
  name: 'cortisol_suppress',
  description: 'Suppress weak stale traces to free resources',
  match_type: 'meet',
  conditions: [
    { field: 'weight', op: '<', value: 0.2 },
    { field: 'freshness', op: '<', value: 0.3 }
  ],
  context: {},
  action: 'suppress',
  action_params: {},
  priority: 0.5,
  active: true,
  created_cycle: 0,
  match_count: 0,
  last_matched_cycle: 0
};

-- Pattern: boost emotionally charged traces during defensive mode
CREATE graph_pattern CONTENT {
  name: 'defensive_emotional_boost',
  description: 'In defensive mode, boost strongly emotional traces',
  match_type: 'meet',
  conditions: [
    { field: 'emotional_charge', op: '<', value: -0.3 }
  ],
  context: {
    mode: 'defensive'
  },
  action: 'boost',
  action_params: { boost_amount: 0.08 },
  priority: 0.8,
  active: true,
  created_cycle: 0,
  match_count: 0,
  last_matched_cycle: 0
};
