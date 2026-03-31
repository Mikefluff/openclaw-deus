import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../../common/types/result.types';
import { SurrealService } from '../../database/surreal.service';
import { CognitiveConfigService } from '../../cognitive/cognitive-config.service';
import { Trace, Signal } from '../kernel.types';

/**
 * TraceGraph: Thin wrapper over SurrealDB.
 *
 * All heavy logic (spreading, Hebbian, forgetting, decay) lives in stored procs.
 * This service only handles:
 * - Trace CRUD (queue + batch flush)
 * - DB proc gateway (executeProc)
 * - Cycle counter
 *
 * NO circular deps. NO LightCone. NO ConceptSpace injection.
 * Position projection done via fn:: stored proc in SurrealDB.
 */

@Injectable()
export class TraceGraphService {
  private readonly logger = new Logger(TraceGraphService.name);
  private cycle = 0;
  private traceIdCounter = 0;

  // In-memory queues for batch flush (replaces LightCone hot memory)
  private pendingCreates: Array<Record<string, unknown>> = [];
  private pendingLinks: Array<{ from: string; to: string; relation: string; weight: number }> = [];
  private pendingReactivations = new Map<string, { weight: number; freshness: number; confidence: number }>();

  // Per-cycle caches
  private activeTracesCache: { cycle: number; traces: Trace[] } | null = null;
  private traceCountCache: { cycle: number; count: number } | null = null;

  constructor(
    private readonly db: SurrealService,
    private readonly config: CognitiveConfigService,
  ) {}

  /** Execute a stored procedure on the DB. */
  async executeProc(sql: string, vars?: Record<string, unknown>): Promise<{ isOk(): boolean; value?: unknown }> {
    return this.db.execute(sql, vars) as any;
  }

  getCycle(): number { return this.cycle; }
  tick(): number {
    this.activeTracesCache = null;
    this.traceCountCache = null;
    return ++this.cycle;
  }

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
    const weight = data.initial_weight ?? 0.5;

    const trace: Omit<Trace, 'id'> = {
      trace_id: `T${Date.now()}_${this.traceIdCounter++}`,
      source_type: data.source_type,
      source_id: data.source_id,
      content: data.content,
      weight,
      initial_weight: weight,
      freshness: 1.0,
      confidence: data.confidence ?? 0.5,
      emotional_charge: data.emotional_charge ?? 0,
      reactivation_count: 0,
      last_reactivated_cycle: this.cycle,
      reactivation_history: [this.cycle],
      created_at_cycle: this.cycle,
      position: [], // Position assigned by SurrealDB on flush
      velocity: [],
      suppressed: false,
      archived: false,
    };

    // Queue for batch DB write
    this.pendingCreates.push(trace as unknown as Record<string, unknown>);
    return ok(trace as Trace);
  }

  // ═══════════════════════════════════════════
  // SIGNAL INGESTION
  // ═══════════════════════════════════════════

  async ingestSignals(signals: Signal[]): Promise<Result<Trace[], DomainError>> {
    const traces: Trace[] = [];
    for (const signal of signals.slice(0, 3)) {
      const result = await this.createTrace({
        source_type: 'event',
        source_id: signal.agent_id,
        content: signal.content,
        initial_weight: signal.confidence * 0.5 + 0.3,
        confidence: signal.confidence,
        emotional_charge: signal.novelty_cost > 0.5 ? signal.novelty_cost * 0.3 : 0,
      });
      if (result.isOk()) traces.push(result.value);
    }
    return ok(traces);
  }

  // ═══════════════════════════════════════════
  // REACTIVATION
  // ═══════════════════════════════════════════

  async reactivate(traceId: string, confidence: number): Promise<void> {
    const weight = Math.min(1, 0.3 + confidence * 0.5);
    this.pendingReactivations.set(traceId, { weight, freshness: 1.0, confidence: Math.min(1, confidence) });
  }

  // ═══════════════════════════════════════════
  // LINKING
  // ═══════════════════════════════════════════

  async link(fromTraceId: string, toTraceId: string, relation: string = 'activates', weight = 0.5): Promise<void> {
    this.pendingLinks.push({ from: fromTraceId, to: toTraceId, relation, weight });
  }

  // ═══════════════════════════════════════════
  // SPREADING ACTIVATION (stored proc)
  // ═══════════════════════════════════════════

  async spreadActivation(sourceTraceId: string, depth = 0): Promise<void> {
    if (depth > 3) return;
    await this.db.execute(
      `fn::spread_activation($tid, $spread, $inhibit, $hebb_lr, $hebb_decay, $cycle)`,
      {
        tid: sourceTraceId,
        spread: this.config?.get('kernel.spread_factor') ?? 0.15,
        inhibit: this.config?.get('kernel.inhibition_factor') ?? 0.1,
        hebb_lr: this.config?.get('kernel.hebbian_learning_rate') ?? 0.01,
        hebb_decay: this.config?.get('kernel.hebbian_decay_rate') ?? 0.001,
        cycle: this.cycle,
      },
    );
  }

  // ═══════════════════════════════════════════
  // PREDICTION ERROR BACKPROPAGATION (stored proc)
  // ═══════════════════════════════════════════

  async backpropagatePredictionError(traceId: string, error: number): Promise<void> {
    await this.db.execute(
      `fn::backprop_pred_error($tid, $error, $rate)`,
      {
        tid: traceId,
        error,
        rate: this.config?.get('kernel.backprop_rate') ?? 0.05,
      },
    );
  }

  // ═══════════════════════════════════════════
  // FORGETTING (stored proc)
  // ═══════════════════════════════════════════

  async forget(): Promise<Result<{ decayed: number; archived: number }, DomainError>> {
    const result = await this.db.execute(
      `RETURN fn::forget_traces($decay, $threshold)`,
      {
        decay: this.config?.get('kernel.base_decay_rate') ?? 0.02,
        threshold: this.config?.get('kernel.archive_threshold') ?? 0.03,
      },
    );
    return ok({ decayed: 0, archived: (result as any)?.value?.[0]?.archived ?? 0 });
  }

  // ═══════════════════════════════════════════
  // BATCH FLUSH TO DB
  // ═══════════════════════════════════════════

  async flushToDb(): Promise<{ created: number; reactivated: number; linked: number }> {
    const creates = this.pendingCreates.splice(0);
    const reactivations = new Map(this.pendingReactivations);
    this.pendingReactivations.clear();
    const links = this.pendingLinks.splice(0);

    // Batch create traces
    for (const trace of creates) {
      await this.db.create('trace', trace);
    }

    // Batch reactivation
    if (reactivations.size > 0) {
      const traceIds = Array.from(reactivations.keys());
      const firstData = reactivations.values().next().value;
      await this.db.execute(
        `UPDATE trace SET weight = math::clamp($w, 0, 1), freshness = 1.0, reactivation_count += 1, last_reactivated_cycle = $cycle WHERE trace_id IN $ids`,
        { w: firstData?.weight ?? 0.5, cycle: this.cycle, ids: traceIds },
      );
    }

    // Batch links
    if (links.length > 0) {
      const activateLinks = links.filter(l => l.relation === 'activates');
      if (activateLinks.length > 0) {
        await this.db.execute(
          `RETURN fn::batch_create_links($links)`,
          { links: activateLinks.map(l => ({ from: l.from, to: l.to, weight: l.weight })) },
        );
      }
    }

    return { created: creates.length, reactivated: reactivations.size, linked: links.length };
  }

  async flushBatchWrites(writes: Array<{ sql?: string; vars?: Record<string, unknown> }>): Promise<void> {
    for (const w of writes) {
      if (w.sql) await this.db.execute(w.sql, w.vars);
    }
  }

  async flushBatchEdgeUpdates(edgeUpdates: Array<{ from: string; to: string; deltaWeight: number }>): Promise<void> {
    if (edgeUpdates.length === 0) return;
    await this.db.execute(
      'RETURN fn::batch_update_edges($updates)',
      { updates: edgeUpdates.map(eu => ({ from: eu.from, to: eu.to, delta_weight: eu.deltaWeight })) },
    );
  }

  // ═══════════════════════════════════════════
  // EPISODIC EDGES
  // ═══════════════════════════════════════════

  recordEpisodicEdge(from: string, to: string, action: string, cycle: number): void {
    this.pendingLinks.push({ from, to, relation: 'episodic', weight: 0.5 });
  }

  async consolidateEpisodicEdges(): Promise<void> {
    await this.db.execute('RETURN fn::consolidate_episodic($min)', { min: 3 });
  }

  // ═══════════════════════════════════════════
  // QUERIES
  // ═══════════════════════════════════════════

  async getActiveTraces(limit = 10): Promise<Result<Trace[], DomainError>> {
    if (this.activeTracesCache?.cycle === this.cycle) {
      return ok(this.activeTracesCache.traces.slice(0, limit));
    }
    const result = await this.db.query<Trace>(
      `SELECT * FROM trace WHERE archived = false AND suppressed = false ORDER BY weight DESC LIMIT $limit`,
      { limit },
    );
    if (result.isOk()) {
      this.activeTracesCache = { cycle: this.cycle, traces: result.value };
    }
    return result;
  }

  // ═══════════════════════════════════════════
  // METHODS USED BY OTHER SERVICES (thin DB wrappers)
  // ═══════════════════════════════════════════

  async findConvergentClusters(signals: Signal[]): Promise<any[]> {
    const result = await this.db.execute('RETURN fn::find_convergent_clusters($min)', { min: 2 });
    return (result as any)?.value?.[0] || [];
  }

  async reinforceFromOutcome(traceIds: string[], reward: number): Promise<void> {
    await this.db.execute('RETURN fn::reinforce_outcome($tids, $reward, $rate)', {
      tids: traceIds, reward, rate: 0.05,
    });
  }

  async queryInhibits(): Promise<Array<{ trace_a: string; trace_b: string; tension: number }>> {
    const result = await this.db.query<any>(
      `SELECT in.trace_id AS trace_a, out.trace_id AS trace_b, weight AS tension FROM inhibits WHERE weight > 0.2 ORDER BY weight DESC LIMIT 10`,
    );
    return result.isOk() ? result.value : [];
  }

  // ═══════════════════════════════════════════
  // QUERIES
  // ═══════════════════════════════════════════

  async getTraceCount(): Promise<number> {
    if (this.traceCountCache?.cycle === this.cycle) return this.traceCountCache.count;
    const result = await this.db.query<{ c: number }>(
      `SELECT count() AS c FROM trace WHERE archived = false GROUP ALL`,
    );
    const count = result.isOk() && result.value.length > 0 ? result.value[0].c : 0;
    this.traceCountCache = { cycle: this.cycle, count };
    return count;
  }
}
