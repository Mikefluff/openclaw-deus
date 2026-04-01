-- Migration 049: Agency Always Acts
-- Brain doesn't need traces to want to act.
-- Newborn flails from first second. Agency generates actions unconditionally.
-- Brain says WHAT (method). Membrane decides WHICH object.
-- Q-values guide action choice when available, else random exploration.

DEFINE FUNCTION OVERWRITE fn::agency_tick($tick: int) {
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  IF $state = NONE OR ($state.running ?? false) = false { RETURN { acted: false }; };
  LET $cfg = $state.config ?? {};

  LET $energy = $state.energy ?? 0;
  IF $energy < ($cfg.agency_energy_threshold ?? 0.15) { RETURN { acted: false, reason: 'low_energy' }; };

  LET $mode = fn::get_behavioral_mode();
  LET $mode_name = $mode.name ?? ($cfg.behavioral_mode_default ?? 'explore');

  IF $mode_name = 'resting' AND $energy < ($cfg.mode_energy_resting ?? 0.5) { RETURN { acted: false, reason: 'resting_mode' }; };

  LET $dopamine = (SELECT * FROM nn_node WHERE node_id = 'hormone:dopamine' LIMIT 1)[0].value ?? 0.5;
  LET $cortisol = (SELECT * FROM nn_node WHERE node_id = 'hormone:cortisol' LIMIT 1)[0].value ?? 0.5;

  LET $methods = ['touch', 'push', 'drop', 'shake', 'look', 'squeeze'];
  LET $method = $methods[math::floor(rand::float() * array::len($methods))];
  LET $target_content = '';
  LET $pred_val = 0.0;

  -- If brain has learned Q-values, use best known action (exploit)
  LET $explore_prob = math::clamp(
    $dopamine * ($cfg.explore_dopamine_coeff ?? 0.4) - $cortisol * ($cfg.explore_cortisol_coeff ?? 0.2),
    $cfg.explore_min ?? 0.1, $cfg.explore_max ?? 0.9);
  IF $mode_name = 'explore' { LET $explore_prob = math::min([0.95, $explore_prob + ($cfg.mode_explore_boost ?? 0.2)]); };
  IF $mode_name = 'exploit' { LET $explore_prob = math::max([0.05, $explore_prob - ($cfg.mode_exploit_reduction ?? 0.3)]); };

  IF rand::float() > $explore_prob {
    -- EXPLOIT: pick best known action from Q-values
    LET $best = (SELECT * FROM action_value WHERE update_count > 0 LIMIT 1)[0];
    IF $best IS NOT NONE {
      LET $parts = string::split($best.key ?? '', ':');
      IF array::len($parts) >= 2 {
        LET $method = $parts[0];
        LET $target_content = string::join(':', array::slice($parts, 1, array::len($parts)));
        LET $pred_val = $best.value ?? 0;
      };
    };
  };
  -- ELSE: random explore (method already random from above)

  -- Brain says WHAT to do. Membrane picks WHICH object.
  CREATE kernel_request CONTENT {
    type: 'action',
    payload: { method: $method, target_content: $target_content, predicted_valence: $pred_val, mode: $mode_name, dopamine: $dopamine },
    status: 'pending', created_at: time::now()
  };

  UPDATE kernel_state SET energy = math::max([0.0, energy - ($cfg.action_energy_cost ?? 0.05)]);
  RETURN { acted: true, method: $method, mode: $mode_name };
};
