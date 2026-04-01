-- Migration 060: Fix accumulator decay + PLN RELATE NONE
-- 1. Accumulator decay too aggressive (0.99^3000 ≈ 0) → raise to 0.999
-- 2. PLN engine: guard ALL RELATE with IS NOT NONE, re-enable in brain_tick
-- 3. Freshness decay also too fast → match ECAN rent rate

UPDATE kernel_state SET
  config.accumulator_decay = 0.999,
  config.trace_freshness_decay = 0.9995;

-- ═══════════════════════════════════════════
-- fn::pln_infer_chain — with proper NONE guards on ALL RELATE
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::pln_infer_chain() {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $min_conf = $cfg.pln_min_confidence ?? 0.1;
  LET $cycle = (SELECT cycle FROM kernel_state LIMIT 1)[0].cycle ?? 0;

  LET $chains = (SELECT in AS a, out AS b, weight AS ab_strength
    FROM activates
    WHERE weight > 0.1 AND (archived IS NONE OR archived = false)
    AND in IS NOT NONE AND out IS NOT NONE
    LIMIT 20);

  LET $inferred = 0;

  FOR $chain IN $chains {
    IF $chain.a IS NONE OR $chain.b IS NONE { CONTINUE; };

    LET $bc_edges = (SELECT out AS c, weight AS bc_strength FROM activates
      WHERE in = $chain.b AND weight > 0.1 AND out != $chain.a
      AND out IS NOT NONE
      AND (archived IS NONE OR archived = false)
      LIMIT 5);

    FOR $bc IN $bc_edges {
      IF $bc.c IS NONE { CONTINUE; };

      LET $exists = (SELECT count() AS c FROM activates
        WHERE in = $chain.a AND out = $bc.c GROUP ALL)[0].c ?? 0;

      IF $exists = 0 {
        LET $belief_b = (SELECT weight FROM trace_state WHERE trace = $chain.b AND archived = false LIMIT 1)[0];
        LET $belief_c = (SELECT weight FROM trace_state WHERE trace = $bc.c AND archived = false LIMIT 1)[0];

        LET $sB = $belief_b.weight ?? 0.5;
        LET $sC = $belief_c.weight ?? 0.5;

        LET $result = fn::pln_deduction(
          $chain.ab_strength, 0.8, $bc.bc_strength, 0.8, $sB, $sC
        );

        IF ($result.confidence ?? 0) > $min_conf AND $chain.a IS NOT NONE AND $bc.c IS NOT NONE {
          RELATE ($chain.a)->activates->($bc.c) SET
            weight = $result.strength ?? 0.3,
            co_activation_count = 0,
            source = 'pln_deduction',
            inferred_cycle = $cycle;
          LET $inferred = $inferred + 1;
        };
      };
    };
  };

  RETURN { inferred: $inferred };
};

-- ═══════════════════════════════════════════
-- fn::pln_engine_tick — with NONE guards on ALL RELATE
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::pln_engine_tick() {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $budget = $cfg.pln_inference_budget ?? 5;
  LET $min_conf = $cfg.pln_min_premise_confidence ?? 0.1;
  LET $cycle = (SELECT cycle FROM kernel_state LIMIT 1)[0].cycle ?? 0;

  LET $rules = (SELECT * FROM pln_rule WHERE active = true);
  LET $inferred = 0;

  FOR $rule IN $rules {
    IF $inferred >= $budget { BREAK; };

    IF $rule.pattern = 'chain' {
      LET $chains = (SELECT in AS a, out AS b, weight AS w_ab FROM activates
        WHERE weight > $min_conf AND (archived IS NONE OR archived = false)
        AND in IS NOT NONE AND out IS NOT NONE
        LIMIT 10);

      FOR $ab IN $chains {
        IF $inferred >= $budget OR $ab.a IS NONE OR $ab.b IS NONE { CONTINUE; };
        LET $bc_edges = (SELECT out AS c, weight AS w_bc FROM activates
          WHERE in = $ab.b AND weight > $min_conf AND out != $ab.a
          AND out IS NOT NONE AND (archived IS NONE OR archived = false)
          LIMIT 3);

        FOR $bc IN $bc_edges {
          IF $inferred >= $budget OR $bc.c IS NONE { CONTINUE; };
          LET $exists = (SELECT count() AS c FROM activates
            WHERE in = $ab.a AND out = $bc.c GROUP ALL)[0].c ?? 0;

          IF $exists = 0 AND $ab.a IS NOT NONE AND $bc.c IS NOT NONE {
            LET $ts_b = (SELECT weight FROM trace_state WHERE trace = $ab.b AND archived = false LIMIT 1)[0].weight ?? 0.5;
            LET $ts_c = (SELECT weight FROM trace_state WHERE trace = $bc.c AND archived = false LIMIT 1)[0].weight ?? 0.5;
            LET $result = fn::pln_deduction($ab.w_ab, 0.8, $bc.w_bc, 0.8, $ts_b, $ts_c);
            IF ($result.confidence ?? 0) > $min_conf {
              RELATE ($ab.a)->activates->($bc.c) SET
                weight = $result.strength ?? 0.3, co_activation_count = 0,
                source = 'pln:deduction', inferred_cycle = $cycle;
              LET $inferred = $inferred + 1;
            };
          };
        };
      };
    };

    IF $rule.pattern = 'single' {
      LET $strong = (SELECT in AS a, out AS b, weight AS w FROM activates
        WHERE weight > 0.5 AND (archived IS NONE OR archived = false)
        AND in IS NOT NONE AND out IS NOT NONE
        LIMIT 5);

      FOR $e IN $strong {
        IF $inferred >= $budget OR $e.a IS NONE OR $e.b IS NONE { CONTINUE; };
        LET $rev = (SELECT count() AS c FROM activates
          WHERE in = $e.b AND out = $e.a GROUP ALL)[0].c ?? 0;
        IF $rev = 0 AND $e.b IS NOT NONE AND $e.a IS NOT NONE {
          LET $ts_a = (SELECT weight FROM trace_state WHERE trace = $e.a AND archived = false LIMIT 1)[0].weight ?? 0.5;
          LET $ts_b = (SELECT weight FROM trace_state WHERE trace = $e.b AND archived = false LIMIT 1)[0].weight ?? 0.5;
          LET $result = fn::pln_inversion($e.w, 0.8, $ts_a, $ts_b);
          IF ($result.confidence ?? 0) > $min_conf {
            RELATE ($e.b)->activates->($e.a) SET
              weight = $result.strength ?? 0.2, co_activation_count = 0,
              source = 'pln:inversion', inferred_cycle = $cycle;
            LET $inferred = $inferred + 1;
          };
        };
      };
    };

    IF $rule.pattern = 'shared_target' {
      LET $targets = (SELECT out AS b FROM activates
        WHERE weight > 0.3 AND (archived IS NONE OR archived = false)
        AND out IS NOT NONE
        LIMIT 5);

      FOR $t IN $targets {
        IF $inferred >= $budget OR $t.b IS NONE { CONTINUE; };
        LET $incoming = (SELECT in AS source, weight FROM activates
          WHERE out = $t.b AND weight > 0.3 AND in IS NOT NONE
          AND (archived IS NONE OR archived = false)
          LIMIT 5);

        IF array::len($incoming) >= 2 {
          LET $a = $incoming[0];
          LET $c = $incoming[1];
          IF $a.source IS NOT NONE AND $c.source IS NOT NONE AND $a.source != $c.source {
            LET $ac_exists = (SELECT count() AS cnt FROM activates
              WHERE in = $a.source AND out = $c.source GROUP ALL)[0].cnt ?? 0;
            IF $ac_exists = 0 {
              LET $result = fn::pln_abduction($a.weight, 0.7, $c.weight, 0.7);
              IF ($result.confidence ?? 0) > $min_conf {
                RELATE ($a.source)->activates->($c.source) SET
                  weight = $result.strength ?? 0.15, co_activation_count = 0,
                  source = 'pln:abduction', inferred_cycle = $cycle;
                LET $inferred = $inferred + 1;
              };
            };
          };
        };
      };
    };

    UPDATE pln_rule SET fire_count = (fire_count ?? 0) + 1 WHERE name = $rule.name;
  };

  RETURN { inferred: $inferred, rules_checked: array::len($rules) };
};

-- ═══════════════════════════════════════════
-- fn::brain_tick — re-enable PLN at freq_deep
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
      UPDATE nn_node SET value = value * ($cfg.accumulator_decay ?? 0.999) WHERE model = 'affect' AND layer = 'input';
      fn::ecan_collect_rent();
    };

    IF $x % $freq_trace = 0 {
      UPDATE trace_state SET
        freshness = freshness * ($cfg.trace_freshness_decay ?? 0.9995)
      WHERE archived = false AND freshness > 0.01;
    };

    IF $x % $freq_agency = 0 { fn::agency_tick($x); };

    IF $x % $freq_med = 0 {
      fn::active_inference($cfg.active_inference_threshold ?? 0.3, $cfg.active_inference_limit ?? 10);
      fn::forget_traces($cfg.forget_weight_threshold ?? 0.02, $cfg.forget_freshness_threshold ?? 0.03);
      fn::decay_eligibility();
      fn::apply_meta_modulation();
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
      fn::ecan_create_hebbian();
      fn::ecan_forget();
      fn::predictor_replay($cfg.predictor_replay_batch ?? 5);
      IF $x % ($freq_low * ($cfg.prune_freq_multiplier ?? 3)) = 0 {
        fn::prune_dissimilar_edges($cfg.prune_min_similarity ?? 0.15);
        fn::synaptic_homeostasis();
      };
    };

    IF $x % $freq_deep = 0 {
      fn::build_world_model();
      fn::introspect();
      fn::pln_infer_chain();
      fn::extract_all_sections();
      CREATE config_snapshot SET config = $cfg, cycle = (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0;
    };
  };

  RETURN (SELECT * FROM kernel_state LIMIT 1)[0];
};
