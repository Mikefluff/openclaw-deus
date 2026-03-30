import { SurrealService } from './surreal.service';

/**
 * Seeds the neural network graph: nodes (neurons) + edges (weights).
 * Three models: affect (7→4→6+4), predictor (16→8), cone (9→2)
 */
export async function seedNeuralGraph(db: SurrealService): Promise<void> {
  // Check if already seeded
  const existing = await db.query('SELECT count() AS c FROM nn_node GROUP ALL');
  if (existing.isOk() && existing.value.length > 0 && (existing.value[0] as any).c > 0) return;

  // AFFECT MODEL: 7 accumulators → 4 hormones → 6 config targets + 4 modes
  const accNames = ['pred_error', 'tension', 'pain', 'convergence', 'reward', 'novelty', 'stability'];
  const hormoneNames = ['cortisol', 'dopamine', 'norepinephrine', 'serotonin'];
  const configNames = ['convergence_threshold', 'spread_factor', 'hebbian_lr', 'energy_threshold', 'activation_boost', 'freshness_decay'];
  const modeNames = ['explore', 'exploit', 'defensive', 'resting'];

  // Create accumulator nodes (input layer)
  for (const name of accNames) {
    await db.create('nn_node', { node_id: `acc:${name}`, model: 'affect', layer: 'input', value: 0, bias: 0, activation: 'none' });
  }
  // Create hormone nodes (hidden layer)
  for (const name of hormoneNames) {
    await db.create('nn_node', { node_id: `hormone:${name}`, model: 'affect', layer: 'hidden', value: 0.5, bias: 0, activation: 'sigmoid' });
  }
  // Create config target nodes (output layer)
  for (const name of configNames) {
    await db.create('nn_node', { node_id: `config:${name}`, model: 'affect', layer: 'output', value: 0, bias: 0, activation: 'tanh' });
  }
  // Create mode nodes (output layer)
  for (const name of modeNames) {
    await db.create('nn_node', { node_id: `mode:${name}`, model: 'affect', layer: 'mode', value: 0.25, bias: 0, activation: 'none' });
  }

  // Create edges: accumulators → hormones (W1: 7×4 = 28 edges)
  const xavier1 = Math.sqrt(2 / (accNames.length + hormoneNames.length));
  for (const acc of accNames) {
    for (const hormone of hormoneNames) {
      const w = (Math.random() * 2 - 1) * xavier1;
      await db.execute(
        `RELATE (SELECT id FROM nn_node WHERE node_id = $from LIMIT 1)->nn_edge->(SELECT id FROM nn_node WHERE node_id = $to LIMIT 1) SET weight = $w, grad_acc = 0, update_count = 0`,
        { from: `acc:${acc}`, to: `hormone:${hormone}`, w },
      );
    }
  }
  // Create edges: hormones → config targets (W2: 4×6 = 24 edges)
  const xavier2 = Math.sqrt(2 / (hormoneNames.length + configNames.length));
  for (const hormone of hormoneNames) {
    for (const config of configNames) {
      const w = (Math.random() * 2 - 1) * xavier2;
      await db.execute(
        `RELATE (SELECT id FROM nn_node WHERE node_id = $from LIMIT 1)->nn_edge->(SELECT id FROM nn_node WHERE node_id = $to LIMIT 1) SET weight = $w, grad_acc = 0, update_count = 0`,
        { from: `hormone:${hormone}`, to: `config:${config}`, w },
      );
    }
  }
  // Create edges: hormones → modes (W_mode: 4×4 = 16 edges)
  for (const hormone of hormoneNames) {
    for (const mode of modeNames) {
      const w = (Math.random() * 2 - 1) * xavier2;
      await db.execute(
        `RELATE (SELECT id FROM nn_node WHERE node_id = $from LIMIT 1)->nn_edge->(SELECT id FROM nn_node WHERE node_id = $to LIMIT 1) SET weight = $w, grad_acc = 0, update_count = 0`,
        { from: `hormone:${hormone}`, to: `mode:${mode}`, w },
      );
    }
  }

  // COGNITIVE CONE: 9 inputs → 2 outputs (18 edges)
  const coneInputs = ['cortisol', 'dopamine', 'norepinephrine', 'serotonin', 'energy', 'fatigue', 'activation', 'novelty', 'pred_error'];
  const coneOutputs = ['depth', 'spread'];
  for (const inp of coneInputs) {
    await db.create('nn_node', { node_id: `cone_in:${inp}`, model: 'cone', layer: 'input', value: 0, bias: 0, activation: 'none' });
  }
  for (const out of coneOutputs) {
    await db.create('nn_node', { node_id: `cone_out:${out}`, model: 'cone', layer: 'output', value: 0.5, bias: 0.5, activation: 'sigmoid' });
  }
  const xavierCone = Math.sqrt(2 / (coneInputs.length + coneOutputs.length));
  for (const inp of coneInputs) {
    for (const out of coneOutputs) {
      const w = (Math.random() * 2 - 1) * xavierCone;
      await db.execute(
        `RELATE (SELECT id FROM nn_node WHERE node_id = $from LIMIT 1)->nn_edge->(SELECT id FROM nn_node WHERE node_id = $to LIMIT 1) SET weight = $w, grad_acc = 0, update_count = 0`,
        { from: `cone_in:${inp}`, to: `cone_out:${out}`, w },
      );
    }
  }

  // SENSORIMOTOR PREDICTOR: 16 inputs (8 pos + 8 action) → 8 delta outputs (128 edges)
  for (let i = 0; i < 8; i++) {
    await db.create('nn_node', { node_id: `pos_dim:${i}`, model: 'predictor', layer: 'input', value: 0, bias: 0, activation: 'none' });
    await db.create('nn_node', { node_id: `action_dim:${i}`, model: 'predictor', layer: 'input', value: 0, bias: 0, activation: 'none' });
    await db.create('nn_node', { node_id: `delta_dim:${i}`, model: 'predictor', layer: 'output', value: 0, bias: 0, activation: 'tanh' });
  }
  const xavierPred = Math.sqrt(2 / (16 + 8));
  for (let i = 0; i < 16; i++) {
    const fromId = i < 8 ? `pos_dim:${i}` : `action_dim:${i - 8}`;
    for (let j = 0; j < 8; j++) {
      const w = (Math.random() * 2 - 1) * xavierPred;
      await db.execute(
        `RELATE (SELECT id FROM nn_node WHERE node_id = $from LIMIT 1)->nn_edge->(SELECT id FROM nn_node WHERE node_id = $to LIMIT 1) SET weight = $w, grad_acc = 0, update_count = 0`,
        { from: fromId, to: `delta_dim:${j}`, w },
      );
    }
  }

  // 7+4+6+4 + 9+2 + 24 = 56 nodes, 28+24+16+18+128 = 214 edges
  console.log(`Neural graph seeded: ${accNames.length + hormoneNames.length + configNames.length + modeNames.length + coneInputs.length + coneOutputs.length + 24} nodes, ${28 + 24 + 16 + 18 + 128} edges`);
}
