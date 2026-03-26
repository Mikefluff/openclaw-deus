import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../../common/types/result.types';
import { SurrealService } from '../../database/surreal.service';
import { Trace, TraceRelation, Signal } from '../kernel.types';

/**
 * TraceGraph: Unified memory substrate with spreading activation.
 *
 * Every belief, knowledge, episode, signal, commit becomes a trace.
 * Traces are connected by weighted edges. When one trace activates,
 * activation SPREADS to neighbors (and inhibition to opponents).
 * This IS associative memory.
 */

// Spreading activation parameters
const ACTIVATION_BOOST = 0.15;
const SPREAD_FACTOR = 0.3;
const INHIBITION_FACTOR = 0.2;
const FRESHNESS_DECAY = 0.02;         // per cycle
const ARCHIVE_THRESHOLD = 0.01;       // weight * freshness < this → archive
const EMOTIONAL_DECAY_MODIFIER = 0.5; // emotional traces decay 50% slower

@Injectable()
export class TraceGraphService {
  private readonly logger = new Logger(TraceGraphService.name);
  private cycle = 0;
  private traceIdCounter = 0;

  constructor(private readonly db: SurrealService) {}

  getCycle(): number { return this.cycle; }

  /**
   * Create a new trace from any cognitive event.
   */
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

  /**
   * Ingest signals from agents → create/reactivate traces → run spreading activation.
   * Returns the trace IDs that were activated (for convergence detection).
   */
  async ingestSignals(signals: Signal[]): Promise<Result<string[], DomainError>> {
    const activatedTraces: string[] = [];

    for (const signal of signals) {
      // Find existing trace by content similarity or create new
      const existing = await this.findTraceByContent(signal.content);

      if (existing) {
        // Reactivate existing trace
        await this.reactivate(existing.trace_id, signal.confidence, signal.novelty_cost);
        activatedTraces.push(existing.trace_id);
      } else {
        // Create new trace from signal
        const result = await this.createTrace({
          source_type: 'signal',
          content: signal.content,
          initial_weight: signal.confidence * 0.8,
          confidence: signal.confidence,
          emotional_charge: signal.type === 'affect' ? (signal.payload.charge as number ?? 0) : 0,
        });
        if (result.isOk()) {
          activatedTraces.push(result.value.trace_id);

          // Link to target traces if specified
          for (const target of signal.targets) {
            await this.link(result.value.trace_id, target, 'activates', signal.confidence * 0.5);
          }
        }
      }
    }

    // Run spreading activation from all newly activated traces
    for (const traceId of activatedTraces) {
      await this.spreadActivation(traceId);
    }

    return ok(activatedTraces);
  }

  /**
   * Reactivate an existing trace: boost weight, update history.
   */
  async reactivate(traceId: string, confidence: number, novelty = 0): Promise<void> {
    const trace = await this.findById(traceId);
    if (!trace) return;

    const newWeight = Math.min(1, trace.weight + ACTIVATION_BOOST * (1 - trace.weight));
    const history = [...(trace.reactivation_history || []), this.cycle].slice(-50);

    await this.db.execute(
      `UPDATE trace SET
        weight = $weight,
        freshness = 1.0,
        confidence = math::max([$conf, confidence]),
        reactivation_count = reactivation_count + 1,
        last_reactivated_cycle = $cycle,
        reactivation_history = $history,
        suppressed = false
      WHERE trace_id = $tid`,
      { weight: newWeight, conf: confidence, cycle: this.cycle, history, tid: traceId },
    );
  }

  /**
   * Spreading activation: when a trace fires, neighbors fire too.
   * Positive edges → activation spreads. Negative edges → inhibition.
   */
  async spreadActivation(sourceTraceId: string, depth = 0): Promise<void> {
    if (depth > 3) return; // prevent infinite recursion

    const source = await this.findById(sourceTraceId);
    if (!source || source.weight < 0.1) return;

    // Get outgoing edges
    const edges = await this.db.query<{ out_trace: string; relation: string; weight: number }>(
      `SELECT out.trace_id AS out_trace, relation, weight
       FROM activates, inhibits
       WHERE in.trace_id = $tid`,
      { tid: sourceTraceId },
    );

    if (edges.isErr()) return;

    for (const edge of edges.value) {
      const neighbor = await this.findById(edge.out_trace);
      if (!neighbor || neighbor.archived) continue;

      if (edge.relation === 'activates') {
        const boost = edge.weight * SPREAD_FACTOR * source.weight;
        if (boost > 0.01) {
          const newWeight = Math.min(1, neighbor.weight + boost);
          await this.db.execute(
            `UPDATE trace SET weight = $w, last_reactivated_cycle = $c WHERE trace_id = $tid`,
            { w: newWeight, c: this.cycle, tid: edge.out_trace },
          );
          // Recurse (diminishing)
          if (boost > 0.05) {
            await this.spreadActivation(edge.out_trace, depth + 1);
          }
        }
      } else if (edge.relation === 'inhibits') {
        const suppression = edge.weight * INHIBITION_FACTOR * source.weight;
        const newWeight = Math.max(0, neighbor.weight - suppression);
        await this.db.execute(
          `UPDATE trace SET weight = $w, suppressed = $sup WHERE trace_id = $tid`,
          { w: newWeight, sup: newWeight < 0.05, tid: edge.out_trace },
        );
      }
    }
  }

  /**
   * Create a relation between traces.
   */
  async link(fromTraceId: string, toTraceId: string, relation: TraceRelation, weight: number): Promise<void> {
    await this.db.execute(
      `RELATE (SELECT id FROM trace WHERE trace_id = $from LIMIT 1)
        -> ${relation}
        -> (SELECT id FROM trace WHERE trace_id = $to LIMIT 1)
        SET weight = $w`,
      { from: fromTraceId, to: toTraceId, w: weight },
    );
  }

  /**
   * Forgetting: decay ALL traces. Called every cycle.
   * Emotional traces decay slower. Frequently reactivated traces decay slower.
   */
  async forget(): Promise<Result<{ decayed: number; archived: number }, DomainError>> {
    // Decay freshness (emotional charge slows decay, reactivation count slows decay)
    const decayResult = await this.db.execute(
      `UPDATE trace SET
        freshness = freshness * (1.0 - $base_decay / math::max([1.0, math::log2(1.0 + reactivation_count)]) * IF emotional_charge != 0 THEN $emo_mod ELSE 1.0 END)
      WHERE NOT archived AND NOT suppressed`,
      { base_decay: FRESHNESS_DECAY, emo_mod: EMOTIONAL_DECAY_MODIFIER },
    );

    // Archive traces below threshold
    const archiveResult = await this.db.execute(
      `UPDATE trace SET archived = true
       WHERE NOT archived AND weight * freshness < $threshold`,
      { threshold: ARCHIVE_THRESHOLD },
    );

    const decayed = decayResult.isOk() ? 1 : 0; // approximate
    const archived = archiveResult.isOk() ? 1 : 0;

    return ok({ decayed, archived });
  }

  /**
   * Advance cognitive cycle counter.
   */
  tick(): number {
    return ++this.cycle;
  }

  /**
   * Find convergent trace clusters: traces activated by multiple agent sources.
   * Returns clusters that have enough convergence for a commit.
   */
  async findConvergentClusters(recentSignals: Signal[], convergenceThreshold = 0.5): Promise<Array<{
    traces: string[];
    agents: string[];
    convergence: number;
    avg_urgency: number;
  }>> {
    // Group signals by the traces they target or create
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

    // Also check for traces recently activated in this cycle
    const recentTraces = await this.db.query<Trace>(
      `SELECT * FROM trace WHERE last_reactivated_cycle = $cycle AND NOT archived`,
      { cycle: this.cycle },
    );

    const clusters: Array<{ traces: string[]; agents: string[]; convergence: number; avg_urgency: number }> = [];

    for (const [traceId, agents] of traceAgentMap.entries()) {
      const convergence = agents.size / 5; // normalized by total agent count
      if (convergence >= convergenceThreshold || Math.max(...(traceUrgencyMap.get(traceId) || [0])) > 0.9) {
        const urgencies = traceUrgencyMap.get(traceId) || [];
        clusters.push({
          traces: [traceId],
          agents: Array.from(agents),
          convergence,
          avg_urgency: urgencies.reduce((s, u) => s + u, 0) / Math.max(1, urgencies.length),
        });
      }
    }

    return clusters.sort((a, b) => b.convergence - a.convergence);
  }

  /**
   * Get active traces (for time-sense, narrative).
   */
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

  // --- Internal ---

  private async findById(traceId: string): Promise<Trace | null> {
    const r = await this.db.query<Trace>('SELECT * FROM trace WHERE trace_id = $tid LIMIT 1', { tid: traceId });
    return r.isOk() && r.value.length > 0 ? r.value[0] : null;
  }

  private async findTraceByContent(content: string): Promise<Trace | null> {
    // Simple: exact match on first 100 chars. TODO: embedding similarity
    const short = content.slice(0, 100);
    const r = await this.db.query<Trace>(
      `SELECT * FROM trace WHERE string::starts_with(content, $prefix) AND NOT archived LIMIT 1`,
      { prefix: short },
    );
    return r.isOk() && r.value.length > 0 ? r.value[0] : null;
  }
}
