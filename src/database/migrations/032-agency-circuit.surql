-- Migration 032: Agency Circuit
-- Brain decides actions autonomously. Pure RL: explore → consequence → learn.
-- Brain doesn't know object names. It sees trace clusters and pokes them.

-- ═══════════════════════════════════════════
-- ACTION LOG — brain's action history (never deleted, pointer archive)
-- ═══════════════════════════════════════════

DEFINE TABLE IF NOT EXISTS brain_action SCHEMALESS;

-- ═══════════════════════════════════════════
-- fn::agency_tick — brain decides to act
--
-- Pure exploration/exploitation based on:
-- 1. Curiosity: high prediction error regions → explore
-- 2. Empowerment: regions where actions produce diverse outcomes → prefer
-- 3. Affect: dopamine → explore, cortisol → defensive, serotonin → exploit
-- 4. Energy: low energy → no action (rest)
--
-- Output: kernel_request type='action' with target + method
-- Membrane executes in world, returns consequences as kernel_event
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::agency_tick($tick: int) {
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  IF $state = NONE OR ($state.running ?? false) = false { RETURN { acted: false }; };

  LET $energy = $state.energy ?? 0;
  IF $energy < 0.15 { RETURN { acted: false, reason: 'low_energy' }; };

  -- Read affect (hormones determine exploration policy)
  LET $dopamine = (SELECT * FROM nn_node WHERE node_id = 'hormone:dopamine' LIMIT 1)[0].value ?? 0.5;
  LET $cortisol = (SELECT * FROM nn_node WHERE node_id = 'hormone:cortisol' LIMIT 1)[0].value ?? 0.5;
  LET $norepinephrine = (SELECT * FROM nn_node WHERE node_id = 'hormone:norepinephrine' LIMIT 1)[0].value ?? 0.5;

  -- Exploration probability: high dopamine + high NE → explore, high cortisol → cautious
  LET $explore_prob = math::clamp($dopamine * 0.4 + $norepinephrine * 0.3 - $cortisol * 0.2, 0.1, 0.9);

  -- Find candidate targets: active traces with highest weight (salient)
  LET $candidates = (SELECT trace_id, weight, content, position FROM trace
    WHERE archived = false AND suppressed = false
    ORDER BY weight DESC LIMIT 10);

  IF array::len($candidates) = 0 {
    -- Nothing in awareness → random poke (pure exploration)
    CREATE kernel_request CONTENT {
      type: 'action',
      payload: {
        method: 'explore',
        target: 'random',
        reason: 'nothing_salient',
        explore_prob: $explore_prob
      },
      status: 'pending',
      created_at: time::now()
    };
    CREATE brain_action CONTENT { tick: $tick, method: 'explore', target: 'random', reason: 'nothing_salient' };
    RETURN { acted: true, method: 'explore', target: 'random' };
  };

  -- Choose target based on affect-weighted selection
  -- High dopamine → pick high-uncertainty trace (novel)
  -- High cortisol → pick high-weight trace (familiar/safe)
  LET $target_idx = IF $dopamine > 0.6 THEN
    -- Explore: pick lower-weight trace (less known)
    math::min([array::len($candidates) - 1, math::floor(rand::float() * array::len($candidates))])
  ELSE
    -- Exploit: pick highest-weight trace (most known)
    0
  END;

  LET $target = $candidates[$target_idx];

  -- Choose method (action type)
  LET $methods = ['touch', 'push', 'look', 'shake', 'drop'];
  LET $method_idx = math::floor(rand::float() * 5);
  LET $method = $methods[$method_idx];

  -- Record action request
  CREATE kernel_request CONTENT {
    type: 'action',
    payload: {
      method: $method,
      target: $target.trace_id,
      target_content: $target.content,
      target_weight: $target.weight,
      explore_prob: $explore_prob,
      dopamine: $dopamine,
      cortisol: $cortisol
    },
    status: 'pending',
    created_at: time::now()
  };

  -- Record in action archive (never deleted)
  CREATE brain_action CONTENT {
    tick: $tick,
    method: $method,
    target: $target.trace_id,
    target_content: $target.content,
    dopamine: $dopamine,
    cortisol: $cortisol,
    energy: $energy,
    explore_prob: $explore_prob
  };

  -- Spend energy on action
  UPDATE kernel_state SET energy = math::max([0.0, energy - 0.05]);

  RETURN { acted: true, method: $method, target: $target.trace_id, explore_prob: $explore_prob };
};

-- ═══════════════════════════════════════════
-- fn::process_consequence — brain processes sensory feedback from action
-- Called by membrane after world returns consequence
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::process_consequence($content: string, $source: string, $valence: float) {
  -- Create sensory trace from consequence
  LET $trace_id = 'T' + rand::string(8);
  CREATE trace CONTENT {
    trace_id: $trace_id,
    source_type: 'event',
    source_id: $source,
    content: $content,
    weight: 0.5 + math::abs($valence) * 0.3,
    initial_weight: 0.5,
    freshness: 1.0,
    confidence: 0.5,
    emotional_charge: $valence,
    reactivation_count: 0,
    reactivation_history: [],
    created_at_cycle: (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0,
    last_reactivated_cycle: (SELECT * FROM kernel_state LIMIT 1)[0].cycle ?? 0,
    position: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    velocity: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    suppressed: false,
    archived: false
  };

  -- If strong consequence → boost affect accumulators
  IF math::abs($valence) > 0.3 {
    -- Update accumulator nodes
    IF $valence > 0 {
      -- Positive → reward accumulator
      UPDATE nn_node SET value = math::min([5.0, value + $valence])
        WHERE node_id = 'acc:reward';
    } ELSE {
      -- Negative → pain accumulator
      UPDATE nn_node SET value = math::min([5.0, value + math::abs($valence)])
        WHERE node_id = 'acc:pain';
    };

    -- Prediction error accumulator
    UPDATE nn_node SET value = math::min([5.0, value + 0.3])
      WHERE node_id = 'acc:pred_error';
  };

  RETURN { trace_id: $trace_id, valence: $valence };
};

-- ═══════════════════════════════════════════
-- fn::brain_tick — unified internal loop, all circuits at natural frequencies
-- One FOR loop in Rust, zero external round-trips.
-- Brain decides everything: energy, affect, inference, agency.
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::brain_tick($n: int) {
  FOR $x IN 0..$n {
    -- CRITICAL (every 100): energy + sleep
    IF $x % 100 = 0 {
      UPDATE kernel_state SET
        cycle = (cycle ?? 0) + 100,
        energy = math::max([0.0, (energy ?? 1.0) - 0.2]),
        fatigue = math::min([1.0, (fatigue ?? 0.0) + 0.1]);
      LET $e = (SELECT * FROM kernel_state LIMIT 1)[0].energy ?? 0;
      IF $e < 0.1 {
        fn::sleep_consolidation(0.001);
        UPDATE kernel_state SET energy = math::min([1.5, energy + 0.8]), fatigue = 0.0;
      };
    };

    -- HIGH (every 100): affect forward
    IF $x % 100 = 0 {
      fn::nn_forward('affect', 'input', 'hidden');
    };

    -- Trace decay (every 50)
    IF $x % 50 = 0 {
      UPDATE trace SET weight = weight * 0.999, freshness = freshness * 0.999
        WHERE archived = false AND weight > 0.05;
    };

    -- AGENCY (every 200): brain decides to act
    IF $x % 200 = 0 {
      fn::agency_tick($x);
    };

    -- MEDIUM (every 500): inference + forget
    IF $x % 500 = 0 {
      fn::active_inference(0.3, 5);
      fn::forget_traces(0.02, 0.03);
    };

    -- LOW (every 2000): deep synthesis
    IF $x % 2000 = 0 {
      fn::nn_decay_all(0.001);
      fn::consolidate_episodic(3);
    };

    -- CONSOLIDATE (every 5000): world model + introspection
    IF $x % 5000 = 0 {
      fn::build_world_model();
      fn::introspect();
    };
  };

  RETURN (SELECT * FROM kernel_state LIMIT 1)[0];
};
