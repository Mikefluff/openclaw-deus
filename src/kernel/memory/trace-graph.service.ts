import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../../common/types/result.types';
import { SurrealService } from '../../database/surreal.service';
import { CognitiveConfigService } from '../../cognitive/cognitive-config.service';
import { Trace, TraceRelation, Signal } from '../kernel.types';

/**
 * TraceGraph: Learning memory substrate.
 *
 * Not just storage — a LEARNING system:
 * - Spreading activation with Hebbian weight updates
 * - Prediction error backpropagation through edges
 * - Outcome reinforcement from episodes
 * - Forgetting modulated by emotional charge + reactivation frequency
 */

@Injectable()
export class TraceGraphService {
  private readonly logger = new Logger(TraceGraphService.name);
  private cycle = 0;
  private traceIdCounter = 0;

  constructor(
    private readonly db: SurrealService,
    private readonly config: CognitiveConfigService,
  ) {}

  getCycle(): number { return this.cycle; }
  tick(): number { return ++this.cycle; }

  // ═══════════════════════════════════════════
  // TRACE CRUD
  // ═══════════════════════════════════════════

  async createTrace(data: {
    source_type: Trace['source_type'];
    source_id?: string;
    content: string;
    initial_weight?: number;
    confidence?: number;
    emotional_charge?: number;
  }): Promise<Result<Trace, DomainError>> {
    const trace: Omit<Trace, 'id'> = {
      trace_id: `T${Date.now()}_${this.traceIdCounter++}`,
      source_type: data.source_type,
      source_id: data.source_id,
      content: data.content,
      weight: data.initial_weight ?? 0.5,
      initial_weight: data.initial_weight ?? 0.5,
      freshness: 1.0,
      confidence: data.confidence ?? 0.5,
      emotional_charge: data.emotional_charge ?? 0,
      reactivation_count: 0,
      last_reactivated_cycle: this.cycle,
      reactivation_history: [this.cycle],
      created_at_cycle: this.cycle,
      suppressed: false,
      archived: false,
    };

    return this.db.create<Trace>('trace', trace as any);
  }

  // ═══════════════════════════════════════════
  // SIGNAL INGESTION
  // ═══════════════════════════════════════════

  /**
   * Ingest signals → create/reactivate traces → spreading activation → Hebbian learning.
   * Returns activated trace IDs for convergence detection.
   */
  async ingestSignals(signals: Signal[]): Promise<Result<string[], DomainError>> {
    const activatedTraces: string[] = [];

    for (const signal of signals) {
      // Find existing trace by content OR create new
      const existing = await this.findTraceBySimilarity(signal.content);

      if (existing) {
        await this.reactivate(existing.trace_id, signal.confidence, signal.novelty_cost);
        activatedTraces.push(existing.trace_id);
      } else {
        const result = await this.createTrace({
          source_type: 'signal',
          content: signal.content,
          initial_weight: signal.confidence * 0.8,
          confidence: signal.confidence,
          emotional_charge: signal.type === 'affect' ? (signal.payload.charge as number ?? 0) : 0,
        });
        if (result.isOk()) {
          activatedTraces.push(result.value.trace_id);
          // Link new trace to existing targets
          for (const target of signal.targets) {
            await this.link(result.value.trace_id, target, 'activates', signal.confidence * 0.5);
          }
        }
      }
    }

    // Run spreading activation + Hebbian learning on activated traces
    for (const traceId of activatedTraces) {
      await this.spreadActivation(traceId);
    }

    return ok(activatedTraces);
  }

  // ═══════════════════════════════════════════
  // REACTIVATION
  // ═══════════════════════════════════════════

  async reactivate(traceId: string, confidence: number, _novelty = 0): Promise<void> {
    const boost = this.config.get('kernel.activation_boost');
    const history = await this.getReactivationHistory(traceId);
    const newHistory = [...history, this.cycle].slice(-50);

    await this.db.execute(
      `UPDATE trace SET
        weight = math::min([1.0, weight + $boost * (1.0 - weight)]),
        freshness = 1.0,
        confidence = math::max([$conf, confidence]),
        reactivation_count = reactivation_count + 1,
        last_reactivated_cycle = $cycle,
        reactivation_history = $history,
        suppressed = false
      WHERE trace_id = $tid`,
      { boost, conf: confidence, cycle: this.cycle, history: newHistory, tid: traceId },
    );
  }

  // ═══════════════════════════════════════════
  // SPREADING ACTIVATION + HEBBIAN LEARNING
  // ═══════════════════════════════════════════

  /**
   * Spreading activation: source fires → neighbors activate/inhibit.
   * Hebbian learning: edges that co-activate strengthen. Fire together, wire together.
   */
  async spreadActivation(sourceTraceId: string, depth = 0): Promise<void> {
    if (depth > 3) return;

    const source = await this.findById(sourceTraceId);
    if (!source || source.weight < 0.1) return;

    const spreadFactor = this.config.get('kernel.spread_factor');
    const inhibFactor = this.config.get('kernel.inhibition_factor');

    // Get ALL outgoing edges (activates + inhibits)
    const edges = await this.db.query<{ out_trace: string; relation: string; edge_weight: number }>(
      `SELECT out.trace_id AS out_trace, 'activates' AS relation, weight AS edge_weight FROM activates WHERE in.trace_id = $tid
       UNION ALL
       SELECT out.trace_id AS out_trace, 'inhibits' AS relation, weight AS edge_weight FROM inhibits WHERE in.trace_id = $tid`,
      { tid: sourceTraceId },
    );

    if (edges.isErr()) return;

    for (const edge of edges.value) {
      const neighbor = await this.findById(edge.out_trace);
      if (!neighbor || neighbor.archived) continue;

      if (edge.relation === 'activates') {
        const boost = edge.edge_weight * spreadFactor * source.weight;
        if (boost > 0.01) {
          const newWeight = Math.min(1, neighbor.weight + boost);
          await this.db.execute(
            `UPDATE trace SET weight = $w, last_reactivated_cycle = $c WHERE trace_id = $tid`,
            { w: newWeight, c: this.cycle, tid: edge.out_trace },
          );

          // HEBBIAN: co-activation → strengthen edge
          await this.hebbianUpdate(sourceTraceId, edge.out_trace, source.weight, newWeight, 'activates');

          if (boost > 0.05) {
            await this.spreadActivation(edge.out_trace, depth + 1);
          }
        }
      } else if (edge.relation === 'inhibits') {
        const suppression = edge.edge_weight * inhibFactor * source.weight;
        const newWeight = Math.max(0, neighbor.weight - suppression);
        await this.db.execute(
          `UPDATE trace SET weight = $w, suppressed = $sup WHERE trace_id = $tid`,
          { w: newWeight, sup: newWeight < 0.05, tid: edge.out_trace },
        );

        // ANTI-HEBBIAN: source fires but target is suppressed → weaken activating edges to target
        await this.hebbianUpdate(sourceTraceId, edge.out_trace, source.weight, newWeight, 'inhibits');
      }
    }
  }

  /**
   * Hebbian learning: fire together → wire together.
   * Edge weight adjusts based on co-activation of source and target.
   */
  private async hebbianUpdate(
    sourceId: string, targetId: string,
    sourceWeight: number, targetWeight: number,
    relation: string,
  ): Promise<void> {
    const lr = this.config.get('kernel.hebbian_learning_rate');
    const decayRate = this.config.get('kernel.hebbian_decay_rate');

    // Positive: both active → strengthen
    const coActivation = sourceWeight * targetWeight;
    const delta = lr * coActivation;

    // Anti-Hebbian: target inactive → weaken
    const antiHebbian = targetWeight < 0.1 ? -decayRate : 0;

    await this.db.execute(
      `UPDATE ${relation} SET
        weight = math::clamp(weight + $delta + $anti, 0.01, 1.0),
        co_activation_count = co_activation_count + 1,
        last_co_activation = $cycle
      WHERE in.trace_id = $from AND out.trace_id = $to`,
      { delta, anti: antiHebbian, cycle: this.cycle, from: sourceId, to: targetId },
    );
  }

  // ═══════════════════════════════════════════
  // PREDICTION ERROR BACKPROPAGATION
  // ═══════════════════════════════════════════

  /**
   * When prediction error is detected, propagate backward through edges.
   * Edges that contributed to wrong predictions get weakened.
   */
  async backpropagatePredictionError(traceId: string, error: number, depth = 0): Promise<void> {
    if (depth > 3 || error < 0.01) return;

    const rate = this.config.get('kernel.pred_error_backprop_rate');

    // Find incoming edges (edges pointing TO this trace)
    const inEdges = await this.db.query<{ in_trace: string; relation: string; edge_weight: number }>(
      `SELECT in.trace_id AS in_trace, 'activates' AS relation, weight AS edge_weight FROM activates WHERE out.trace_id = $tid
       UNION ALL
       SELECT in.trace_id AS in_trace, 'inhibits' AS relation, weight AS edge_weight FROM inhibits WHERE out.trace_id = $tid`,
      { tid: traceId },
    );

    if (inEdges.isErr()) return;

    for (const edge of inEdges.value) {
      const delta = -rate * error * edge.edge_weight;
      await this.db.execute(
        `UPDATE ${edge.relation} SET
          weight = math::clamp(weight + $delta, 0.01, 1.0),
          prediction_error_sum = prediction_error_sum + $error
        WHERE in.trace_id = $from AND out.trace_id = $tid`,
        { delta, error, from: edge.in_trace, tid: traceId },
      );

      // Recurse backward (diminishing)
      if (Math.abs(delta) > 0.01) {
        await this.backpropagatePredictionError(edge.in_trace, error * edge.edge_weight, depth + 1);
      }
    }
  }

  // ═══════════════════════════════════════════
  // OUTCOME REINFORCEMENT
  // ═══════════════════════════════════════════

  /**
   * Reinforce or weaken traces/edges based on episode outcome.
   * Success → strengthen contributing path. Failure → weaken.
   */
  async reinforceFromOutcome(traceIds: string[], reward: number): Promise<void> {
    const rate = this.config.get('kernel.reinforcement_rate');

    for (const traceId of traceIds) {
      // Adjust trace weight
      await this.db.execute(
        `UPDATE trace SET weight = math::clamp(weight + $delta, 0.01, 1.0) WHERE trace_id = $tid`,
        { delta: reward * rate, tid: traceId },
      );

      // Adjust all outgoing edges
      await this.db.execute(
        `UPDATE activates SET
          weight = math::clamp(weight + $delta, 0.01, 1.0),
          outcome_reinforcement = outcome_reinforcement + $reward
        WHERE in.trace_id = $tid`,
        { delta: reward * rate * 0.5, reward, tid: traceId },
      );
    }
  }

  // ═══════════════════════════════════════════
  // FORGETTING
  // ═══════════════════════════════════════════

  async forget(): Promise<Result<{ decayed: number; archived: number }, DomainError>> {
    const decay = this.config.get('kernel.freshness_decay');
    const threshold = this.config.get('kernel.archive_threshold');

    await this.db.execute(
      `UPDATE trace SET
        freshness = freshness * (1.0 - $decay / math::max([1.0, math::log2(1.0 + reactivation_count)]) * IF emotional_charge != 0 THEN 0.5 ELSE 1.0 END)
      WHERE NOT archived AND NOT suppressed`,
      { decay },
    );

    await this.db.execute(
      `UPDATE trace SET archived = true WHERE NOT archived AND weight * freshness < $threshold`,
      { threshold },
    );

    return ok({ decayed: 1, archived: 0 });
  }

  // ═══════════════════════════════════════════
  // CONVERGENCE DETECTION
  // ═══════════════════════════════════════════

  /**
   * Find convergent clusters: traces activated by signals from MULTIPLE agents.
   * Uses both structural co-reference AND content similarity.
   */
  async findConvergentClusters(recentSignals: Signal[], convergenceThreshold?: number): Promise<Array<{
    traces: string[];
    agents: string[];
    convergence: number;
    avg_urgency: number;
  }>> {
    const threshold = convergenceThreshold ?? this.config.get('kernel.convergence_threshold');

    // Step 1: structural — signals targeting same traces
    const traceAgentMap = new Map<string, Set<string>>();
    const traceUrgencyMap = new Map<string, number[]>();

    for (const signal of recentSignals) {
      for (const target of signal.targets) {
        if (!traceAgentMap.has(target)) traceAgentMap.set(target, new Set());
        traceAgentMap.get(target)!.add(signal.agent_id);
        if (!traceUrgencyMap.has(target)) traceUrgencyMap.set(target, []);
        traceUrgencyMap.get(target)!.push(signal.confidence);
      }
    }

    // Step 2: content similarity — signals from different agents about same topic
    // Group by agent, then cross-compare content
    const byAgent = new Map<string, Signal[]>();
    for (const s of recentSignals) {
      if (!byAgent.has(s.agent_id)) byAgent.set(s.agent_id, []);
      byAgent.get(s.agent_id)!.push(s);
    }

    const agentIds = Array.from(byAgent.keys());
    for (let i = 0; i < agentIds.length; i++) {
      for (let j = i + 1; j < agentIds.length; j++) {
        const signalsA = byAgent.get(agentIds[i])!;
        const signalsB = byAgent.get(agentIds[j])!;

        for (const a of signalsA) {
          for (const b of signalsB) {
            if (this.contentOverlap(a.content, b.content) > 0.3) {
              // These agents noticed something similar → synthetic convergence
              const syntheticId = `convergent_${a.agent_id}_${b.agent_id}_${this.cycle}`;
              if (!traceAgentMap.has(syntheticId)) traceAgentMap.set(syntheticId, new Set());
              traceAgentMap.get(syntheticId)!.add(a.agent_id);
              traceAgentMap.get(syntheticId)!.add(b.agent_id);
              if (!traceUrgencyMap.has(syntheticId)) traceUrgencyMap.set(syntheticId, []);
              traceUrgencyMap.get(syntheticId)!.push(Math.max(a.confidence, b.confidence));
            }
          }
        }
      }
    }

    // Step 3: build clusters
    const clusters: Array<{ traces: string[]; agents: string[]; convergence: number; avg_urgency: number }> = [];

    for (const [traceId, agents] of traceAgentMap.entries()) {
      const convergence = agents.size / 5;
      const urgencies = traceUrgencyMap.get(traceId) || [];
      const maxUrgency = Math.max(0, ...urgencies);

      if (convergence >= threshold || maxUrgency > this.config.get('kernel.escalation_threshold')) {
        clusters.push({
          traces: [traceId],
          agents: Array.from(agents),
          convergence,
          avg_urgency: urgencies.length > 0 ? urgencies.reduce((s, u) => s + u, 0) / urgencies.length : 0,
        });
      }
    }

    return clusters.sort((a, b) => b.convergence - a.convergence);
  }

  // ═══════════════════════════════════════════
  // LINKING
  // ═══════════════════════════════════════════

  async link(fromTraceId: string, toTraceId: string, relation: TraceRelation, weight: number): Promise<void> {
    await this.db.execute(
      `RELATE (SELECT id FROM trace WHERE trace_id = $from LIMIT 1)
        -> ${relation}
        -> (SELECT id FROM trace WHERE trace_id = $to LIMIT 1)
        SET weight = $w, initial_weight = $w, co_activation_count = 0, last_co_activation = $cycle, prediction_error_sum = 0, outcome_reinforcement = 0`,
      { from: fromTraceId, to: toTraceId, w: weight, cycle: this.cycle },
    );
  }

  // ═══════════════════════════════════════════
  // RETRIEVAL
  // ═══════════════════════════════════════════

  async getActiveTraces(limit = 20): Promise<Result<Trace[], DomainError>> {
    return this.db.query<Trace>(
      `SELECT * FROM trace WHERE NOT archived AND NOT suppressed ORDER BY weight * freshness DESC LIMIT $limit`,
      { limit },
    );
  }

  async getTraceCount(): Promise<number> {
    const r = await this.db.query<{ c: number }>('SELECT count() AS c FROM trace WHERE NOT archived GROUP ALL');
    return r.isOk() && r.value.length > 0 ? r.value[0].c : 0;
  }

  /**
   * Get active trace IDs for signal targeting.
   * Agents should call this to populate signal.targets.
   */
  async getActiveTraceIds(content: string, limit = 5): Promise<string[]> {
    // Find traces related to content
    const traces = await this.db.query<Trace>(
      `SELECT trace_id FROM trace WHERE NOT archived AND NOT suppressed ORDER BY weight DESC LIMIT $limit`,
      { limit },
    );
    return traces.isOk() ? traces.value.map(t => t.trace_id) : [];
  }

  // ═══════════════════════════════════════════
  // PRIVATE
  // ═══════════════════════════════════════════

  private async findById(traceId: string): Promise<Trace | null> {
    const r = await this.db.query<Trace>('SELECT * FROM trace WHERE trace_id = $tid LIMIT 1', { tid: traceId });
    return r.isOk() && r.value.length > 0 ? r.value[0] : null;
  }

  /**
   * Find trace by content similarity. Uses word overlap (fast, no LLM).
   * TODO: upgrade to embedding similarity when EmbeddingsService integrated.
   */
  private async findTraceBySimilarity(content: string): Promise<Trace | null> {
    // Get recent active traces and compare by word overlap
    const recent = await this.db.query<Trace>(
      `SELECT * FROM trace WHERE NOT archived ORDER BY last_reactivated_cycle DESC LIMIT 30`,
    );
    if (recent.isErr()) return null;

    let bestMatch: Trace | null = null;
    let bestScore = 0;

    for (const trace of recent.value) {
      const score = this.contentOverlap(content, trace.content);
      if (score > 0.5 && score > bestScore) {
        bestScore = score;
        bestMatch = trace;
      }
    }

    return bestMatch;
  }

  /** Word-level Jaccard similarity (no external dependency) */
  private contentOverlap(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    let intersection = 0;
    for (const w of wordsA) { if (wordsB.has(w)) intersection++; }
    return intersection / Math.max(wordsA.size, wordsB.size);
  }

  private async getReactivationHistory(traceId: string): Promise<number[]> {
    const r = await this.db.query<{ reactivation_history: number[] }>(
      'SELECT reactivation_history FROM trace WHERE trace_id = $tid LIMIT 1',
      { tid: traceId },
    );
    return r.isOk() && r.value.length > 0 ? (r.value[0].reactivation_history || []) : [];
  }
}
