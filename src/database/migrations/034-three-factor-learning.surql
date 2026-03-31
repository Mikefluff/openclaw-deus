-- Migration 034: Three-Factor Learning Rule
-- Δw = η × eligibility × M (Frémaux & Gerstner 2016)
-- M = dopamine × TD_error + (1-dopamine) × surprise
-- Proper activation derivatives for sigmoid/tanh/linear

-- Add eligibility trace to activates edges
DEFINE FIELD IF NOT EXISTS eligibility ON activates TYPE float DEFAULT 0;

-- ═══════════════════════════════════════════
-- fn::nn_backward: fixed activation derivatives
-- sigmoid f'(x) = x(1-x), tanh f'(x) = 1-x², linear f'(x) = 1
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::nn_backward($model: string, $lr: float, $loss_sign: float) {
  UPDATE nn_edge SET
    weight = weight - $lr * math::clamp(
      $loss_sign * in.value * (
        IF out.activation = 'sigmoid' THEN out.value * (1.0 - out.value)
        ELSE IF out.activation = 'tanh' THEN 1.0 - out.value * out.value
        ELSE 1.0 END
      ),
      -1.0, 1.0
    ),
    grad_acc = grad_acc + math::abs($loss_sign * in.value),
    update_count = update_count + 1
  WHERE in.model = $model;
  RETURN true;
};

-- Same fix for layer-specific backward
DEFINE FUNCTION OVERWRITE fn::nn_backward_layer($model: string, $from_layer: string, $to_layer: string, $lr: float, $loss_sign: float) {
  UPDATE nn_edge SET
    weight = weight - $lr * math::clamp(
      $loss_sign * in.value * (
        IF out.activation = 'sigmoid' THEN out.value * (1.0 - out.value)
        ELSE IF out.activation = 'tanh' THEN 1.0 - out.value * out.value
        ELSE 1.0 END
      ),
      -1.0, 1.0
    ),
    grad_acc = grad_acc + math::abs($loss_sign * in.value),
    update_count = update_count + 1
  WHERE in.model = $model AND in.layer = $from_layer
    AND out.model = $model AND out.layer = $to_layer;
  RETURN true;
};

-- ═══════════════════════════════════════════
-- fn::learn_edge: three-factor Hebbian update for activates edges
-- Called by membrane after each transition
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::learn_edge(
  $from_id: record,
  $to_id: record,
  $valence: float,
  $pred_error: float
) {
  -- Read pre/post activations
  LET $from = (SELECT * FROM $from_id)[0];
  LET $to = (SELECT * FROM $to_id)[0];
  IF $from = NONE OR $to = NONE { RETURN false; };

  -- Read dopamine (neuromodulator) from affect model
  LET $dopamine = (SELECT * FROM nn_node WHERE node_id = 'hormone:dopamine' LIMIT 1)[0].value ?? 0.5;

  -- Config from kernel_state
  LET $cfg = (SELECT * FROM kernel_state LIMIT 1)[0].config ?? {};
  LET $lr = $cfg.hebbian_lr ?? 0.01;
  LET $gamma = $cfg.td_gamma ?? 0.9;
  LET $lambda = $cfg.eligibility_decay ?? 0.95;

  -- Pre/post activations
  LET $pre = ($from.weight ?? 0.5) * ($from.freshness ?? 1.0);
  LET $post = ($to.weight ?? 0.5) * ($to.freshness ?? 1.0);

  -- TD error: temporal difference
  LET $td = $valence + $gamma * ($to.weight ?? 0.5) - ($from.weight ?? 0.5);

  -- Surprise: prediction error → nonlinear surprise signal
  LET $surprise = 1.0 - math::pow(math::E, 0.0 - $pred_error * $pred_error);

  -- Third factor M: dopamine-modulated mix of TD + surprise
  LET $M = $dopamine * $td + (1.0 - $dopamine) * $surprise;

  -- Check if edge exists
  LET $edge = (SELECT * FROM activates WHERE in = $from_id AND out = $to_id LIMIT 1)[0];

  IF $edge != NONE {
    -- Update existing: eligibility trace + three-factor weight change
    UPDATE activates SET
      eligibility = $lambda * (eligibility ?? 0) + $pre * $post,
      weight = math::clamp(weight + $lr * ($lambda * (eligibility ?? 0) + $pre * $post) * $M, 0.01, 1.0),
      co_activation_count = (co_activation_count ?? 0) + 1
    WHERE in = $from_id AND out = $to_id;
  } ELSE {
    -- Create new edge: initial weight from M signal
    RELATE ($from_id)->activates->($to_id) SET
      weight = math::clamp(0.3 + $lr * $pre * $post * $M, 0.01, 1.0),
      eligibility = $pre * $post,
      co_activation_count = 1;
  };

  RETURN true;
};

-- ═══════════════════════════════════════════
-- fn::decay_eligibility: decay all eligibility traces each cycle
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::decay_eligibility() {
  LET $cfg = (SELECT * FROM kernel_state LIMIT 1)[0].config ?? {};
  LET $lambda = $cfg.eligibility_decay ?? 0.95;
  LET $gamma = $cfg.td_gamma ?? 0.9;

  UPDATE activates SET eligibility = eligibility * $gamma * $lambda
    WHERE eligibility > 0.001;

  RETURN true;
};
