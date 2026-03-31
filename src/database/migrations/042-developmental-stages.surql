-- Migration 042: Developmental Stages — Born as a Newborn
-- Brain starts with high fatigue, frequent sleep, low endurance.
-- As it learns (convergence↑, pred_error↓), affect model self-modulates
-- energy parameters → brain grows more resilient.
-- No hardcoded stages: development emerges from learning dynamics.

-- ═══════════════════════════════════════════
-- 1. NEWBORN DEFAULTS: high drain, fast fatigue, low threshold
-- ═══════════════════════════════════════════

UPDATE kernel_state SET
  -- Newborn: drains 5× faster, fatigues 5× faster, sleeps at 30% energy
  config.energy_drain_rate = 0.01,
  config.fatigue_rate = 0.005,
  config.sleep_threshold = 0.3,
  config.sleep_energy_restore = 0.6,
  config.sleep_energy_cap = 1.2,

  -- Store newborn defaults for log-space modulation
  config.default_energy_drain_rate = config.default_energy_drain_rate ?? 0.01,
  config.default_fatigue_rate = config.default_fatigue_rate ?? 0.005,
  config.default_sleep_threshold = config.default_sleep_threshold ?? 0.3,

  -- Developmental maturity metric (0=newborn, 1=mature)
  -- Updated by introspect based on learning progress
  config.developmental_maturity = config.developmental_maturity ?? 0.0,

  -- Auto level-up thresholds
  config.levelup_maturity_threshold = config.levelup_maturity_threshold ?? 0.5,
  config.maturity_convergence_weight = config.maturity_convergence_weight ?? 0.3,
  config.maturity_edge_weight = config.maturity_edge_weight ?? 0.2,
  config.maturity_reactivation_weight = config.maturity_reactivation_weight ?? 0.3,
  config.maturity_mode_diversity_weight = config.maturity_mode_diversity_weight ?? 0.2;

-- ═══════════════════════════════════════════
-- 2. Add endurance output nodes to affect model
-- These let the brain modulate its OWN energy parameters
-- ═══════════════════════════════════════════

-- Create endurance output node (if not exists)
-- Create endurance + sleep_need output nodes (if not exist)
-- Use UPSERT pattern: check, create, wire
LET $endurance_exists = (SELECT count() AS c FROM nn_node WHERE node_id = 'config:endurance' GROUP ALL)[0].c ?? 0;
IF $endurance_exists = 0 {
  CREATE nn_node SET
    node_id = 'config:endurance', model = 'affect', layer = 'output',
    value = 0, bias = 0, activation = 'tanh';
};

LET $sleep_exists = (SELECT count() AS c FROM nn_node WHERE node_id = 'config:sleep_need' GROUP ALL)[0].c ?? 0;
IF $sleep_exists = 0 {
  CREATE nn_node SET
    node_id = 'config:sleep_need', model = 'affect', layer = 'output',
    value = 0, bias = 0, activation = 'tanh';
};

-- Wire edges from hormones to new output nodes (if not already wired)
LET $hormones = (SELECT id FROM nn_node WHERE model = 'affect' AND layer = 'hidden');
LET $endurance_id = (SELECT id FROM nn_node WHERE node_id = 'config:endurance' LIMIT 1)[0].id;
LET $sleep_id = (SELECT id FROM nn_node WHERE node_id = 'config:sleep_need' LIMIT 1)[0].id;

IF $endurance_id IS NOT NONE {
  FOR $h IN $hormones {
    LET $edge_exists = (SELECT count() AS c FROM nn_edge WHERE in = $h.id AND out = $endurance_id GROUP ALL)[0].c ?? 0;
    IF $edge_exists = 0 {
      RELATE ($h.id)->nn_edge->($endurance_id) SET weight = 0.1, grad_acc = 0, update_count = 0;
    };
  };
};

IF $sleep_id IS NOT NONE {
  FOR $h IN $hormones {
    LET $edge_exists2 = (SELECT count() AS c FROM nn_edge WHERE in = $h.id AND out = $sleep_id GROUP ALL)[0].c ?? 0;
    IF $edge_exists2 = 0 {
      RELATE ($h.id)->nn_edge->($sleep_id) SET weight = 0.1, grad_acc = 0, update_count = 0;
    };
  };
};

-- ═══════════════════════════════════════════
-- 3. fn::apply_config_deltas — add endurance + sleep modulation
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::apply_config_deltas() {
  LET $cfg = (SELECT * FROM kernel_state LIMIT 1)[0].config ?? {};
  LET $s = $cfg.log_sensitivity ?? 0.3;

  LET $outputs = (SELECT node_id, value FROM nn_node WHERE model = 'affect' AND layer = 'output');

  FOR $o IN $outputs {
    LET $name = string::replace($o.node_id, 'config:', '');
    LET $t = $o.value ?? 0;
    LET $multiplier = math::pow(math::E, $t * $s);

    IF $name = 'convergence_threshold' {
      UPDATE kernel_state SET config.accumulator_valence_threshold = ($cfg.default_accumulator_valence_threshold ?? 0.1) * $multiplier;
    };
    IF $name = 'spread_factor' {
      UPDATE kernel_state SET config.spread_weight_rate = ($cfg.default_spread_weight_rate ?? 0.05) * $multiplier;
    };
    IF $name = 'hebbian_lr' {
      UPDATE kernel_state SET config.hebbian_lr = ($cfg.default_hebbian_lr ?? 0.01) * $multiplier;
    };
    IF $name = 'energy_threshold' {
      UPDATE kernel_state SET config.agency_energy_threshold = ($cfg.default_agency_energy_threshold ?? 0.15) * $multiplier;
    };
    IF $name = 'activation_boost' {
      UPDATE kernel_state SET config.reactivation_weight_boost = ($cfg.default_reactivation_weight_boost ?? 0.1) * $multiplier;
    };
    IF $name = 'freshness_decay' {
      LET $d = $cfg.default_trace_freshness_decay ?? 0.999;
      UPDATE kernel_state SET config.trace_freshness_decay = $d + (1.0 - $d) * $t * $s;
    };
    -- ENDURANCE: modulates energy_drain_rate (INVERSE: higher endurance = LOWER drain)
    IF $name = 'endurance' {
      -- tanh > 0 → less drain (more endurance), tanh < 0 → more drain (less endurance)
      -- Inverse multiplier: drain = default / multiplier
      LET $inv = math::pow(math::E, 0.0 - $t * $s);
      UPDATE kernel_state SET
        config.energy_drain_rate = ($cfg.default_energy_drain_rate ?? 0.01) * $inv,
        config.fatigue_rate = ($cfg.default_fatigue_rate ?? 0.005) * $inv;
    };
    -- SLEEP_NEED: modulates sleep_threshold (higher = sleeps sooner)
    IF $name = 'sleep_need' {
      UPDATE kernel_state SET config.sleep_threshold = ($cfg.default_sleep_threshold ?? 0.3) * $multiplier;
    };
  };

  RETURN true;
};

-- ═══════════════════════════════════════════
-- 4. fn::compute_maturity — developmental maturity from learning metrics
-- 0 = newborn (no learning), 1 = mature (stable, efficient)
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::compute_maturity() {
  LET $cfg = (SELECT * FROM kernel_state LIMIT 1)[0].config ?? {};

  -- Component 1: Convergence ratio (how often do we see familiar vs new)
  LET $active_traces = (SELECT count() AS c FROM trace WHERE archived = false GROUP ALL)[0].c ?? 0;
  LET $mean_react = IF $active_traces > 0
    THEN (SELECT math::mean(reactivation_count) AS m FROM trace WHERE archived = false GROUP ALL)[0].m ?? 0
    ELSE 0 END;
  LET $conv_score = math::clamp($mean_react / 100.0, 0.0, 1.0);

  -- Component 2: Edge density (how connected is the graph)
  LET $edge_count = (SELECT count() AS c FROM activates GROUP ALL)[0].c ?? 0;
  LET $edge_score = math::clamp($edge_count / 500.0, 0.0, 1.0);

  -- Component 3: Reactivation consistency (low pred_error = predictable world)
  LET $pred_err = (SELECT * FROM nn_node WHERE node_id = 'acc:pred_error' LIMIT 1)[0].value ?? 1.0;
  LET $convergence = (SELECT * FROM nn_node WHERE node_id = 'acc:convergence' LIMIT 1)[0].value ?? 0;
  LET $predict_score = math::clamp($convergence / ($convergence + $pred_err + 0.01), 0.0, 1.0);

  -- Component 4: Mode diversity (not stuck in one mode)
  -- Use min/max ratio as diversity proxy (1 = uniform, 0 = single mode)
  LET $mode_vals = (SELECT * FROM nn_node WHERE model = 'affect' AND layer = 'mode');
  LET $mode_probs = $mode_vals.map(|$m| $m.value ?? 0.25);
  LET $mode_max = math::max($mode_probs) ?? 0.25;
  LET $mode_min = math::min($mode_probs) ?? 0.25;
  LET $diversity_score = IF $mode_max > 0.01 THEN math::clamp($mode_min / $mode_max, 0.0, 1.0) ELSE 1.0 END;

  -- Weighted maturity
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

-- ═══════════════════════════════════════════
-- 5. fn::introspect — now includes maturity computation
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::introspect() {
  -- Compute developmental maturity
  LET $maturity = fn::compute_maturity();

  -- Log introspection state
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  UPDATE kernel_state SET last_introspection = {
    cycle: $state.cycle,
    maturity: $maturity,
    energy: $state.energy,
    fatigue: $state.fatigue
  };

  RETURN $maturity;
};
