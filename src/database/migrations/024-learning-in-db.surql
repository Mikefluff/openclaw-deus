-- Migration 024: Neural Networks as Graph Relations
-- Every weight is an EDGE. Every neuron is a NODE.
-- Forward pass = graph traversal. Backward pass = edge update.
-- No matrices. No JSON. Pure graph. Pure Rust.

-- ═══════════════════════════════════════════
-- MATH HELPERS
-- ═══════════════════════════════════════════

DEFINE FUNCTION IF NOT EXISTS fn::sigmoid($x: float) {
  LET $c = math::clamp($x, -10, 10);
  RETURN 1.0 / (1.0 + math::pow(math::E,0.0 - $c));
};

DEFINE FUNCTION IF NOT EXISTS fn::nn_tanh($x: float) {
  LET $c = math::clamp($x, -10, 10);
  LET $e2x = math::pow(math::E,2.0 * $c);
  RETURN ($e2x - 1.0) / ($e2x + 1.0);
};

-- ═══════════════════════════════════════════
-- NEURAL GRAPH SCHEMA
-- ═══════════════════════════════════════════

DEFINE TABLE IF NOT EXISTS nn_node SCHEMAFULL;
DEFINE FIELD node_id ON nn_node TYPE string;
DEFINE FIELD model ON nn_node TYPE string;
DEFINE FIELD layer ON nn_node TYPE string;
DEFINE FIELD value ON nn_node TYPE float DEFAULT 0;
DEFINE FIELD bias ON nn_node TYPE float DEFAULT 0;
DEFINE FIELD activation ON nn_node TYPE string DEFAULT 'none';

DEFINE INDEX idx_nn_node_id ON nn_node FIELDS node_id UNIQUE;
DEFINE INDEX idx_nn_model_layer ON nn_node FIELDS model, layer;

DEFINE TABLE IF NOT EXISTS nn_edge SCHEMAFULL TYPE RELATION FROM nn_node TO nn_node;
DEFINE FIELD weight ON nn_edge TYPE float;
DEFINE FIELD grad_acc ON nn_edge TYPE float DEFAULT 0;
DEFINE FIELD update_count ON nn_edge TYPE int DEFAULT 0;

-- ═══════════════════════════════════════════
-- FORWARD PASS: graph traversal
-- ═══════════════════════════════════════════

-- Set input values for a model. $values = [{node_id: "acc:pred_error", value: 0.3}, ...]
DEFINE FUNCTION IF NOT EXISTS fn::nn_set_inputs($values: array) {
  FOR $v IN $values {
    UPDATE nn_node SET value = $v.value WHERE node_id = $v.node_id;
  };
  RETURN true;
};

-- Forward pass: compute output layer values from input layer via weighted edges.
-- Returns array of {node_id, value} for the output layer.
DEFINE FUNCTION IF NOT EXISTS fn::nn_forward($model: string, $from_layer: string, $to_layer: string) {
  -- For each output node: compute weighted sum of inputs, add bias, apply activation
  LET $output_nodes = (SELECT id, node_id, bias, activation FROM nn_node
    WHERE model = $model AND layer = $to_layer);

  FOR $out IN $output_nodes {
    -- Sum incoming edge weights × input values
    LET $ws = (SELECT math::sum(in.value * weight) AS s FROM nn_edge
      WHERE out = $out.id AND in.model = $model AND in.layer = $from_layer
      GROUP ALL)[0].s ?? 0.0;

    LET $raw = $ws + $out.bias;
    LET $activated = IF $out.activation = 'sigmoid' THEN fn::sigmoid($raw)
                     ELSE IF $out.activation = 'tanh' THEN fn::nn_tanh($raw)
                     ELSE IF $out.activation = 'softplus' THEN math::ln(1.0 + math::pow(math::E, math::clamp($raw, -10.0, 10.0)))
                     ELSE $raw END;
    UPDATE nn_node SET value = $activated WHERE id = $out.id;
  };

  RETURN (SELECT node_id, value FROM nn_node WHERE model = $model AND layer = $to_layer);
};

-- Softmax forward for mode layer (special: normalize across nodes)
DEFINE FUNCTION IF NOT EXISTS fn::nn_softmax($model: string, $layer: string) {
  LET $nodes = SELECT node_id, value FROM nn_node WHERE model = $model AND layer = $layer;
  LET $max_val = math::max($nodes.value);
  LET $exps = $nodes.map(|$n| { node_id: $n.node_id, exp_val: math::pow(math::E,$n.value - $max_val) });
  LET $sum_exp = math::sum($exps.exp_val);
  FOR $e IN $exps {
    UPDATE nn_node SET value = $e.exp_val / $sum_exp WHERE node_id = $e.node_id;
  };
  RETURN SELECT node_id, value FROM nn_node WHERE model = $model AND layer = $layer;
};

-- ═══════════════════════════════════════════
-- BACKWARD PASS: edge weight update
-- ═══════════════════════════════════════════

-- Backward pass: update all edges for a model based on loss signal.
-- Uses sigmoid derivative: out.value × (1 - out.value) for sigmoid-activated nodes.
-- $lr = learning rate, $loss_sign = +1 (reduce output) or -1 (increase output)
DEFINE FUNCTION IF NOT EXISTS fn::nn_backward($model: string, $lr: float, $loss_sign: float) {
  UPDATE nn_edge SET
    weight = weight - $lr * math::clamp(
      $loss_sign * in.value * out.value * (1.0 - out.value),
      -1.0, 1.0
    ),
    grad_acc = grad_acc + math::abs($loss_sign * in.value),
    update_count = update_count + 1
  WHERE in.model = $model;
  RETURN true;
};

-- Targeted backward: update edges between specific layers only
DEFINE FUNCTION IF NOT EXISTS fn::nn_backward_layer($model: string, $from_layer: string, $to_layer: string, $lr: float, $loss_sign: float) {
  UPDATE nn_edge SET
    weight = weight - $lr * math::clamp(
      $loss_sign * in.value * out.value * (1.0 - out.value),
      -1.0, 1.0
    ),
    grad_acc = grad_acc + math::abs($loss_sign * in.value),
    update_count = update_count + 1
  WHERE in.model = $model AND in.layer = $from_layer
    AND out.model = $model AND out.layer = $to_layer;
  RETURN true;
};

-- Read all output values for a model+layer (no computation, just read)
DEFINE FUNCTION IF NOT EXISTS fn::nn_read($model: string, $layer: string) {
  RETURN SELECT node_id, value FROM nn_node WHERE model = $model AND layer = $layer;
};
