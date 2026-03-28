import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../../common/types/result.types';
import { SurrealService } from '../../database/surreal.service';
import { CognitiveConfigService } from '../../cognitive/cognitive-config.service';
import { Trace, TraceRelation, Signal } from '../kernel.types';
import { ConceptSpaceService } from '../space/concept-space.service';
import { LightConeService } from '../light-cone.service';

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

  // Per-cycle caches — invalidated on tick()
  private activeTracesCache: { cycle: number; traces: Trace[] } | null = null;
  private traceCountCache: { cycle: number; count: number } | null = null;

  constructor(
    private readonly db: SurrealService,
    private readonly config: CognitiveConfigService,
    @Inject(forwardRef(() => ConceptSpaceService))
    private readonly conceptSpace: ConceptSpaceService,
    @Inject(forwardRef(() => LightConeService))
    private readonly lightCone: LightConeService,
  ) {}

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
    // Compute initial position in concept space
    const position = this.conceptSpace
      ? await this.conceptSpace.projectNewTrace(data.content)
      : [];

    const weight = data.initial_weight ?? 0.5;
    const emotionalCharge = data.emotional_charge ?? 0;

    const trace: Omit<Trace, 'id'> = {
      trace_id: `T${Date.now()}_${this.traceIdCounter++}`,
      source_type: data.source_type,
      source_id: data.source_id,
      content: data.content,
      weight,
      initial_weight: weight,
      freshness: 1.0,
      confidence: data.confidence ?? 0.5,
      emotional_charge: emotionalCharge,
      reactivation_count: 0,
      last_reactivated_cycle: this.cycle,
      reactivation_history: [this.cycle],
      created_at_cycle: this.cycle,
      position,
      velocity: new Array(position.length).fill(0),
      suppressed: false,
      archived: false,
    };

    // FAST path: activate in hot memory + queue for SLOW DB write
    this.lightCone.activateHot(trace.trace_id, data.content, weight, emotionalCharge);
    this.lightCone.queueCreate(trace as unknown as Record<string, unknown>);

    return ok(trace as Trace);
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

    // RATE LIMIT: max 3 new traces per ingest cycle (reactivations unlimited)
    let newTracesThisCycle = 0;
    const MAX_NEW_PER_CYCLE = 3;

    for (const signal of signals) {
      // Prefer reactivating existing traces over creating new ones
      // First try: signal has targets → reactivate those directly
      if (signal.targets.length > 0) {
        for (const tid of signal.targets.slice(0, 2)) {
          await this.reactivate(tid, signal.confidence, signal.novelty_cost);
          if (!activatedTraces.includes(tid)) activatedTraces.push(tid);
        }
        continue;
      }

      // Second try: find match in hot traces (zero-DB)
      const existingId = this.findTraceBySimilarityFast(signal.content);
      if (existingId) {
        await this.reactivate(existingId, signal.confidence, signal.novelty_cost);
        activatedTraces.push(existingId);
      } else if (newTracesThisCycle < MAX_NEW_PER_CYCLE) {
        // Create new trace only if under rate limit
        const result = await this.createTrace({
          source_type: signal.type === 'affect' ? 'signal' : 'signal',
          content: signal.content,
          initial_weight: signal.confidence * 0.8,
          confidence: signal.confidence,
          emotional_charge: signal.type === 'affect' ? (signal.payload.charge as number ?? 0) : 0,
        });
        if (result.isOk()) {
          activatedTraces.push(result.value.trace_id);
          newTracesThisCycle++;
          for (const target of signal.targets) {
            await this.link(result.value.trace_id, target, 'activates', signal.confidence * 0.5);
          }
        }
      }
    }

    // CONFLICT DETECTION → DIMENSION BIRTH (max 1 per 10 cycles)
    if (this.conceptSpace && activatedTraces.length > 1 && this.cycle % 10 === 0) {
      await this.detectAndResolveConflicts(activatedTraces);
    }

    // Co-occurrence edges (limited to first 3 traces)
    const edgeTraces = activatedTraces.slice(0, 3);
    for (let i = 0; i < edgeTraces.length; i++) {
      for (let j = i + 1; j < edgeTraces.length; j++) {
        await this.link(edgeTraces[i], edgeTraces[j], 'activates', 0.2);
      }
    }

    // FAST path: skip spreadActivation (DB-heavy recursive queries).
    // Spreading activation runs on SLOW cadence via flushToDb().
    // Hot traces are already activated in-memory by createTrace/reactivate above.

    return ok(activatedTraces);
  }

  // ═══════════════════════════════════════════
  // REACTIVATION
  // ═══════════════════════════════════════════

  async reactivate(traceId: string, confidence: number, _novelty = 0): Promise<void> {
    const boost = this.config.get('kernel.activation_boost');
    const weight = Math.min(1.0, boost * (1 - boost) + boost); // asymptotic boost

    // FAST path: activate in hot memory + queue for SLOW DB write
    this.lightCone.activateHot(traceId, '', confidence, 0);
    this.lightCone.queueReactivation(traceId, { weight, freshness: 1.0, confidence: Math.min(1, confidence) });
  }

  // ═══════════════════════════════════════════
  // SPREADING ACTIVATION + HEBBIAN LEARNING
  // ═══════════════════════════════════════════

  /**
   * Spreading activation + Hebbian learning via SurrealDB stored procedure.
   * Single DB call instead of N+1 queries. Atomic.
   */
  async spreadActivation(sourceTraceId: string, depth = 0): Promise<void> {
    if (depth > 3) return;

    const result = await this.db.execute(
      `fn::spread_activation($tid, $spread, $inhibit, $hebb_lr, $hebb_decay, $cycle)`,
      {
        tid: sourceTraceId,
        spread: this.config.get('kernel.spread_factor'),
        inhibit: this.config.get('kernel.inhibition_factor'),
        hebb_lr: this.config.get('kernel.hebbian_learning_rate'),
        hebb_decay: this.config.get('kernel.hebbian_decay_rate'),
        cycle: this.cycle,
      },
    );

    // Recurse on heavily activated neighbors (depth-limited)
    if (result.isOk() && depth < 2) {
      const activated = await this.db.query<{ trace_id: string }>(
        `SELECT trace_id FROM trace WHERE last_reactivated_cycle = $cycle AND weight > 0.3 AND archived = false LIMIT 5`,
        { cycle: this.cycle },
      );
      if (activated.isOk()) {
        for (const t of activated.value.slice(0, 3)) {
          if (t.trace_id !== sourceTraceId) {
            await this.spreadActivation(t.trace_id, depth + 1);
          }
        }
      }
    }
  }

  // ═══════════════════════════════════════════
  // PREDICTION ERROR BACKPROPAGATION
  // ═══════════════════════════════════════════

  /**
   * Prediction error backpropagation via SurrealDB stored procedure.
   */
  async backpropagatePredictionError(traceId: string, error: number): Promise<void> {
    if (error < 0.01) return;
    await this.db.execute(
      `fn::backprop_pred_error($tid, $error, $rate)`,
      { tid: traceId, error, rate: this.config.get('kernel.pred_error_backprop_rate') },
    );
  }

  // ═══════════════════════════════════════════
  // OUTCOME REINFORCEMENT
  // ═══════════════════════════════════════════

  /**
   * Outcome reinforcement via SurrealDB stored procedure.
   */
  async reinforceFromOutcome(traceIds: string[], reward: number): Promise<void> {
    await this.db.execute(
      `fn::reinforce_outcome($tids, $reward, $rate)`,
      { tids: traceIds, reward, rate: this.config.get('kernel.reinforcement_rate') },
    );
  }

  // ═══════════════════════════════════════════
  // FORGETTING
  // ═══════════════════════════════════════════

  /**
   * Forgetting via SurrealDB stored procedure — single atomic operation.
   */
  async forget(): Promise<Result<{ decayed: number; archived: number }, DomainError>> {
    const result = await this.db.execute(
      `fn::forget_traces($decay, $threshold)`,
      {
        decay: this.config.get('kernel.freshness_decay'),
        threshold: this.config.get('kernel.archive_threshold'),
      },
    );
    return ok({ decayed: 1, archived: result.isOk() ? ((result.value as Record<string, unknown>)?.archived as number ?? 0) : 0 });
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
            // Convergence via shared targets (graph-based, not text)
            const sharedTargets = a.targets.filter(t => b.targets.includes(t));
            if (sharedTargets.length > 0) {
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
    // FAST path: queue for SLOW DB write
    this.lightCone.queueLink({ from: fromTraceId, to: toTraceId, relation, weight });
  }

  // ═══════════════════════════════════════════
  // RETRIEVAL
  // ═══════════════════════════════════════════

  async getActiveTraces(limit = 20): Promise<Result<Trace[], DomainError>> {
    // Cache full result set per cycle; slice to requested limit
    if (this.activeTracesCache && this.activeTracesCache.cycle === this.cycle) {
      return ok(this.activeTracesCache.traces.slice(0, limit));
    }
    const result = await this.db.query<Trace>(
      `SELECT * FROM trace WHERE archived = false AND suppressed = false ORDER BY weight DESC LIMIT $limit`,
      { limit: 50 }, // fetch a generous batch to serve various callers
    );
    if (result.isOk()) {
      this.activeTracesCache = { cycle: this.cycle, traces: result.value };
    }
    return result.isOk() ? ok(result.value.slice(0, limit)) : result;
  }

  async getTraceCount(): Promise<number> {
    if (this.traceCountCache && this.traceCountCache.cycle === this.cycle) {
      return this.traceCountCache.count;
    }
    const r = await this.db.query<{ c: number }>('SELECT count() AS c FROM trace WHERE archived = false GROUP ALL');
    const count = r.isOk() && r.value.length > 0 ? r.value[0].c : 0;
    this.traceCountCache = { cycle: this.cycle, count };
    return count;
  }


  /**
   * Query active inhibition edges for conflict detection.
   */
  async queryInhibits(): Promise<Result<Array<{ a: string; b: string; w: number }>, DomainError>> {
    return this.db.query<{ a: string; b: string; w: number }>(
      `SELECT in.content AS a, out.content AS b, weight AS w FROM inhibits WHERE in.trace_id IN (SELECT trace_id FROM trace WHERE archived = false AND suppressed = false AND weight > 0.3) ORDER BY weight DESC LIMIT 5`,
    );
  }

  // ═══════════════════════════════════════════
  // SLOW CADENCE: FLUSH TO DB
  // ═══════════════════════════════════════════

  /**
   * Flush all queued FAST-path operations to DB. Called on SLOW cadence.
   */
  async flushToDb(): Promise<{ created: number; reactivated: number; linked: number }> {
    const creates = this.lightCone.flushCreates();
    const reactivations = this.lightCone.flushReactivations();
    const links = this.lightCone.flushLinks();

    // Batch create: single INSERT for all traces
    if (creates.length > 0) {
      for (const trace of creates) {
        await this.db.create('trace', trace); // SurrealDB handles batch internally
      }
    }

    // Batch reactivation: single UPDATE with IN clause
    if (reactivations.size > 0) {
      const traceIds = Array.from(reactivations.keys());
      const firstData = reactivations.values().next().value;
      await this.db.execute(
        `UPDATE trace SET weight = math::clamp($w, 0, 1), freshness = 1.0, reactivation_count += 1, last_reactivated_cycle = $cycle WHERE trace_id IN $ids`,
        { w: firstData?.weight ?? 0.5, cycle: this.cycle, ids: traceIds },
      );
    }

    // Batch links: use stored proc for activates (most common), individual for rare types
    if (links.length > 0) {
      const activateLinks = links.filter(l => l.relation === 'activates');
      const otherLinks = links.filter(l => l.relation !== 'activates');

      if (activateLinks.length > 0) {
        await this.db.execute(
          `RETURN fn::batch_create_links($links)`,
          { links: activateLinks.map(l => ({ from: l.from, to: l.to, weight: l.weight })) },
        );
      }
      // Other relation types still individual (rare)
      for (const link of otherLinks) {
        await this.db.execute(
          `RELATE (SELECT id FROM trace WHERE trace_id = $from LIMIT 1)->${link.relation}->(SELECT id FROM trace WHERE trace_id = $to LIMIT 1) SET weight = $w`,
          { from: link.from, to: link.to, w: link.weight },
        );
      }
    }

    return { created: creates.length, reactivated: reactivations.size, linked: links.length };
  }

  // ═══════════════════════════════════════════
  // EPISODIC EDGES (AriGraph-inspired)
  // ═══════════════════════════════════════════

  /**
   * Record an episodic edge: timestamped, context-specific interaction.
   * "At cycle N, trace A activated trace B because of action X"
   * Queued in-memory, flushed with flushToDb().
   */
  recordEpisodicEdge(from: string, to: string, action: string, cycle: number): void {
    this.lightCone.queueWrite({
      table: 'episodic', operation: 'execute', data: {},
      sql: `RELATE (SELECT id FROM trace WHERE trace_id = $from LIMIT 1)->episodic->(SELECT id FROM trace WHERE trace_id = $to LIMIT 1) SET weight = 0.5, cycle = $cycle, action = $action`,
      vars: { from, to, cycle, action },
    });
  }

  /**
   * Consolidate episodic → semantic: frequent episodic patterns become permanent edges.
   * Called on GLOBAL cadence (every 200 ticks).
   *
   * If trace A→B has 3+ episodic edges → create/strengthen semantic activates edge.
   *
   * Pruning: NOT time-based (important rare events must persist).
   * Instead: weight decay on episodic edges. Consolidated patterns get removed.
   * Unconsolidated edges fade through weight decay (same as trace forgetting).
   * Emotional edges resist decay (anchoring).
   */
  async consolidateEpisodicEdges(): Promise<{ consolidated: number; pruned: number }> {
    const result = await this.db.query<{ consolidated: number }>(
      `RETURN fn::consolidate_episodic(3)`,
    );
    const consolidated = result.isOk() && result.value.length > 0
      ? (result.value[0].consolidated ?? 0) : 0;
    if (consolidated > 0) {
      this.logger.log(`Episodic→Semantic: ${consolidated} patterns consolidated`);
    }
    return { consolidated, pruned: 0 };
  }

  // ═══════════════════════════════════════════
  // PRIVATE
  // ═══════════════════════════════════════════

  async getTracePosition(traceId: string): Promise<number[] | null> {
    const trace = await this.findById(traceId);
    return trace ? trace.position : null;
  }

  private async findById(traceId: string): Promise<Trace | null> {
    const r = await this.db.query<Trace>('SELECT * FROM trace WHERE trace_id = $tid LIMIT 1', { tid: traceId });
    return r.isOk() && r.value.length > 0 ? r.value[0] : null;
  }

  /**
   * FAST path: find a matching trace in hot memory (zero-DB).
   * Returns the most active hot trace with weight > 0.3.
   */
  private findTraceBySimilarityFast(_content: string): string | null {
    const hotTraces = this.lightCone.getHotTraces(30);
    for (const ht of hotTraces) {
      if (ht.weight > 0.3) return ht.traceId;
    }
    return null;
  }

  /**
   * Find trace by spatial proximity in concept space.
   * Graph-based: position the content, find nearest existing trace.
   * No text analysis — uses learned spatial positions.
   */
  private async findTraceBySimilarity(content: string): Promise<Trace | null> {
    if (!this.conceptSpace) return null;

    // Project content into concept space
    const position = await this.conceptSpace.projectNewTrace(content);
    if (position.length === 0) return null;

    // Find nearest trace by spatial distance
    const neighbors = await this.conceptSpace.findNeighbors(position, 2.0, 1);
    if (neighbors.length === 0) return null;

    return this.findById(neighbors[0].trace.trace_id);
  }

  /**
   * Detect spatial conflicts between recently activated traces.
   * If conflict found → birth new dimension.
   */
  private async detectAndResolveConflicts(activatedTraceIds: string[]): Promise<void> {
    // Get the actual traces
    const traces: Trace[] = [];
    for (const tid of activatedTraceIds.slice(0, 10)) {
      const t = await this.findById(tid);
      if (t) traces.push(t);
    }

    // Check all pairs for conflicts
    for (let i = 0; i < traces.length; i++) {
      for (let j = i + 1; j < traces.length; j++) {
        const conflict = this.conceptSpace.detectConflict(traces[i], traces[j]);
        if (conflict) {
          // BIRTH NEW DIMENSION
          await this.conceptSpace.birthDimension(conflict, this.cycle);
          conflict.resolved = true;
          return; // one dimension birth per cycle max
        }
      }
    }
  }

  /**
   * Similarity between traces via spatial distance in concept space.
   * Returns 0-1: 1 = identical position, 0 = very far apart.
   * No text analysis — uses learned spatial positions.
   */
  private spatialSimilarity(posA: number[], posB: number[]): number {
    if (!posA || !posB || posA.length === 0 || posB.length === 0) return 0;
    const dist = this.conceptSpace ? this.conceptSpace.distance(posA, posB) : 0;
    return Math.exp(-dist); // exponential decay: close = high similarity
  }

  private async getReactivationHistory(traceId: string): Promise<number[]> {
    const r = await this.db.query<{ reactivation_history: number[] }>(
      'SELECT reactivation_history FROM trace WHERE trace_id = $tid LIMIT 1',
      { tid: traceId },
    );
    return r.isOk() && r.value.length > 0 ? (r.value[0].reactivation_history || []) : [];
  }
}
