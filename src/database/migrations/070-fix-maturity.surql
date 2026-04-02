-- Migration 070: Fix maturity integer division + configurable targets

UPDATE kernel_state SET
  config.maturity_edge_target = config.maturity_edge_target ?? 100.0,
  config.maturity_convergence_target = config.maturity_convergence_target ?? 200.0,
  config.levelup_maturity_threshold = 0.55;

DEFINE FUNCTION OVERWRITE fn::compute_maturity() {
  LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
  LET $active = (SELECT count() AS c FROM trace_state WHERE archived = false GROUP ALL)[0].c ?? 0;
  LET $react_vals = (SELECT reactivation_count FROM trace_state WHERE archived = false);
  LET $mean_react = IF $active > 1
    THEN math::mean($react_vals.map(|$r| $r.reactivation_count ?? 0)) ?? 0
    ELSE 0 END;
  LET $conv_score = math::clamp($mean_react / ($cfg.maturity_convergence_target ?? 200.0), 0.0, 1.0);

  LET $edge_count = (SELECT count() AS c FROM activates WHERE (archived IS NONE OR archived = false) GROUP ALL)[0].c ?? 0;
  LET $edge_score = math::clamp(($edge_count * 1.0) / ($cfg.maturity_edge_target ?? 100.0), 0.0, 1.0);

  LET $ce_count = (SELECT count() AS c FROM cognitive_event GROUP ALL)[0].c ?? 0;
  LET $recent_rpe = IF $ce_count > 10
    THEN (SELECT math::mean(math::abs(prediction_error)) AS m FROM cognitive_event GROUP ALL)[0].m ?? 0.5
    ELSE 0.5 END;
  LET $predict_score = math::clamp(1.0 - $recent_rpe * 2.0, 0.0, 1.0);

  LET $mode_vals = (SELECT * FROM nn_node WHERE model = 'affect' AND layer = 'mode');
  LET $mode_probs = $mode_vals.map(|$m| math::abs($m.value ?? 0.25));
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
