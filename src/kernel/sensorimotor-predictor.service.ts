import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SurrealService } from '../database/surreal.service';
import { CognitiveConfigService } from '../cognitive/cognitive-config.service';

/**
 * SensorimotorPredictorService: Learned dynamics model in embedding space.
 *
 * Core delta prediction lives in neural GRAPH (nn_node + nn_edge):
 *   pos_dim:0-7 + action_dim:0-7 ──nn_edge──> delta_dim:0-7
 *   Forward = fn::nn_forward("predictor", "input", "output")
 *   Backward = fn::nn_backward("predictor", lr, loss_sign)
 *
 * Supplementary models still in JS (not yet in graph):
 *   - W_action: action string → embedding vector
 *   - W_unc: uncertainty head (softplus)
 *   - W_delta_t2: multi-horizon t+2 prediction
 *   - VQ Codebook: discrete movement primitives
 *
 * Loss = variational free energy (prediction error + uncertainty + decorrelation + VQ commitment)
 */

const ACTION_EMBED_DIM = 8;
const MAX_POS_DIM = 64;
const SCALE = 0.5;

const POS_DIM_NAMES = Array.from({ length: 8 }, (_, i) => `pos_dim:${i}`);
const ACTION_DIM_NAMES = Array.from({ length: 8 }, (_, i) => `action_dim:${i}`);
const DELTA_DIM_NAMES = Array.from({ length: 8 }, (_, i) => `delta_dim:${i}`);

interface SensorimotorTransition {
  position_t: number[];
  position_t1: number[];
  action: string;
  reward: number;
  cycle: number;
}

interface PredictionResult {
  predicted_position: number[];
  uncertainty: number[];
  confidence: number;
  predicted_t2?: number[];
  codebook_id?: number;
}

@Injectable()
export class SensorimotorPredictorService implements OnModuleInit {
  private readonly logger = new Logger(SensorimotorPredictorService.name);

  // Action embedding (still JS — action vocabulary is dynamic)
  private W_action!: number[][];
  private actionIndex = new Map<string, number>();
  private lr = 0.01;
  private stepCount = 0;
  private posDim = 8;

  // Supplementary JS weights (uncertainty + multi-horizon)
  private W_unc!: number[][];
  private W_delta_t2!: number[][];

  // VQ Codebook (Delta-IRIS)
  private codebook: number[][] = [];
  private codebookSize = 64;

  // Cached forward pass values
  private lastInput: number[] = [];
  private lastDelta: number[] = [];
  private lastDeltaLogit_t2: number[] = [];
  private lastDelta_t2: number[] = [];
  private lastPredicted_t2: number[] = [];
  private lastUncLogit: number[] = [];
  private lastUncertainty: number[] = [];
  private lastCodebookId = 0;
  private lastActionIdx = -1;

  // In-memory transition queue
  private pendingTransitions: Array<{
    position_t: number[]; position_t1: number[];
    action: string; reward: number; cycle: number;
  }> = [];

  private static readonly DEFAULT_ACTIONS = ['touch', 'push', 'drop', 'shake', 'look_closely', 'put_in_water',
    'approach', 'share', 'take', 'observe', 'help'];

  constructor(
    private readonly db: SurrealService,
    private readonly config: CognitiveConfigService,
  ) {}

  onModuleInit(): void {
    // Zero async — init weights synchronously. DB load deferred to first predict.
    this.initWeights();
  }

  // ═══════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════

  async predict(position: number[], action: string): Promise<PredictionResult> {
    const padded = this.padPosition(position);
    const { predicted, uncertainty, predicted_t2, codebook_id } = await this.forward(padded, action);

    const meanUnc = uncertainty.reduce((s, u) => s + u, 0) / Math.max(1, uncertainty.length);
    const confidence = Math.max(0, Math.min(1, 1 / (1 + meanUnc)));

    return { predicted_position: predicted, uncertainty, confidence, predicted_t2, codebook_id };
  }

  queueTransition(
    position_t: number[], position_t1: number[],
    action: string, reward: number, cycle: number,
  ): void {
    this.pendingTransitions.push({
      position_t: this.padPosition(position_t),
      position_t1: this.padPosition(position_t1),
      action, reward, cycle,
    });
  }

  async flushTransitions(): Promise<void> {
    if (this.pendingTransitions.length === 0) return;
    const batch = this.pendingTransitions.splice(0);
    await this.db.execute(
      'RETURN fn::batch_insert_transitions($transitions)',
      { transitions: batch },
    );
  }

  async recordTransition(
    position_t: number[], position_t1: number[],
    action: string, reward: number, cycle: number,
  ): Promise<void> {
    await this.db.create('sensorimotor_transition', {
      position_t: this.padPosition(position_t),
      position_t1: this.padPosition(position_t1),
      action, reward, cycle, trained: false,
    } as Record<string, unknown>);
  }

  async trainOnBatch(batchSize = 10): Promise<{ loss: number; count: number }> {
    const result = await this.db.query<SensorimotorTransition>(
      `SELECT position_t, position_t1, action, reward, cycle
       FROM sensorimotor_transition WHERE trained = false
       ORDER BY cycle DESC LIMIT $limit`,
      { limit: batchSize },
    );

    if (result.isErr() || result.value.length === 0) {
      return { loss: 0, count: 0 };
    }

    const transitions = result.value;
    let totalLoss = 0;

    for (let idx = 0; idx < transitions.length; idx++) {
      const t = transitions[idx];
      this.ensureAction(t.action);

      const padT = this.padPosition(t.position_t);
      const padT1 = this.padPosition(t.position_t1);
      const { predicted, predicted_t2 } = await this.forward(padT, t.action);

      const loss = this.computeLoss(predicted, padT1, t.reward);
      totalLoss += loss;

      // Multi-horizon loss
      if (idx + 1 < transitions.length && transitions[idx + 1].cycle === t.cycle + 1) {
        const actual_t2 = this.padPosition(transitions[idx + 1].position_t1);
        totalLoss += this.computeLossAt(predicted_t2, actual_t2) * 0.5;
      }

      // Backward pass: graph edges + JS weights
      await this.backward(padT1, t.reward);

      // EMA codebook update
      if (this.lastCodebookId < this.codebook.length) {
        for (let d = 0; d < this.posDim; d++) {
          this.codebook[this.lastCodebookId][d] =
            0.99 * (this.codebook[this.lastCodebookId][d] || 0) + 0.01 * (this.lastDelta[d] || 0);
        }
      }
    }

    this.stepCount++;
    const avgLoss = totalLoss / transitions.length;

    await this.db.execute(
      `UPDATE sensorimotor_transition SET trained = true WHERE trained = false ORDER BY cycle DESC LIMIT $limit`,
      { limit: batchSize },
    );

    if (this.stepCount % 10 === 0) {
      await this.persistWeights();
    }

    if (transitions.length > 0) {
      this.logger.log(`Predictor trained: ${transitions.length} transitions, loss=${avgLoss.toFixed(4)}, step=${this.stepCount}`);
    }

    return { loss: avgLoss, count: transitions.length };
  }

  getUncertainty(position: number[], action: string): number {
    // Sync uncertainty from cached JS W_unc (no DB call needed)
    this.ensureAction(action);
    const padded = this.padPosition(position);
    const actionVec = this.W_action[this.lastActionIdx] || new Array(ACTION_EMBED_DIM).fill(0);
    const input = [...padded.slice(0, this.posDim), ...actionVec];
    const inputDim = this.posDim + ACTION_EMBED_DIM;

    let totalUnc = 0;
    for (let j = 0; j < this.posDim; j++) {
      let sum = 0;
      for (let i = 0; i < Math.min(inputDim, this.W_unc.length); i++) {
        sum += (this.W_unc[i]?.[j] ?? 0) * (input[i] ?? 0);
      }
      totalUnc += Math.log(1 + Math.exp(sum)); // softplus
    }
    return totalUnc / this.posDim;
  }

  computeEmpowerment(position: number[]): number {
    const actions = Array.from(this.actionIndex.keys());
    if (actions.length < 2) return 0;

    // Use sync uncertainty-based estimation (avoid async in tight loop)
    const uncertainties = actions.map(a => this.getUncertainty(position, a));
    const mean = uncertainties.reduce((s, u) => s + u, 0) / uncertainties.length;
    const variance = uncertainties.reduce((s, u) => s + (u - mean) ** 2, 0) / uncertainties.length;
    return variance;
  }

  explorationDrive(position: number[], action: string, alpha = 0.5): number {
    const uncertainty = this.getUncertainty(position, action);
    const empowerment = this.computeEmpowerment(position);
    return alpha * uncertainty + (1 - alpha) * empowerment;
  }

  // ═══════════════════════════════════════════
  // FORWARD PASS: graph traversal + JS supplements
  // ═══════════════════════════════════════════

  private async forward(position: number[], action: string): Promise<{ predicted: number[]; uncertainty: number[]; predicted_t2: number[]; codebook_id: number }> {
    this.ensureAction(action);
    const actionIdx = this.actionIndex.get(action) || 0;
    const actionVec = this.W_action[actionIdx] || new Array(ACTION_EMBED_DIM).fill(0);

    const input = [...position.slice(0, this.posDim), ...actionVec];
    this.lastInput = input;
    const inputDim = this.posDim + ACTION_EMBED_DIM;

    // Set input node values in graph
    const inputValues: { node_id: string; value: number }[] = [];
    for (let i = 0; i < this.posDim; i++) {
      inputValues.push({ node_id: `pos_dim:${i}`, value: position[i] || 0 });
    }
    for (let i = 0; i < ACTION_EMBED_DIM; i++) {
      inputValues.push({ node_id: `action_dim:${i}`, value: actionVec[i] || 0 });
    }

    await this.db.execute('RETURN fn::nn_set_inputs($values)', { values: inputValues });

    // Core delta prediction: graph traversal (Rust)
    const deltaResult = await this.db.query<{ node_id: string; value: number }>(
      'RETURN fn::nn_forward("predictor", "input", "output")',
    );

    // Parse delta from graph results (tanh activated → [-1,1])
    const delta = new Array(this.posDim).fill(0);
    if (deltaResult.isOk()) {
      for (const row of deltaResult.value) {
        const m = row.node_id.match(/delta_dim:(\d+)/);
        if (m) delta[parseInt(m[1])] = row.value * SCALE;
      }
    }
    this.lastDelta = delta;

    // VQ Codebook: quantize delta
    const { quantized, codebook_id } = this.quantize(delta);
    this.lastCodebookId = codebook_id;

    // Predicted next position (straight-through estimator)
    const predicted = position.slice(0, this.posDim).map((p, i) => p + (quantized[i] || 0));

    // Multi-horizon T+2 (JS — W_delta_t2)
    const input_t2 = [...predicted.slice(0, this.posDim), ...actionVec];
    const delta_t2_logit = new Array(this.posDim).fill(0);
    for (let j = 0; j < this.posDim; j++) {
      let sum = 0;
      for (let i = 0; i < Math.min(inputDim, this.W_delta_t2.length); i++) {
        sum += (this.W_delta_t2[i]?.[j] ?? 0) * (input_t2[i] ?? 0);
      }
      delta_t2_logit[j] = sum;
    }
    this.lastDeltaLogit_t2 = delta_t2_logit;
    const delta_t2 = delta_t2_logit.map(l => Math.tanh(l) * SCALE);
    this.lastDelta_t2 = delta_t2;
    const predicted_t2 = predicted.map((p, i) => p + (delta_t2[i] || 0));
    this.lastPredicted_t2 = predicted_t2;

    // Uncertainty (JS — W_unc)
    const uncLogit = new Array(this.posDim).fill(0);
    for (let j = 0; j < this.posDim; j++) {
      let sum = 0;
      for (let i = 0; i < Math.min(inputDim, this.W_unc.length); i++) {
        sum += (this.W_unc[i]?.[j] ?? 0) * (input[i] ?? 0);
      }
      uncLogit[j] = sum;
    }
    this.lastUncLogit = uncLogit;
    const uncertainty = uncLogit.map(l => Math.log(1 + Math.exp(l)));
    this.lastUncertainty = uncertainty;

    return { predicted, uncertainty, predicted_t2, codebook_id };
  }

  private quantize(delta: number[]): { quantized: number[]; codebook_id: number } {
    let bestId = 0;
    let bestDist = Infinity;
    for (let i = 0; i < this.codebook.length; i++) {
      let dist = 0;
      for (let d = 0; d < this.posDim; d++) {
        dist += ((delta[d] || 0) - (this.codebook[i][d] || 0)) ** 2;
      }
      if (dist < bestDist) { bestDist = dist; bestId = i; }
    }
    return { quantized: [...this.codebook[bestId]], codebook_id: bestId };
  }

  // ═══════════════════════════════════════════
  // LOSS: VARIATIONAL FREE ENERGY
  // ═══════════════════════════════════════════

  private computeLoss(predicted: number[], actual: number[], reward: number): number {
    const beta = this.config?.get('predictor.beta_kl') ?? 0.1;

    let predError = 0;
    for (let i = 0; i < this.posDim; i++) {
      predError += ((actual[i] || 0) - (predicted[i] || 0)) ** 2;
    }
    predError /= this.posDim;

    let uncPenalty = 0;
    for (let i = 0; i < this.posDim; i++) {
      const unc = Math.max(0.01, this.lastUncertainty[i] || 0.5);
      const err_i = ((actual[i] || 0) - (predicted[i] || 0)) ** 2;
      uncPenalty += Math.log(unc) + err_i / unc;
    }
    uncPenalty /= this.posDim;

    const decorrelationWeight = this.config?.get('predictor.decorrelation_weight') ?? 0.1;
    let decorrelation = 0;
    for (let d1 = 0; d1 < this.posDim; d1++) {
      for (let d2 = d1 + 1; d2 < this.posDim; d2++) {
        decorrelation += ((this.lastDelta[d1] || 0) * (this.lastDelta[d2] || 0)) ** 2;
      }
    }

    const vqWeight = this.config?.get('predictor.vq_weight') ?? 0.1;
    let vqCommitment = 0;
    for (let d = 0; d < this.posDim; d++) {
      vqCommitment += ((this.lastDelta[d] || 0) - (this.codebook[this.lastCodebookId]?.[d] || 0)) ** 2;
    }

    return predError + beta * uncPenalty - reward * 0.1
      + decorrelationWeight * decorrelation / Math.max(1, this.posDim)
      + vqWeight * vqCommitment / this.posDim;
  }

  private computeLossAt(predicted: number[], actual: number[]): number {
    let err = 0;
    for (let i = 0; i < this.posDim; i++) {
      err += ((actual[i] || 0) - (predicted[i] || 0)) ** 2;
    }
    return err / this.posDim;
  }

  // ═══════════════════════════════════════════
  // BACKWARD PASS: graph edges + JS supplements
  // ═══════════════════════════════════════════

  private async backward(actual: number[], reward: number): Promise<void> {
    const inputDim = this.posDim + ACTION_EMBED_DIM;
    const beta = this.config?.get('predictor.beta_kl') ?? 0.1;

    // Compute prediction error direction for loss sign
    let predError = 0;
    for (let i = 0; i < this.posDim; i++) {
      const pred = (this.lastInput[i] || 0) + (this.lastDelta[i] || 0);
      predError += (pred - (actual[i] || 0)) ** 2;
    }
    const lossSign = predError > 0.01 ? 1.0 : -1.0;

    // Core delta weights: backward in graph (Rust)
    await this.db.execute(
      'RETURN fn::nn_backward($model, $lr, $loss_sign)',
      { model: 'predictor', lr: this.lr, loss_sign: lossSign },
    );

    // JS backward for uncertainty head (W_unc)
    for (let i = 0; i < Math.min(inputDim, this.W_unc.length); i++) {
      for (let j = 0; j < this.posDim; j++) {
        const unc = Math.max(0.01, this.lastUncertainty[j] || 0.5);
        const err_j = ((actual[j] || 0) - ((this.lastInput[j] || 0) + (this.lastDelta[j] || 0))) ** 2;
        const dPenalty_dUnc = (1 / unc - err_j / (unc * unc)) * beta / this.posDim;
        const sigmoid = 1 / (1 + Math.exp(-(this.lastUncLogit[j] || 0)));
        const grad = dPenalty_dUnc * sigmoid * (this.lastInput[i] || 0);
        this.W_unc[i][j] -= this.lr * this.clamp(grad);
      }
    }

    // JS backward for t+2 head (W_delta_t2)
    const actionVec = (this.lastActionIdx >= 0 && this.lastActionIdx < this.W_action.length)
      ? this.W_action[this.lastActionIdx] : new Array(ACTION_EMBED_DIM).fill(0);
    const quantized_t1 = this.codebook[this.lastCodebookId] || new Array(this.posDim).fill(0);
    const input_t2 = [
      ...Array.from({ length: this.posDim }, (_, i) => (this.lastInput[i] || 0) + (quantized_t1[i] || 0)),
      ...actionVec,
    ];
    const dDelta_t2_dLogit = this.lastDeltaLogit_t2.map(l => (1 - Math.tanh(l) ** 2) * SCALE);
    for (let i = 0; i < Math.min(inputDim, this.W_delta_t2.length); i++) {
      for (let j = 0; j < this.posDim; j++) {
        const dL_dpred = 2 * (((this.lastInput[j] || 0) + (this.lastDelta[j] || 0)) - (actual[j] || 0)) / this.posDim;
        const grad = dL_dpred * 0.5 * (dDelta_t2_dLogit[j] || 0) * (input_t2[i] || 0);
        this.W_delta_t2[i][j] -= this.lr * this.clamp(grad);
      }
    }

    // JS backward for action embedding (W_action)
    const actionIdx = this.lastActionIdx;
    if (actionIdx >= 0 && actionIdx < this.W_action.length) {
      for (let a = 0; a < ACTION_EMBED_DIM; a++) {
        let grad = 0;
        for (let j = 0; j < this.posDim; j++) {
          grad += lossSign * (this.lastInput[this.posDim + a] || 0) * 0.1;
        }
        this.W_action[actionIdx][a] -= this.lr * this.clamp(grad);
      }
    }
  }

  // ═══════════════════════════════════════════
  // WEIGHT MANAGEMENT
  // ═══════════════════════════════════════════

  private async loadOrInitWeights(): Promise<void> {
    const result = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM sensorimotor_weights ORDER BY step_count DESC LIMIT 1',
    );

    if (result.isOk() && result.value.length > 0) {
      const w = result.value[0];
      try {
        this.W_action = JSON.parse(w.W_action as string || '[]');
        this.W_unc = JSON.parse(w.W_uncertainty as string || '[]');
        this.W_delta_t2 = JSON.parse(w.W_delta_t2 as string || '[]');
        this.codebook = JSON.parse(w.codebook as string || '[]');
        this.actionIndex = new Map(Object.entries(JSON.parse(w.action_index as string || '{}')));
        this.lr = (w.learning_rate as number) || 0.01;
        this.stepCount = (w.step_count as number) || 0;

        const inputDim = this.posDim + ACTION_EMBED_DIM;
        if (!this.W_delta_t2 || this.W_delta_t2.length === 0) {
          this.W_delta_t2 = this.xavier(inputDim, this.posDim);
        }
        if (!this.codebook || this.codebook.length === 0) {
          this.codebookSize = this.config?.get('predictor.codebook_size') ?? 64;
          this.codebook = Array.from({ length: this.codebookSize }, () =>
            Array.from({ length: this.posDim }, () => (Math.random() - 0.5) * SCALE),
          );
        }

        this.logger.log(`Predictor weights loaded: step=${this.stepCount}, ${this.actionIndex.size} actions`);
        return;
      } catch { /* fall through to init */ }
    }

    this.initWeights();
  }

  private initWeights(): void {
    this.actionIndex = new Map();
    for (let i = 0; i < SensorimotorPredictorService.DEFAULT_ACTIONS.length; i++) {
      this.actionIndex.set(SensorimotorPredictorService.DEFAULT_ACTIONS[i], i);
    }

    const actionCount = SensorimotorPredictorService.DEFAULT_ACTIONS.length;
    const inputDim = this.posDim + ACTION_EMBED_DIM;

    this.W_action = this.xavier(actionCount, ACTION_EMBED_DIM);
    // W_delta now lives in graph (nn_edge) — no JS matrix needed
    this.W_unc = this.xavier(inputDim, this.posDim);
    this.W_delta_t2 = this.xavier(inputDim, this.posDim);
    this.lr = 0.01;
    this.stepCount = 0;

    this.codebookSize = this.config?.get('predictor.codebook_size') ?? 64;
    this.codebook = Array.from({ length: this.codebookSize }, () =>
      Array.from({ length: this.posDim }, () => (Math.random() - 0.5) * SCALE),
    );

    this.logger.log(`Predictor weights initialized: posDim=${this.posDim}, actions=${actionCount}, codebook=${this.codebookSize}`);
  }

  private async persistWeights(): Promise<void> {
    try {
      const actionObj: Record<string, number> = {};
      for (const [k, v] of this.actionIndex) actionObj[k] = v;

      await this.db.create('sensorimotor_weights', {
        W_action: JSON.stringify(this.W_action),
        W_uncertainty: JSON.stringify(this.W_unc),
        W_delta_t2: JSON.stringify(this.W_delta_t2),
        codebook: JSON.stringify(this.codebook),
        action_index: JSON.stringify(actionObj),
        learning_rate: this.lr,
        step_count: this.stepCount,
      } as Record<string, unknown>);
    } catch (e) {
      this.logger.warn(`Failed to persist predictor weights: ${e}`);
    }
  }

  updatePosDim(newDim: number): void {
    if (newDim <= this.posDim) return;

    const oldDim = this.posDim;
    this.posDim = Math.min(newDim, MAX_POS_DIM);
    const inputDim = this.posDim + ACTION_EMBED_DIM;

    // Expand JS weights (W_unc, W_delta_t2)
    for (const W of [this.W_unc, this.W_delta_t2]) {
      while (W.length < inputDim) {
        W.push(new Array(this.posDim).fill(0).map(() => (Math.random() - 0.5) * 0.1));
      }
      for (const row of W) {
        while (row.length < this.posDim) row.push((Math.random() - 0.5) * 0.1);
      }
    }

    for (const entry of this.codebook) {
      while (entry.length < this.posDim) entry.push((Math.random() - 0.5) * SCALE);
    }

    if (oldDim !== this.posDim) {
      this.logger.log(`Predictor expanded: ${oldDim}D → ${this.posDim}D`);
    }
  }

  // ═══════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════

  private ensureAction(action: string): void {
    if (!this.actionIndex.has(action)) {
      const idx = this.actionIndex.size;
      this.actionIndex.set(action, idx);
      this.W_action.push(new Array(ACTION_EMBED_DIM).fill(0).map(() => (Math.random() - 0.5) * 0.3));
    }
    this.lastActionIdx = this.actionIndex.get(action) || 0;
  }

  private padPosition(pos: number[]): number[] {
    const padded = new Array(this.posDim).fill(0);
    for (let i = 0; i < Math.min(pos.length, this.posDim); i++) {
      padded[i] = pos[i] || 0;
    }
    return padded;
  }

  private xavier(fanIn: number, fanOut: number): number[][] {
    const scale = Math.sqrt(2 / (fanIn + fanOut));
    return Array.from({ length: fanIn }, () =>
      Array.from({ length: fanOut }, () => (Math.random() * 2 - 1) * scale),
    );
  }

  private clamp(grad: number): number {
    return Math.max(-1, Math.min(1, grad));
  }

  getStepCount(): number { return this.stepCount; }
}
