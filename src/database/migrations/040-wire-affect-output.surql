-- Migration 040: Wire Affect Output Layer — Close the Loop
-- CRITICAL FIX: output layer (config deltas + mode) was computed but NEVER applied.
-- Now: hormones → config deltas → kernel_state.config (self-modulation)
--       hormones → mode softmax → behavioral mode selection

-- ═══════════════════════════════════════════
-- 1. CONFIG: output layer parameters
-- ═══════════════════════════════════════════

UPDATE kernel_state SET
  config.config_delta_scale = config.config_delta_scale ?? 0.1,
  config.config_delta_clamp = config.config_delta_clamp ?? 0.5,
  config.mode_temperature = config.mode_temperature ?? 1.0;

-- ═══════════════════════════════════════════
-- 2. fn::affect_forward_output — compute config deltas + mode from hormones
-- Output nodes use tanh → values in [-1, 1] → scaled as deltas
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::affect_forward_output() {
  -- Config output: hidden → output (tanh activation)
  LET $out_nodes = (SELECT id, node_id, bias FROM nn_node WHERE model = 'affect' AND layer = 'output');
  FOR $o IN $out_nodes {
    LET $ws = (SELECT math::sum(in.value * weight) AS s FROM nn_edge
      WHERE out = $o.id AND in.layer = 'hidden' GROUP ALL)[0].s ?? 0.0;
    LET $raw = $ws + ($o.bias ?? 0);
    -- tanh approximation: (e^x - e^-x) / (e^x + e^-x)
    LET $ex = math::pow(math::E, math::clamp($raw, -5.0, 5.0));
    LET $enx = math::pow(math::E, math::clamp(0.0 - $raw, -5.0, 5.0));
    LET $tanh_val = ($ex - $enx) / ($ex + $enx);
    UPDATE nn_node SET value = $tanh_val WHERE id = $o.id;
  };

  -- Mode output: hidden → mode (linear, then softmax)
  LET $mode_nodes = (SELECT id, node_id, bias FROM nn_node WHERE model = 'affect' AND layer = 'mode');
  LET $max_val = -999.0;
  LET $mode_raw = [];

  FOR $m IN $mode_nodes {
    LET $ws = (SELECT math::sum(in.value * weight) AS s FROM nn_edge
      WHERE out = $m.id AND in.layer = 'hidden' GROUP ALL)[0].s ?? 0.0;
    UPDATE nn_node SET value = $ws + ($m.bias ?? 0) WHERE id = $m.id;
  };

  -- Softmax over mode nodes
  LET $modes = (SELECT id, node_id, value FROM nn_node WHERE model = 'affect' AND layer = 'mode');
  LET $max_v = math::max($modes.map(|$m| $m.value)) ?? 0;
  LET $sum_exp = math::sum($modes.map(|$m| math::pow(math::E, math::clamp($m.value - $max_v, -10.0, 0.0)))) ?? 1;

  FOR $m IN $modes {
    LET $prob = math::pow(math::E, math::clamp($m.value - $max_v, -10.0, 0.0)) / $sum_exp;
    UPDATE nn_node SET value = $prob WHERE id = $m.id;
  };

  RETURN true;
};

-- ═══════════════════════════════════════════
-- 3. fn::apply_config_deltas — write output layer back to kernel_state.config
-- Config names map to actual config params
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::apply_config_deltas() {
  LET $cfg = (SELECT * FROM kernel_state LIMIT 1)[0].config ?? {};
  LET $scale = $cfg.config_delta_scale ?? 0.1;

  -- Read config output nodes (tanh values in [-1, 1])
  LET $outputs = (SELECT node_id, value FROM nn_node WHERE model = 'affect' AND layer = 'output');

  -- Output tanh maps [-1,1] to parameter range:
  -- tanh=0 → default, tanh=1 → max, tanh=-1 → min
  -- config = default + tanh × range × scale
  -- This is ABSOLUTE positioning, not cumulative drift

  FOR $o IN $outputs {
    LET $name = string::replace($o.node_id, 'config:', '');
    LET $t = $o.value ?? 0; -- tanh output in [-1, 1]

    -- convergence_threshold: default=0.1, range=[0.02, 0.4]
    IF $name = 'convergence_threshold' {
      UPDATE kernel_state SET config.accumulator_valence_threshold = math::clamp(0.1 + $t * 0.15 * $scale, 0.02, 0.4);
    };
    -- spread_factor: default=0.05, range=[0.01, 0.15]
    IF $name = 'spread_factor' {
      UPDATE kernel_state SET config.spread_weight_rate = math::clamp(0.05 + $t * 0.05 * $scale, 0.01, 0.15);
    };
    -- hebbian_lr: default=0.01, range=[0.002, 0.05]
    IF $name = 'hebbian_lr' {
      UPDATE kernel_state SET config.hebbian_lr = math::clamp(0.01 + $t * 0.02 * $scale, 0.002, 0.05);
    };
    -- energy_threshold: default=0.15, range=[0.05, 0.4]
    IF $name = 'energy_threshold' {
      UPDATE kernel_state SET config.agency_energy_threshold = math::clamp(0.15 + $t * 0.12 * $scale, 0.05, 0.4);
    };
    -- activation_boost: default=0.1, range=[0.02, 0.25]
    IF $name = 'activation_boost' {
      UPDATE kernel_state SET config.reactivation_weight_boost = math::clamp(0.1 + $t * 0.08 * $scale, 0.02, 0.25);
    };
    -- freshness_decay: default=0.999, range=[0.995, 0.9999]
    IF $name = 'freshness_decay' {
      UPDATE kernel_state SET config.trace_freshness_decay = math::clamp(0.999 + $t * 0.0005 * $scale, 0.995, 0.9999);
    };
  };

  RETURN true;
};

-- ═══════════════════════════════════════════
-- 4. fn::get_behavioral_mode — returns current dominant mode
-- Agency uses this to decide explore/exploit/defensive/resting
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::get_behavioral_mode() {
  LET $modes = (SELECT node_id, value FROM nn_node WHERE model = 'affect' AND layer = 'mode');
  LET $best = { name: 'explore', prob: 0.25 };
  FOR $m IN $modes {
    IF ($m.value ?? 0) > $best.prob {
      LET $best = { name: string::replace($m.node_id, 'mode:', ''), prob: $m.value };
    };
  };
  RETURN $best;
};

-- ═══════════════════════════════════════════
-- 5. fn::agency_tick — use behavioral mode for action selection
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::agency_tick($tick: int) {
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  IF $state = NONE OR ($state.running ?? false) = false { RETURN { acted: false }; };
  LET $cfg = $state.config ?? {};

  LET $energy = $state.energy ?? 0;
  IF $energy < ($cfg.agency_energy_threshold ?? 0.15) { RETURN { acted: false, reason: 'low_energy' }; };

  -- Get behavioral mode from affect model
  LET $mode = fn::get_behavioral_mode();
  LET $mode_name = $mode.name ?? 'explore';

  -- Resting mode: don't act, conserve energy
  IF $mode_name = 'resting' AND $energy < 0.5 { RETURN { acted: false, reason: 'resting_mode' }; };

  -- Defensive mode: only act if high energy, avoid novelty
  IF $mode_name = 'defensive' AND $energy < 0.3 { RETURN { acted: false, reason: 'defensive_low_energy' }; };

  LET $dopamine = (SELECT * FROM nn_node WHERE node_id = 'hormone:dopamine' LIMIT 1)[0].value ?? 0.5;
  LET $cortisol = (SELECT * FROM nn_node WHERE node_id = 'hormone:cortisol' LIMIT 1)[0].value ?? 0.5;
  LET $norepinephrine = (SELECT * FROM nn_node WHERE node_id = 'hormone:norepinephrine' LIMIT 1)[0].value ?? 0.5;

  -- Explore probability modulated by mode
  LET $explore_base = math::clamp(
    $dopamine * ($cfg.explore_dopamine_coeff ?? 0.4)
    + $norepinephrine * ($cfg.explore_ne_coeff ?? 0.3)
    - $cortisol * ($cfg.explore_cortisol_coeff ?? 0.2),
    $cfg.explore_min ?? 0.1,
    $cfg.explore_max ?? 0.9
  );

  -- Mode modulation: explore mode boosts exploration, exploit mode reduces it
  LET $explore_prob = IF $mode_name = 'explore' THEN math::min([0.95, $explore_base + 0.2])
    ELSE IF $mode_name = 'exploit' THEN math::max([0.1, $explore_base - 0.3])
    ELSE IF $mode_name = 'defensive' THEN math::max([0.05, $explore_base - 0.4])
    ELSE $explore_base
  END;

  LET $candidates = (SELECT trace_id, weight, content, position FROM trace
    WHERE archived = false AND suppressed = false LIMIT 10);

  IF array::len($candidates) = 0 {
    CREATE kernel_request CONTENT {
      type: 'action', payload: { method: 'explore', target: 'random', explore_prob: $explore_prob, mode: $mode_name },
      status: 'pending', created_at: time::now()
    };
    CREATE brain_action CONTENT { tick: $tick, method: 'explore', target: 'random', mode: $mode_name };
    RETURN { acted: true, method: 'explore', target: 'random', mode: $mode_name };
  };

  -- Exploit mode: pick highest weight trace. Explore mode: random.
  LET $target_idx = IF $explore_prob > rand::float() THEN
    math::min([array::len($candidates) - 1, math::floor(rand::float() * array::len($candidates))])
  ELSE 0 END;
  LET $target = $candidates[$target_idx];

  LET $methods = ['touch', 'push', 'look', 'shake', 'drop'];
  LET $method = $methods[math::floor(rand::float() * 5)];

  CREATE kernel_request CONTENT {
    type: 'action',
    payload: { method: $method, target: $target.trace_id, target_content: $target.content, explore_prob: $explore_prob, dopamine: $dopamine, mode: $mode_name },
    status: 'pending', created_at: time::now()
  };
  CREATE brain_action CONTENT { tick: $tick, method: $method, target: $target.trace_id, dopamine: $dopamine, energy: $energy, mode: $mode_name };

  UPDATE kernel_state SET energy = math::max([0.0, energy - ($cfg.action_energy_cost ?? 0.05)]);
  RETURN { acted: true, method: $method, target: $target.trace_id, explore_prob: $explore_prob, mode: $mode_name };
};

-- ═══════════════════════════════════════════
-- 6. fn::brain_tick — add output forward + config deltas + mode
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

    -- HIGH: hormone phasic decay + output layer + config deltas + backward learning
    IF $x % $freq_high = 0 {
      -- Phasic decay + tonic drift
      fn::hormone_decay_tick();

      -- OUTPUT LAYER: hormones → config deltas (tanh) + mode (softmax)
      fn::affect_forward_output();

      -- APPLY config deltas: output → kernel_state.config (self-modulation!)
      fn::apply_config_deltas();

      -- Targeted backward: edge weights learn per-hormone error signals
      fn::affect_backward_targeted($cfg.affect_lr ?? 0.05);

      -- Decay accumulators
      UPDATE nn_node SET value = value * ($cfg.accumulator_decay ?? 0.99) WHERE model = 'affect' AND layer = 'input';
    };

    -- Trace decay
    IF $x % $freq_trace = 0 {
      UPDATE trace SET
        weight = weight * ($cfg.trace_weight_decay ?? 0.999),
        freshness = freshness * ($cfg.trace_freshness_decay ?? 0.999)
      WHERE archived = false AND weight > ($cfg.trace_decay_min_weight ?? 0.05);
    };

    -- AGENCY: uses behavioral mode from affect output
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
      IF $x % ($freq_low * ($cfg.prune_freq_multiplier ?? 3)) = 0 {
        fn::prune_dissimilar_edges($cfg.prune_min_similarity ?? 0.15);
      };
    };

    -- DEEP: world model + introspection
    IF $x % $freq_deep = 0 { fn::build_world_model(); fn::introspect(); };
  };

  RETURN (SELECT * FROM kernel_state LIMIT 1)[0];
};
