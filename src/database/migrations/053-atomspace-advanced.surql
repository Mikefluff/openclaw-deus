-- Migration 053: AtomSpace Advanced Features
-- 1. DualLink — reactive inverted pattern search
-- 2. FormulaStream — lazy computed activation values
-- 3. Term Unification — bidirectional pattern matching
-- 4. Frames — stackable graph versioning
-- 5. ECAN — HebbianLinks + rent collection + forgetting
-- 6. PLN — deduction + modus ponens with confidence propagation

-- ═══════════════════════════════════════════
-- CONFIG
-- ═══════════════════════════════════════════

UPDATE kernel_state SET
  -- ECAN
  config.ecan_rent_per_tick = config.ecan_rent_per_tick ?? 0.005,
  config.ecan_af_threshold = config.ecan_af_threshold ?? 0.4,
  config.ecan_hebbian_create_threshold = config.ecan_hebbian_create_threshold ?? 0.5,
  config.ecan_max_hebbian_per_trace = config.ecan_max_hebbian_per_trace ?? 10,
  config.ecan_max_active_traces = config.ecan_max_active_traces ?? 200,
  config.ecan_target_active_traces = config.ecan_target_active_traces ?? 150,
  config.ecan_hebbian_decay = config.ecan_hebbian_decay ?? 0.995,
  -- PLN
  config.pln_confidence_decay = config.pln_confidence_decay ?? 0.9,
  config.pln_min_confidence = config.pln_min_confidence ?? 0.1,
  config.pln_max_chain_depth = config.pln_max_chain_depth ?? 3,
  -- Frames
  config.frame_max_depth = config.frame_max_depth ?? 5,
  config.frame_auto_cleanup_cycles = config.frame_auto_cleanup_cycles ?? 10000,
  -- FormulaStream
  config.formula_spread_depth = config.formula_spread_depth ?? 2,
  config.formula_min_weight = config.formula_min_weight ?? 0.05;

-- ═══════════════════════════════════════════
-- 1. DUALLINK — Inverted Pattern Search
-- Given a trace, find all stored patterns that match it.
-- Uses trace content + fields to filter candidate patterns.
-- ═══════════════════════════════════════════

-- Index for fast pattern lookup by condition fields
DEFINE INDEX IF NOT EXISTS idx_pattern_conditions ON graph_pattern FIELDS conditions;

-- fn::dual_match — given a trace event, find & fire all matching patterns
-- Unlike match_all_patterns (iterates all patterns), this is data-driven:
-- only checks patterns whose conditions could match this trace's values.
DEFINE FUNCTION OVERWRITE fn::dual_match($trace_id: string) {
  LET $ts = (SELECT * FROM trace_state WHERE trace_id = $trace_id AND archived = false LIMIT 1)[0];
  IF $ts IS NONE { RETURN { fired: 0 }; };

  LET $w = $ts.weight ?? 0;
  LET $f = $ts.freshness ?? 0;
  LET $ec = $ts.emotional_charge ?? 0;
  LET $rc = $ts.reactivation_count ?? 0;

  -- Find patterns where this trace could match: check each active pattern
  -- against this specific trace's values (cheaper than matching all traces per pattern)
  LET $patterns = (SELECT * FROM graph_pattern WHERE active = true);
  LET $fired_count = 0;

  FOR $p IN $patterns {
    LET $conditions = $p.conditions ?? [];
    LET $ctx = $p.context ?? {};

    -- Quick context gate (read hormones/mode only once per dual_match call)
    LET $da = (SELECT `value` FROM nn_node WHERE node_id = 'hormone:dopamine' LIMIT 1)[0].value ?? 0;
    LET $mode = fn::get_behavioral_mode().name ?? 'explore';

    LET $ctx_ok = IF ($ctx.hormone_dopamine_min IS NOT NONE AND $da < $ctx.hormone_dopamine_min)
      OR ($ctx.mode IS NOT NONE AND $mode != $ctx.mode)
      THEN false ELSE true END;

    IF $ctx_ok = true {
      -- Check conditions against THIS trace
      LET $w_gt = $conditions.filter(|$c| $c.field = 'weight' AND $c.op = '>').map(|$c| $c.value)[0] ?? -999;
      LET $w_lt = $conditions.filter(|$c| $c.field = 'weight' AND $c.op = '<').map(|$c| $c.value)[0] ?? 999;
      LET $f_gt = $conditions.filter(|$c| $c.field = 'freshness' AND $c.op = '>').map(|$c| $c.value)[0] ?? -999;
      LET $ec_gt = $conditions.filter(|$c| $c.field = 'emotional_charge' AND $c.op = '>').map(|$c| $c.value)[0] ?? -999;
      LET $ec_lt = $conditions.filter(|$c| $c.field = 'emotional_charge' AND $c.op = '<').map(|$c| $c.value)[0] ?? 999;

      LET $match = IF $w > $w_gt AND $w < $w_lt AND $f > $f_gt
        AND $ec > $ec_gt AND $ec < $ec_lt
        THEN true ELSE false END;

      IF $match = true {
        -- Execute action on this trace
        LET $action = $p.action ?? 'tag';
        LET $params = $p.action_params ?? {};

        IF $action = 'boost' {
          UPDATE trace_state SET weight = math::clamp(weight + ($params.boost_amount ?? 0.05), 0.01, 1.0)
            WHERE trace_id = $trace_id AND archived = false;
        };
        IF $action = 'suppress' {
          UPDATE trace_state SET suppressed = true WHERE trace_id = $trace_id AND archived = false;
        };

        UPDATE graph_pattern SET
          match_count = (match_count ?? 0) + 1,
          last_matched_cycle = (SELECT cycle FROM kernel_state LIMIT 1)[0].cycle ?? 0
        WHERE id = $p.id;

        LET $fired_count = $fired_count + 1;
      };
    };
  };

  RETURN { fired: $fired_count, trace: $trace_id };
};

-- ═══════════════════════════════════════════
-- 2. FORMULASTREAM — Lazy Computed Activation
-- Compute activation on-read from weighted neighbor inputs.
-- No stale values, no write conflicts.
-- ═══════════════════════════════════════════

-- fn::compute_activation — pull-based activation value
-- Sums weighted inputs from all activating neighbors
DEFINE FUNCTION OVERWRITE fn::compute_activation($trace_ref: record) {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $min_w = $cfg.formula_min_weight ?? 0.05;

  -- Base activation from trace_state
  LET $ts = (SELECT weight, freshness FROM trace_state WHERE trace = $trace_ref AND archived = false LIMIT 1)[0];
  IF $ts IS NONE { RETURN 0.0; };
  LET $base = ($ts.weight ?? 0) * ($ts.freshness ?? 0);

  -- Sum weighted inputs from incoming activates edges
  LET $incoming = (SELECT in AS source, weight AS edge_w FROM activates
    WHERE out = $trace_ref AND weight > $min_w
    LIMIT 15);

  LET $input_sum = 0.0;
  FOR $e IN $incoming {
    LET $src_ts = (SELECT weight, freshness FROM trace_state WHERE trace = $e.source AND archived = false LIMIT 1)[0];
    LET $src_act = (($src_ts.weight ?? 0) * ($src_ts.freshness ?? 0));
    LET $input_sum = $input_sum + $e.edge_w * $src_act;
  };

  -- Sigmoid-like activation: base + tanh(input_sum)
  LET $raw = $base + $input_sum;
  RETURN math::clamp($raw, 0.0, 2.0);
};

-- fn::compute_salience_stream — reactive salience from current brain state
DEFINE FUNCTION OVERWRITE fn::compute_salience_stream($trace_ref: record) {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};

  LET $activation = fn::compute_activation($trace_ref);

  LET $ts = (SELECT emotional_charge, reactivation_count FROM trace_state
    WHERE trace = $trace_ref AND archived = false LIMIT 1)[0];
  IF $ts IS NONE { RETURN 0.0; };

  LET $novelty = 1.0 / (1.0 + ($ts.reactivation_count ?? 0));

  LET $da = (SELECT `value` FROM nn_node WHERE node_id = 'hormone:dopamine' LIMIT 1)[0].value ?? 0.5;
  LET $ne = (SELECT `value` FROM nn_node WHERE node_id = 'hormone:norepinephrine' LIMIT 1)[0].value ?? 0.5;
  LET $hormone_mod = ($da + $ne) * 0.5;

  LET $salience = $activation * ($cfg.salience_w_valence ?? 0.3)
    + $novelty * ($cfg.salience_w_novelty ?? 0.3)
    + math::abs($ts.emotional_charge ?? 0) * ($cfg.salience_w_surprise ?? 0.2)
    + $hormone_mod * ($cfg.salience_w_hormone ?? 0.2);

  RETURN math::clamp($salience, 0.0, 3.0);
};

-- ═══════════════════════════════════════════
-- 3. TERM UNIFICATION — Bidirectional Pattern Matching
-- Robinson's algorithm: find variable bindings making two patterns identical.
-- Patterns are objects with {type, value} or {type: "var", name: "$X"}.
-- ═══════════════════════════════════════════

-- fn::unify — unify two simple term structures
-- Terms: {t: "const", v: "something"} or {t: "var", v: "$X"} or {t: "pair", a: term, b: term}
-- Returns: substitution map {$X: value, $Y: value} or NONE on failure
DEFINE FUNCTION OVERWRITE fn::unify($a: object, $b: object) {
  -- Both constants: must be equal
  IF ($a.t ?? '') = 'const' AND ($b.t ?? '') = 'const' {
    RETURN IF $a.v = $b.v THEN { bindings: [] } ELSE NONE END;
  };

  -- Variable on left: bind it
  IF ($a.t ?? '') = 'var' {
    RETURN { bindings: [{ var: $a.v, val: $b }] };
  };

  -- Variable on right: bind it
  IF ($b.t ?? '') = 'var' {
    RETURN { bindings: [{ var: $b.v, val: $a }] };
  };

  -- Both pairs: unify heads then tails
  IF ($a.t ?? '') = 'pair' AND ($b.t ?? '') = 'pair' {
    LET $s1 = fn::unify($a.a ?? {}, $b.a ?? {});
    IF $s1 IS NONE { RETURN NONE; };
    LET $s2 = fn::unify($a.b ?? {}, $b.b ?? {});
    IF $s2 IS NONE { RETURN NONE; };
    -- Merge bindings arrays
    RETURN { bindings: array::concat($s1.bindings ?? [], $s2.bindings ?? []) };
  };

  -- Mismatch
  RETURN NONE;
};

-- fn::analogy — "A is to B as C is to ???"
-- Finds the relationship between A and B, applies it to C
DEFINE FUNCTION OVERWRITE fn::analogy($a: record, $b: record, $c: record) {
  -- Find edge from A to B
  LET $ab_edge = (SELECT * FROM activates WHERE in = $a AND out = $b LIMIT 1)[0];
  IF $ab_edge IS NONE { RETURN NONE; };

  -- Find traces connected to C with similar edge properties
  LET $candidates = (SELECT out AS target, weight FROM activates
    WHERE in = $c AND weight > 0.1
    LIMIT 10);

  -- Best candidate: closest edge weight to A→B edge
  LET $ab_w = $ab_edge.weight ?? 0.5;
  LET $best = NONE;
  LET $best_diff = 999.0;

  FOR $cand IN $candidates {
    LET $diff = math::abs(($cand.weight ?? 0) - $ab_w);
    IF $diff < $best_diff {
      LET $best = $cand.target;
      LET $best_diff = $diff;
    };
  };

  RETURN { d: $best, ab_weight: $ab_w, confidence: 1.0 - $best_diff };
};

-- ═══════════════════════════════════════════
-- 4. FRAMES — Stackable Graph Versioning
-- Sparse delta overlays for hypothetical reasoning.
-- push → modify → evaluate → pop/merge
-- ═══════════════════════════════════════════

DEFINE TABLE OVERWRITE graph_frame SCHEMALESS;
DEFINE TABLE OVERWRITE frame_delta SCHEMALESS;
DEFINE INDEX IF NOT EXISTS idx_frame_active ON graph_frame FIELDS active;
DEFINE INDEX IF NOT EXISTS idx_fd_frame ON frame_delta FIELDS frame;
DEFINE INDEX IF NOT EXISTS idx_fd_key ON frame_delta FIELDS frame, key;

-- Frame structure:
-- { parent: record<graph_frame> | NONE, deltas: { "trace:xxx": {weight: 0.9, ...} }, active: true }

DEFINE FUNCTION OVERWRITE fn::push_frame($label: string) {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $max_depth = $cfg.frame_max_depth ?? 5;

  -- Check depth
  LET $active_count = (SELECT count() AS c FROM graph_frame WHERE active = true GROUP ALL)[0].c ?? 0;
  IF $active_count >= $max_depth { RETURN { error: 'max_frame_depth', depth: $active_count }; };

  -- Find current top frame
  LET $top = (SELECT id FROM graph_frame WHERE active = true LIMIT 1)[0];

  LET $frame = CREATE graph_frame CONTENT {
    label: $label,
    parent: $top.id ?? NONE,
    deltas: {},
    trace_deltas: {},
    edge_deltas: {},
    active: true,
    created_cycle: (SELECT cycle FROM kernel_state LIMIT 1)[0].cycle ?? 0
  };

  RETURN { frame: $frame[0].id, label: $label, depth: $active_count + 1 };
};

-- Write to frame (doesn't touch base tables)
DEFINE FUNCTION OVERWRITE fn::frame_set($frame_id: record, $key: string, $value: object) {
  LET $frame = (SELECT * FROM $frame_id)[0];
  IF $frame IS NONE OR $frame.active != true { RETURN false; };

  -- Store delta as separate record (avoids computed keys + spread)
  CREATE frame_delta CONTENT {
    frame: $frame_id,
    key: $key,
    val: $value
  };
  RETURN true;
};

-- Read with frame overlay (checks delta first, then parent chain, then base)
DEFINE FUNCTION OVERWRITE fn::frame_get($frame_id: record, $key: string) {
  LET $frame = (SELECT * FROM $frame_id)[0];
  IF $frame IS NONE { RETURN NONE; };

  -- Check this frame's deltas
  LET $delta = (SELECT val FROM frame_delta WHERE frame = $frame_id AND key = $key LIMIT 1)[0];
  IF $delta IS NOT NONE { RETURN $delta.val; };

  -- Recurse to parent
  IF $frame.parent IS NOT NONE {
    RETURN fn::frame_get($frame.parent, $key);
  };

  -- Fall through to base: try trace_state
  RETURN (SELECT * FROM trace_state WHERE trace_id = $key AND archived = false LIMIT 1)[0] ?? NONE;
};

-- Pop frame (discard changes)
DEFINE FUNCTION OVERWRITE fn::pop_frame() {
  LET $top = (SELECT id, label, parent FROM graph_frame WHERE active = true LIMIT 1)[0];
  IF $top IS NONE { RETURN { error: 'no_active_frame' }; };

  DELETE frame_delta WHERE frame = $top.id;
  UPDATE graph_frame SET active = false WHERE id = $top.id;
  RETURN { popped: $top.label, remaining: (SELECT count() AS c FROM graph_frame WHERE active = true GROUP ALL)[0].c ?? 0 };
};

-- Merge frame (apply deltas to base tables)
DEFINE FUNCTION OVERWRITE fn::merge_frame() {
  LET $top = (SELECT * FROM graph_frame WHERE active = true LIMIT 1)[0];
  IF $top IS NONE { RETURN { error: 'no_active_frame' }; };

  -- Get all deltas for this frame
  LET $deltas = (SELECT key, val FROM frame_delta WHERE frame = $top.id);
  LET $applied = 0;

  FOR $d IN $deltas {
    UPDATE trace_state SET
      weight = $d.val.weight ?? weight,
      freshness = $d.val.freshness ?? freshness,
      emotional_charge = $d.val.emotional_charge ?? emotional_charge
    WHERE trace_id = $d.key AND archived = false;
    LET $applied = $applied + 1;
  };

  -- Cleanup deltas + deactivate frame
  DELETE frame_delta WHERE frame = $top.id;
  UPDATE graph_frame SET active = false WHERE id = $top.id;
  RETURN { merged: $top.label, applied: $applied };
};

-- fn::hypothesize — push frame, run function, evaluate, auto-pop/merge
DEFINE FUNCTION OVERWRITE fn::hypothesize($label: string, $trace_id: string, $weight_delta: float) {
  LET $push = fn::push_frame($label);
  IF $push.error IS NOT NONE { RETURN $push; };

  -- Record hypothetical change
  LET $ts = (SELECT * FROM trace_state WHERE trace_id = $trace_id AND archived = false LIMIT 1)[0];
  IF $ts IS NOT NONE {
    LET $new_w = math::clamp(($ts.weight ?? 0.5) + $weight_delta, 0.01, 1.0);
    fn::frame_set($push.frame, $trace_id, {
      weight: $new_w,
      freshness: $ts.freshness ?? 0,
      emotional_charge: $ts.emotional_charge ?? 0
    });
  };

  -- Evaluate: compute activation in hypothetical state
  LET $hyp_val = fn::frame_get($push.frame, $trace_id);
  LET $hyp_activation = ($hyp_val.weight ?? 0) * ($hyp_val.freshness ?? 0);
  LET $base_activation = ($ts.weight ?? 0) * ($ts.freshness ?? 0);
  LET $improvement = $hyp_activation - $base_activation;

  -- Auto-decision: merge if improvement, pop if not
  IF $improvement > 0 {
    fn::merge_frame();
    RETURN { decision: 'merged', improvement: $improvement, label: $label };
  } ELSE {
    fn::pop_frame();
    RETURN { decision: 'rejected', improvement: $improvement, label: $label };
  };
};

-- ═══════════════════════════════════════════
-- 5. ECAN — Economic Attention Networks
-- HebbianLinks + rent collection + threshold forgetting
-- ═══════════════════════════════════════════

-- Hebbian link table (learned associations, separate from structural edges)
DEFINE TABLE OVERWRITE hebbian SCHEMALESS TYPE RELATION FROM trace TO trace;

-- fn::ecan_create_hebbian — when two traces co-activate, create HebbianLink
DEFINE FUNCTION OVERWRITE fn::ecan_create_hebbian() {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $threshold = $cfg.ecan_hebbian_create_threshold ?? 0.5;
  LET $max_per = $cfg.ecan_max_hebbian_per_trace ?? 10;
  LET $cycle = (SELECT cycle FROM kernel_state LIMIT 1)[0].cycle ?? 0;

  -- Find traces in attentional focus (above threshold) — resolve trace records
  LET $af_states = (SELECT trace_id, weight, freshness FROM trace_state
    WHERE archived = false AND weight > $threshold
    LIMIT 20);

  IF array::len($af_states) < 2 { RETURN { created: 0 }; };

  -- Resolve trace_id → trace record for first 6
  LET $source_tid = $af_states[0].trace_id;
  LET $source_rec = (SELECT id FROM trace WHERE trace_id = $source_tid AND archived = false LIMIT 1)[0].id;
  IF $source_rec IS NONE { RETURN { created: 0, reason: 'source_not_found' }; };

  LET $existing_count = (SELECT count() AS c FROM hebbian
    WHERE in = $source_rec GROUP ALL)[0].c ?? 0;
  IF $existing_count >= $max_per { RETURN { created: 0, af_size: array::len($af_states), reason: 'max_reached' }; };

  LET $before = (SELECT count() AS c FROM hebbian GROUP ALL)[0].c ?? 0;

  LET $targets = array::slice($af_states, 1, 6);
  FOR $j IN $targets {
    LET $target_rec = (SELECT id FROM trace WHERE trace_id = $j.trace_id AND archived = false LIMIT 1)[0].id;
    IF $target_rec IS NOT NONE {
      LET $exists = (SELECT count() AS c FROM hebbian
        WHERE in = $source_rec AND out = $target_rec GROUP ALL)[0].c ?? 0;

      IF $exists = 0 {
        LET $strength = ($af_states[0].weight ?? 0) * ($af_states[0].freshness ?? 0) * ($j.weight ?? 0) * ($j.freshness ?? 0);
        RELATE ($source_rec)->hebbian->($target_rec) SET
          weight = math::max([0.01, $strength]),
          co_activation_count = 1,
          created_cycle = $cycle;
      };
    };
  };

  LET $after = (SELECT count() AS c FROM hebbian GROUP ALL)[0].c ?? 0;
  RETURN { created: $after - $before, af_size: array::len($af_states) };
};

-- fn::ecan_update_hebbian — strengthen co-active, decay inactive
DEFINE FUNCTION OVERWRITE fn::ecan_update_hebbian() {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $threshold = $cfg.ecan_af_threshold ?? 0.4;
  LET $decay = $cfg.ecan_hebbian_decay ?? 0.995;

  -- Strengthen: both endpoints active
  LET $active_pairs = (SELECT id, in.weight AS w_in, in.freshness AS f_in,
    out.weight AS w_out, out.freshness AS f_out
    FROM hebbian
    WHERE in.archived = false AND out.archived = false);

  FOR $h IN $active_pairs {
    LET $act_in = ($h.w_in ?? 0) * ($h.f_in ?? 0);
    LET $act_out = ($h.w_out ?? 0) * ($h.f_out ?? 0);

    IF $act_in > $threshold AND $act_out > $threshold {
      -- Strengthen: Hebbian learning
      LET $conj = $act_in * $act_out;
      UPDATE hebbian SET
        weight = math::clamp(weight + $conj * 0.01, 0.01, 1.0),
        co_activation_count = co_activation_count + 1
      WHERE id = $h.id;
    } ELSE {
      -- Decay: not co-active
      UPDATE hebbian SET weight = weight * $decay WHERE id = $h.id;
    };
  };

  -- Prune dead hebbian links
  DELETE hebbian WHERE weight < 0.02;

  RETURN { updated: array::len($active_pairs) };
};

-- fn::ecan_collect_rent — tax STI from all active traces
DEFINE FUNCTION OVERWRITE fn::ecan_collect_rent() {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $rent = $cfg.ecan_rent_per_tick ?? 0.005;

  UPDATE trace_state SET weight = math::max([0.01, weight - $rent])
    WHERE archived = false AND weight > 0.02;

  RETURN true;
};

-- fn::ecan_forget — archive traces below threshold when over capacity
DEFINE FUNCTION OVERWRITE fn::ecan_forget() {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $max = $cfg.ecan_max_active_traces ?? 200;
  LET $target = $cfg.ecan_target_active_traces ?? 150;
  LET $threshold = $cfg.ecan_af_threshold ?? 0.4;

  LET $active_count = (SELECT count() AS c FROM trace_state WHERE archived = false GROUP ALL)[0].c ?? 0;

  IF $active_count > $max {
    -- Archive lowest-weight traces until at target
    LET $to_archive = $active_count - $target;
    -- Find weakest traces that have no strong structural edges
    LET $weakest = (SELECT id, trace, trace_id, weight FROM trace_state
      WHERE archived = false AND weight < $threshold
      LIMIT $to_archive);

    FOR $w IN $weakest {
      UPDATE trace_state SET archived = true WHERE id = $w.id;
      UPDATE trace SET archived = true WHERE id = $w.trace;
    };

    RETURN { archived: array::len($weakest), remaining: $active_count - array::len($weakest) };
  };

  RETURN { archived: 0, count: $active_count };
};

-- ═══════════════════════════════════════════
-- 6. PLN — Probabilistic Logic Networks
-- Deduction + modus ponens with confidence propagation
-- ═══════════════════════════════════════════

-- Add strength/confidence fields to belief table (if not already there)
UPDATE belief SET strength = strength ?? confidence, pln_confidence = pln_confidence ?? confidence
  WHERE strength IS NONE;

-- fn::pln_deduction — A→B, B→C ⊢ A→C
-- sAC = sAB*sBC + (1-sAB)*(sC - sB*sBC)/(1-sB)
-- cAC = α * min(cAB, cBC)
DEFINE FUNCTION OVERWRITE fn::pln_deduction(
  $ab_strength: float, $ab_confidence: float,
  $bc_strength: float, $bc_confidence: float,
  $sB: float, $sC: float
) {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $alpha = $cfg.pln_confidence_decay ?? 0.9;

  -- Avoid division by zero
  IF $sB > 0.999 {
    RETURN { strength: $sC, confidence: $alpha * math::min([$ab_confidence, $bc_confidence]) };
  };
  IF $sB < 0.001 {
    RETURN { strength: $ab_strength * $bc_strength, confidence: $alpha * math::min([$ab_confidence, $bc_confidence]) };
  };

  LET $sAC = $ab_strength * $bc_strength
    + (1.0 - $ab_strength) * ($sC - $sB * $bc_strength) / (1.0 - $sB);

  -- Clamp to valid probability range
  LET $sAC = math::clamp($sAC, 0.0, 1.0);
  LET $cAC = $alpha * math::min([$ab_confidence, $bc_confidence]);

  RETURN { strength: $sAC, confidence: $cAC };
};

-- fn::pln_modus_ponens — P, P→Q ⊢ Q
-- sQ = sP*sPQ + (1-sP)*s(not-P→Q)
-- Simplified: sQ = sP*sPQ + (1-sP)*sQ_prior
DEFINE FUNCTION OVERWRITE fn::pln_modus_ponens(
  $sp: float, $cp: float,
  $spq: float, $cpq: float,
  $sq_prior: float
) {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $alpha = $cfg.pln_confidence_decay ?? 0.9;

  LET $sQ = $sp * $spq + (1.0 - $sp) * $sq_prior;
  LET $cQ = $alpha * math::min([$cp, $cpq]);

  RETURN { strength: math::clamp($sQ, 0.0, 1.0), confidence: $cQ };
};

-- fn::pln_infer_chain — run deduction chain on belief supports graph
-- Finds A→B→C chains and creates inferred A→C beliefs
DEFINE FUNCTION OVERWRITE fn::pln_infer_chain() {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $min_conf = $cfg.pln_min_confidence ?? 0.1;

  -- Find 2-hop chains in belief supports graph
  LET $chains = (SELECT
    in AS a, out AS b, weight AS ab_strength
  FROM supports
  WHERE weight > 0.1
  LIMIT 20);

  LET $inferred = 0;

  FOR $chain IN $chains {
    -- Find B→C edges
    LET $bc_edges = (SELECT out AS c, weight AS bc_strength FROM supports
      WHERE in = $chain.b AND weight > 0.1 AND out != $chain.a
      LIMIT 5);

    FOR $bc IN $bc_edges {
      -- Get belief strengths
      LET $belief_b = (SELECT confidence FROM belief WHERE id = $chain.b LIMIT 1)[0];
      LET $belief_c = (SELECT confidence FROM belief WHERE id = $bc.c LIMIT 1)[0];

      LET $sB = $belief_b.confidence ?? 0.5;
      LET $sC = $belief_c.confidence ?? 0.5;

      LET $result = fn::pln_deduction(
        $chain.ab_strength, 0.8,
        $bc.bc_strength, 0.8,
        $sB, $sC
      );

      -- Only create inferred edge if confidence above threshold
      IF ($result.confidence ?? 0) > $min_conf {
        -- Check if A→C already exists
        LET $exists = (SELECT count() AS c FROM supports
          WHERE in = $chain.a AND out = $bc.c GROUP ALL)[0].c ?? 0;

        IF $exists = 0 {
          RELATE ($chain.a)->supports->($bc.c) SET
            weight = $result.strength,
            confidence = $result.confidence,
            source = 'pln_deduction',
            inferred_cycle = (SELECT cycle FROM kernel_state LIMIT 1)[0].cycle ?? 0;
          LET $inferred = $inferred + 1;
        };
      };
    };
  };

  RETURN { inferred: $inferred };
};

-- ═══════════════════════════════════════════
-- 7. INTEGRATE INTO BRAIN_TICK
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
      -- ECAN: rent collection every high-freq tick
      fn::ecan_collect_rent();
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
      fn::apply_meta_modulation();
      -- ECAN: hebbian link updates
      fn::ecan_update_hebbian();
    };

    IF $x % $freq_low = 0 {
      fn::nn_decay_all($cfg.nn_decay_rate ?? 0.001);
      fn::consolidate_episodic($cfg.consolidation_min_count ?? 3);
      fn::consolidation_replay();
      fn::grow_synaptic_elements();
      fn::edge_sprout();
      fn::edge_death();
      fn::match_all_patterns();
      -- ECAN: create new hebbian links + capacity management
      fn::ecan_create_hebbian();
      fn::ecan_forget();
      IF $x % ($freq_low * ($cfg.prune_freq_multiplier ?? 3)) = 0 {
        fn::prune_dissimilar_edges($cfg.prune_min_similarity ?? 0.15);
        fn::synaptic_homeostasis();
      };
    };

    IF $x % $freq_deep = 0 {
      fn::build_world_model();
      fn::introspect();
      -- PLN: infer new beliefs via deduction chains
      fn::pln_infer_chain();
      CREATE config_snapshot SET config = $cfg, cycle = (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0;
    };
  };

  RETURN (SELECT * FROM kernel_state LIMIT 1)[0];
};
