import { Injectable, Logger } from '@nestjs/common';
import { SurrealService } from '../../database/surreal.service';
import { CognitiveConfigService } from '../../cognitive/cognitive-config.service';
import { LightConeService } from '../light-cone.service';
import { Dimension, SpatialConflict, SpatialMovement, SpatialCluster, WorldSnapshot, GradientField, Trajectory, SpatialGap } from './concept-space.types';
import { Trace } from '../kernel.types';
// Constants file exists but conflict detection is now purely graph-based — no linguistic constants needed

/**
 * ConceptSpaceService: Adaptive multidimensional cognitive space.
 *
 * Dimensions are BORN from conflicts, not predefined.
 * Traces have positions that EVOLVE through experience.
 * Distance = cognitive proximity. Abstractions = centroids.
 *
 * Like a child's mind: starts 0-dimensional, each new distinction
 * creates a new axis of differentiation.
 */

@Injectable()
export class ConceptSpaceService {
  private readonly logger = new Logger(ConceptSpaceService.name);
  private dimensions: Dimension[] = [];
  private dimCounter = 0;

  constructor(
    private readonly db: SurrealService,
    private readonly config: CognitiveConfigService,
    private readonly lightCone: LightConeService,
  ) {}

  getDimensionCount(): number { return this.dimensions.length; }
  getDimensions(): Dimension[] { return [...this.dimensions]; }
  getFastDimCount(): number { return this.dimensions.filter(d => d.temporal_tier === 'fast').length; }
  getSlowDimCount(): number { return this.dimensions.filter(d => d.temporal_tier === 'slow').length; }

  // ═══════════════════════════════════════════
  // DISTANCE
  // ═══════════════════════════════════════════

  /**
   * Euclidean distance in concept space.
   * If traces have different dimensionality, pad shorter with zeros.
   */
  distance(posA: number[], posB: number[]): number {
    const len = Math.max(posA.length, posB.length);
    let sum = 0;
    for (let i = 0; i < len; i++) {
      const a = posA[i] ?? 0;
      const b = posB[i] ?? 0;
      sum += (a - b) ** 2;
    }
    return Math.sqrt(sum);
  }

  /**
   * Find traces within spatial radius of a source position.
   * Returns: closest first.
   */
  async findNeighbors(position: number[], radius: number, limit = 10): Promise<Array<{ trace: Trace; dist: number }>> {
    // NOTE: SurrealDB 3.0.4 KNN (<|K|>) doesn't support AND conditions.
    // Using brute-force scan with JS sort. MTREE index helps DB internally.

    // Fallback: brute-force scan + JS sort
    const result = await this.db.query<Trace>(
      `SELECT * FROM trace WHERE archived = false AND suppressed = false AND array::len(position) > 0 LIMIT 100`,
    );
    if (result.isErr()) return [];

    const neighbors: Array<{ trace: Trace; dist: number }> = [];
    for (const trace of result.value) {
      const dist = this.distance(position, trace.position || []);
      if (dist <= radius) {
        neighbors.push({ trace, dist });
      }
    }

    return neighbors.sort((a, b) => a.dist - b.dist).slice(0, limit);
  }

  // ═══════════════════════════════════════════
  // SPATIAL ACTIVATION (gaussian kernel)
  // ═══════════════════════════════════════════

  /**
   * Compute activation from source to target based on spatial proximity.
   * activation = source_weight * exp(-dist² / (2σ²))
   * σ modulated by arousal (narrow) and dopamine (wide).
   */
  spatialActivation(sourceWeight: number, dist: number, sigma: number): number {
    if (dist === 0) return sourceWeight;
    return sourceWeight * Math.exp(-(dist ** 2) / (2 * sigma ** 2));
  }

  // ═══════════════════════════════════════════
  // CONFLICT DETECTION (purely graph-structural)
  // ═══════════════════════════════════════════

  /**
   * Detect conflict between two traces from GRAPH STRUCTURE only.
   * No text analysis. No hardcoded linguistic knowledge.
   *
   * Conflict = same spatial region + divergent graph neighborhoods.
   * Two traces close in concept space but connected to different
   * downstream patterns need a new dimension to separate them.
   *
   * Signals:
   * 1. Inhibitory edge between them (already marked as opposing)
   * 2. Shared neighbors but different edge weights (ambiguous region)
   * 3. Close positions + low mutual edge weight (near but unconnected)
   */
  detectConflict(traceA: Trace, traceB: Trace): SpatialConflict | null {
    const posA = traceA.position || [];
    const posB = traceB.position || [];
    const dist = this.distance(posA, posB);

    // Must be in same spatial region
    const conflictRadius = this.config.get('kernel.conflict_radius');
    if (dist > conflictRadius && posA.length > 0) return null;

    // Already separated by existing dimension?
    const separationThreshold = this.config.get('kernel.separation_threshold');
    for (const dim of this.dimensions) {
      const aVal = posA[dim.id] ?? 0;
      const bVal = posB[dim.id] ?? 0;
      if (Math.abs(aVal - bVal) > separationThreshold) return null;
    }

    // GRAPH-BASED CONFLICT: traces close in space but different enough to need separation
    // Severity = closeness (closer = more urgently needs resolution)
    // Any two traces that are spatially close AND not already separated are candidates
    // The system will discover WHAT the distinction is via the new dimension's exemplars
    const severity = dist > 0.01 ? 1 / dist : 10;

    // Only create conflict if traces are sufficiently established (weight > threshold)
    // This prevents conflicts between brand-new traces that haven't been reinforced yet
    const minWeight = this.config.get('kernel.conflict_min_weight') ?? 0.3;
    if (traceA.weight < minWeight || traceB.weight < minWeight) return null;

    return {
      trace_a_id: traceA.trace_id,
      trace_b_id: traceB.trace_id,
      trace_a_content: traceA.content,
      trace_b_content: traceB.content,
      distance: dist,
      severity,
      resolved: false,
    };
  }

  /**
   * Async conflict detection using graph edge patterns.
   * Called less frequently (SLOW cadence) for richer analysis.
   *
   * Finds pairs where: shared neighbors have divergent weights,
   * OR inhibitory edges exist between co-located traces.
   */
  async detectGraphConflicts(limit = 5): Promise<SpatialConflict[]> {
    const conflicts: SpatialConflict[] = [];
    const conflictRadius = this.config.get('kernel.conflict_radius');

    // 1. Inhibitory edges (DB-side filtering)
    const inhibits = await this.db.query<any>(
      `RETURN fn::detect_conflicts_native($radius, 0.3, $limit)`,
      { radius: conflictRadius, limit },
    );
    if (inhibits.isOk()) {
      for (const edge of inhibits.value) {
        if (edge.a_pos && edge.b_pos) {
          const dist = this.distance(edge.a_pos, edge.b_pos);
          if (dist <= conflictRadius && dist > 0.01) {
            conflicts.push({
              trace_a_id: edge.a_id, trace_b_id: edge.b_id,
              trace_a_content: edge.a_content, trace_b_content: edge.b_content,
              distance: dist, severity: dist > 0.01 ? 1 / dist : 10, resolved: false,
            });
          }
        }
      }
    }

    // 2. High-connectivity traces (already uses stored proc from migration 021)
    const highVar = await this.db.query<any>(
      `RETURN fn::find_high_connectivity(2, $limit)`,
      { limit: limit * 2 },
    );
    if (highVar.isOk() && highVar.value.length >= 2) {
      const traces = highVar.value;
      for (let i = 0; i < Math.min(traces.length, limit); i++) {
        for (let j = i + 1; j < Math.min(traces.length, limit + 1); j++) {
          const dist = this.distance(traces[i].position || [], traces[j].position || []);
          if (dist <= conflictRadius && dist > 0.01) {
            conflicts.push({
              trace_a_id: traces[i].trace_id, trace_b_id: traces[j].trace_id,
              trace_a_content: traces[i].content, trace_b_content: traces[j].content,
              distance: dist, severity: dist > 0.01 ? 1 / dist : 10, resolved: false,
            });
          }
        }
      }
    }

    return conflicts;
  }

  // ═══════════════════════════════════════════
  // DIMENSION BIRTH
  // ═══════════════════════════════════════════

  /**
   * Birth a new dimension from a conflict. The dimension separates
   * the conflicting traces along a new axis.
   */
  async birthDimension(conflict: SpatialConflict, cycle: number): Promise<Dimension> {
    // Cap dimensions — too many = slow everything, diminishing returns
    const maxDims = this.config.get('kernel.max_dimensions') ?? 30;
    if (this.dimensions.length >= maxDims) {
      return this.dimensions[this.dimensions.length - 1]; // return last, no new
    }

    const severityThreshold = this.config.get('kernel.fast_slow_severity_threshold') ?? 0.5;
    const dim: Dimension = {
      id: this.dimCounter++,
      born_at_cycle: cycle,
      born_from_conflict: { trace_a: conflict.trace_a_id, trace_b: conflict.trace_b_id },
      positive_exemplars: [conflict.trace_a_id],
      negative_exemplars: [conflict.trace_b_id],
      label: undefined,
      temporal_tier: conflict.severity > severityThreshold ? 'fast' : 'slow',
      variance: 2.0, // initially spread out
      usage_count: 1,
    };

    this.dimensions.push(dim);

    // Move conflicting traces apart: A → +1, B → -1
    await this.expandTracePosition(conflict.trace_a_id, dim.id, +1.0);
    await this.expandTracePosition(conflict.trace_b_id, dim.id, -1.0);

    // All other active traces get 0 (neutral) on new dimension
    await this.db.execute(
      `UPDATE trace SET
        position = array::push(position, 0.0),
        velocity = array::push(velocity, 0.0)
      WHERE archived = false AND trace_id != $a AND trace_id != $b`,
      { a: conflict.trace_a_id, b: conflict.trace_b_id },
    );

    // Persist dimension
    await this.db.create('concept_dimension', {
      dimension_id: dim.id,
      born_at_cycle: dim.born_at_cycle,
      born_from_a: conflict.trace_a_id,
      born_from_b: conflict.trace_b_id,
      positive_exemplars: dim.positive_exemplars,
      negative_exemplars: dim.negative_exemplars,
      temporal_tier: dim.temporal_tier,
      variance: dim.variance,
      usage_count: dim.usage_count,
    } as Record<string, unknown>);

    this.logger.log(`DIMENSION BORN: axis_${dim.id} from conflict "${conflict.trace_a_content.slice(0, 30)}" vs "${conflict.trace_b_content.slice(0, 30)}"`);

    return dim;
  }

  private async expandTracePosition(traceId: string, dimId: number, value: number): Promise<void> {
    // Ensure position vector is long enough, then set the value at dimId
    const trace = await this.db.query<Trace>(
      `SELECT position, velocity FROM trace WHERE trace_id = $tid LIMIT 1`,
      { tid: traceId },
    );
    if (trace.isErr() || trace.value.length === 0) return;

    const pos = [...(trace.value[0].position || [])];
    const vel = [...(trace.value[0].velocity || [])];

    // Pad to reach dimId
    while (pos.length <= dimId) { pos.push(0); vel.push(0); }
    pos[dimId] = value;

    await this.db.execute(
      `UPDATE trace SET position = $pos, velocity = $vel WHERE trace_id = $tid`,
      { pos, vel, tid: traceId },
    );
  }

  // ═══════════════════════════════════════════
  // POSITIONING NEW TRACES
  // ═══════════════════════════════════════════

  /**
   * Compute initial position for a new trace.
   *
   * Graph-based: position near traces that were recently co-activated.
   * If co-active neighbors exist, average their positions (Hebbian spatial placement).
   * If no co-active neighbors, position near the centroid of the most recently
   * active cluster. This is LEARNED placement, not text similarity.
   */
  async projectNewTrace(content: string): Promise<number[]> {
    if (this.dimensions.length === 0) return [];

    const dimCount = this.dimensions.length;

    // Primary strategy: center with noise, spread proportional to hot trace count.
    // Positions converge through drift/attraction — no DB query needed on FAST path.
    const hotTraceCount = this.hotTraceCount;
    const spread = hotTraceCount > 0 ? 0.3 + Math.min(0.4, hotTraceCount * 0.02) : 0.5;
    return new Array(dimCount).fill(0).map(() => (Math.random() - 0.5) * spread);
  }

  /** Updated by kernel on SLOW cadence for spread estimation. */
  private hotTraceCount = 0;
  setHotTraceCount(count: number): void { this.hotTraceCount = count; }

  // ═══════════════════════════════════════════
  // MOVEMENT (Hebbian spatial: co-active → attract)
  // ═══════════════════════════════════════════

  /**
   * Move two traces closer (attracted by co-activation) or farther (repelled by inhibition).
   * Returns the movement applied.
   */
  computeAttraction(posA: number[], posB: number[], strength: number): SpatialMovement[] {
    const len = Math.max(posA.length, posB.length);
    const deltaA = new Array(len).fill(0);
    const deltaB = new Array(len).fill(0);

    for (let d = 0; d < len; d++) {
      const a = posA[d] ?? 0;
      const b = posB[d] ?? 0;
      const diff = b - a;
      // Attract: move toward each other proportionally
      deltaA[d] = diff * strength * 0.1;
      deltaB[d] = -diff * strength * 0.1;
    }

    return [
      { trace_id: '', delta: deltaA, reason: 'attraction' },
      { trace_id: '', delta: deltaB, reason: 'attraction' },
    ];
  }

  // ═══════════════════════════════════════════
  // DIMENSION NAMING (emergent)
  // ═══════════════════════════════════════════

  /**
   * Name dimensions by analyzing traces at their extremes.
   * Called periodically (nightly or after enough data).
   */
  async nameDimensions(): Promise<void> {
    for (const dim of this.dimensions) {
      if (dim.label) continue; // already named

      // Find traces at extremes of this dimension (sort in app code — SurrealDB 3.0 can't ORDER BY array index)
      const allTraces = await this.db.query<Trace>(
        `SELECT trace_id, content, position FROM trace WHERE archived = false AND array::len(position) > $dimId LIMIT 50`,
        { dimId: dim.id },
      );
      if (allTraces.isErr() || allTraces.value.length < 4) continue;

      const sorted = allTraces.value
        .filter(t => t.position && t.position.length > dim.id)
        .sort((a, b) => (b.position[dim.id] || 0) - (a.position[dim.id] || 0));

      const positive = { value: sorted.slice(0, 3) };
      const negative = { value: sorted.slice(-3).reverse() };

      if (positive.value.length < 2 || negative.value.length < 2) continue;

      // Extract shared words at each pole
      const posWords = this.sharedWords(positive.value.map(t => t.content));
      const negWords = this.sharedWords(negative.value.map(t => t.content));

      if (posWords.length > 0 || negWords.length > 0) {
        const posLabel = posWords.join('+') || '?';
        const negLabel = negWords.join('+') || '?';
        dim.label = `${posLabel} ↔ ${negLabel}`;
        dim.positive_exemplars = positive.value.map(t => t.trace_id);
        dim.negative_exemplars = negative.value.map(t => t.trace_id);

        // Update in DB
        await this.db.execute(
          `UPDATE concept_dimension SET label = $label, positive_exemplars = $pos, negative_exemplars = $neg, temporal_tier = $tier WHERE dimension_id = $did`,
          { label: dim.label, pos: dim.positive_exemplars, neg: dim.negative_exemplars, tier: dim.temporal_tier, did: dim.id },
        );

        this.logger.log(`DIMENSION NAMED: axis_${dim.id} = "${dim.label}"`);
      }
    }
  }

  // ═══════════════════════════════════════════
  // CLUSTERING (for abstraction)
  // ═══════════════════════════════════════════

  /**
   * Find spatial clusters (groups of nearby traces).
   * Each cluster is a candidate abstraction.
   */
  async findClusters(minSize = 3, radius = 1.5): Promise<SpatialCluster[]> {
    const active = await this.db.query<Trace>(
      `SELECT trace_id, content, position FROM trace WHERE archived = false AND array::len(position) > 0 LIMIT 50`,
    );
    if (active.isErr()) return [];

    const traces = active.value;
    const visited = new Set<string>();
    const clusters: SpatialCluster[] = [];

    for (const seed of traces) {
      if (visited.has(seed.trace_id)) continue;

      // Find neighborhood
      const cluster: Trace[] = [seed];
      visited.add(seed.trace_id);

      for (const other of traces) {
        if (visited.has(other.trace_id)) continue;
        if (this.distance(seed.position || [], other.position || []) < radius) {
          cluster.push(other);
          visited.add(other.trace_id);
        }
      }

      if (cluster.length >= minSize) {
        const centroid = this.computeCentroid(cluster.map(t => t.position || []));
        const shared = this.sharedWords(cluster.map(t => t.content));
        const maxDist = Math.max(...cluster.map(t => this.distance(t.position || [], centroid)));

        clusters.push({
          centroid,
          traces: cluster.map(t => t.trace_id),
          radius: maxDist,
          shared_words: shared,
        });
      }
    }

    return clusters;
  }

  // ═══════════════════════════════════════════
  // CLUSTER MATERIALIZATION (persist to graph DB)
  // ═══════════════════════════════════════════

  /**
   * Materialize clusters as graph entities in SurrealDB.
   * Clusters become first-class nodes with soft membership edges.
   *
   * Called on GLOBAL cadence. Creates/updates:
   * - cluster records (centroid, radius, member_count, confidence)
   * - belongs_to edges (trace → cluster, with membership_strength)
   * - contains edges (cluster → cluster, hierarchy)
   * - Links [ABSTRACT] traces to their cluster
   */
  async materializeClusters(cycle: number): Promise<{ created: number; updated: number }> {
    const clusters = await this.findClusters(2, 1.5);
    let created = 0;
    let updated = 0;

    // Load existing clusters
    const existing = await this.db.query<{ cluster_id: string; centroid: number[] }>(
      `SELECT cluster_id, centroid FROM cluster WHERE archived = false`,
    );
    const existingMap = new Map<string, number[]>();
    if (existing.isOk()) {
      for (const c of existing.value) existingMap.set(c.cluster_id, c.centroid);
    }

    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      const clusterId = `CL_${i}_${cycle}`;

      // Check if this cluster matches an existing one (centroid close enough)
      let matchedId: string | null = null;
      for (const [eid, eCentroid] of existingMap) {
        if (this.distance(cluster.centroid, eCentroid) < cluster.radius * 0.5) {
          matchedId = eid;
          break;
        }
      }

      if (matchedId) {
        // Update existing cluster
        await this.db.execute(
          `UPDATE cluster SET centroid = $centroid, radius = $radius, member_count = $count, last_updated_cycle = $cycle, confidence = $conf WHERE cluster_id = $cid`,
          { centroid: cluster.centroid, radius: cluster.radius, count: cluster.traces.length, cycle, conf: Math.min(1, cluster.traces.length / 10), cid: matchedId },
        );
        // Update membership edges
        for (const traceId of cluster.traces) {
          await this.db.execute(
            `DELETE belongs_to WHERE in.trace_id = $tid AND out.cluster_id = $cid;
             RELATE (SELECT id FROM trace WHERE trace_id = $tid LIMIT 1)->belongs_to->(SELECT id FROM cluster WHERE cluster_id = $cid LIMIT 1) SET membership_strength = 1.0, since_cycle = $cycle`,
            { tid: traceId, cid: matchedId, cycle },
          );
        }
        updated++;
      } else {
        // Create new cluster
        await this.db.create('cluster', {
          cluster_id: clusterId,
          centroid: cluster.centroid,
          radius: cluster.radius,
          member_count: cluster.traces.length,
          confidence: Math.min(1, cluster.traces.length / 10),
          born_at_cycle: cycle,
          last_updated_cycle: cycle,
          archived: false,
        } as Record<string, unknown>);

        // Create membership edges
        for (const traceId of cluster.traces) {
          await this.db.execute(
            `RELATE (SELECT id FROM trace WHERE trace_id = $tid LIMIT 1)->belongs_to->(SELECT id FROM cluster WHERE cluster_id = $cid LIMIT 1) SET membership_strength = 1.0, since_cycle = $cycle`,
            { tid: traceId, cid: clusterId, cycle },
          );
        }
        created++;
      }
    }

    // Detect hierarchy: if cluster A centroid is inside cluster B radius
    if (clusters.length >= 2) {
      const allClusters = await this.db.query<{ cluster_id: string; centroid: number[]; radius: number }>(
        `SELECT cluster_id, centroid, radius FROM cluster WHERE archived = false`,
      );
      if (allClusters.isOk()) {
        for (const a of allClusters.value) {
          for (const b of allClusters.value) {
            if (a.cluster_id === b.cluster_id) continue;
            if (a.radius < b.radius && this.distance(a.centroid, b.centroid) < b.radius) {
              // A is inside B → A is a sub-cluster of B
              await this.db.execute(
                `RELATE (SELECT id FROM cluster WHERE cluster_id = $child LIMIT 1)->contains->(SELECT id FROM cluster WHERE cluster_id = $parent LIMIT 1) SET hierarchy_level = 1`,
                { child: a.cluster_id, parent: b.cluster_id },
              );
            }
          }
        }
      }
    }

    if (created > 0 || updated > 0) {
      this.logger.log(`Clusters materialized: ${created} new, ${updated} updated (${clusters.length} total)`);
    }

    return { created, updated };
  }

  /**
   * Get cluster for a trace (strongest membership).
   */
  async getTraceCluster(traceId: string): Promise<string | null> {
    const result = await this.db.query<{ cluster_id: string }>(
      `SELECT out.cluster_id AS cluster_id FROM belongs_to WHERE in.trace_id = $tid ORDER BY membership_strength DESC LIMIT 1`,
      { tid: traceId },
    );
    return result.isOk() && result.value.length > 0 ? result.value[0].cluster_id : null;
  }

  /**
   * Record a cluster-level trajectory: action at cluster A → cluster B.
   */
  async recordClusterTrajectory(fromCluster: string, toCluster: string, action: string): Promise<void> {
    if (!fromCluster || !toCluster || fromCluster === toCluster) return;

    // Upsert: increment traversal_count if exists, create if not
    const existing = await this.db.query<{ id: string }>(
      `SELECT id FROM cluster_trajectory WHERE from_cluster = $from AND to_cluster = $to AND action = $action LIMIT 1`,
      { from: fromCluster, to: toCluster, action },
    );

    if (existing.isOk() && existing.value.length > 0) {
      await this.db.execute(
        `UPDATE cluster_trajectory SET traversal_count += 1, confidence = math::clamp(confidence + 0.05, 0, 1) WHERE from_cluster = $from AND to_cluster = $to AND action = $action`,
        { from: fromCluster, to: toCluster, action },
      );
    } else {
      await this.db.create('cluster_trajectory', {
        from_cluster: fromCluster, to_cluster: toCluster,
        action, confidence: 0.5, traversal_count: 1,
      } as Record<string, unknown>);
    }
  }

  /**
   * Get all active clusters with member counts.
   */
  async getActiveClusters(): Promise<Array<{ cluster_id: string; centroid: number[]; member_count: number; confidence: number }>> {
    const result = await this.db.query<any>(
      `SELECT cluster_id, centroid, member_count, confidence FROM cluster WHERE archived = false ORDER BY member_count DESC LIMIT 20`,
    );
    return result.isOk() ? result.value : [];
  }

  // ═══════════════════════════════════════════
  // LEXICAL: language grounding in concept space
  // ═══════════════════════════════════════════

  /**
   * Find the lexical label for a position in concept space.
   * Returns the content of the nearest lexical trace, stripped of mama prefix.
   * This is PRODUCTION: concept → word.
   */
  async findLexicalLabel(position: number[]): Promise<string | null> {
    if (position.length === 0) return null;

    const lexical = await this.db.query<Trace>(
      `SELECT trace_id, content, position, weight FROM trace
       WHERE source_type = 'lexical' AND archived = false AND weight > 0.3
       ORDER BY weight DESC LIMIT 20`,
    );
    if (lexical.isErr() || lexical.value.length === 0) return null;

    let bestTrace: Trace | null = null;
    let bestDist = Infinity;

    for (const t of lexical.value) {
      if (!t.position || t.position.length === 0) continue;
      const dist = this.distance(position, t.position);
      if (dist < bestDist) {
        bestDist = dist;
        bestTrace = t;
      }
    }

    if (!bestTrace || bestDist > 3.0) return null;
    return this.extractWord(bestTrace.content);
  }

  /**
   * Count lexical traces (vocabulary size).
   * Includes both flushed DB traces and pending in-memory creates
   * so vocab count is accurate even between SLOW flushes.
   */
  async getVocabularySize(): Promise<number> {
    const result = await this.db.query<{ c: number }>(
      `SELECT count() AS c FROM trace WHERE source_type = 'lexical' AND archived = false GROUP ALL`,
    );
    const dbCount = result.isOk() && result.value.length > 0 ? result.value[0].c : 0;
    const pendingCount = this.lightCone?.getPendingLexicalCount() ?? 0;
    return dbCount + pendingCount;
  }

  /** Strip mama speech prefixes to extract bare word/phrase. */
  private extractWord(content: string): string {
    return content
      .replace(/^Мама[^:]*:\s*"?/i, '')
      .replace(/"?\s*$/i, '')
      .trim();
  }

  // ═══════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════

  private computeCentroid(positions: number[][]): number[] {
    if (positions.length === 0) return [];
    const maxLen = Math.max(...positions.map(p => p.length));
    const centroid = new Array(maxLen).fill(0);
    for (const pos of positions) {
      for (let d = 0; d < maxLen; d++) {
        centroid[d] += (pos[d] ?? 0) / positions.length;
      }
    }
    return centroid;
  }

  private sharedWords(contents: string[]): string[] {
    if (contents.length < 2) return [];
    const wordSets = contents.map(c =>
      new Set(c.toLowerCase().split(/\s+/).filter(w => w.length > 3)),
    );

    const shared: string[] = [];
    for (const word of wordSets[0]) {
      if (wordSets.every(s => s.has(word))) {
        shared.push(word);
      }
    }
    return shared;
  }

  // ═══════════════════════════════════════════
  // WORLD SNAPSHOT (concept space IS the world model)
  // ═══════════════════════════════════════════

  /**
   * The world model IS the concept space state.
   * No SQL queries for beliefs/knowledge counts — spatial state IS reality.
   */
  async snapshot(): Promise<WorldSnapshot> {
    const regions = await this.findClusters(2, 1.5);
    const selfRegion = await this.getSelfRegion();
    const gradientField = await this.computeGradientField();
    const trajectories = await this.getTrajectories();
    const traceCount = await this.getTraceCount();

    // Confidence = how populated is the space
    const dimPopulation = this.dimensions.length > 0 ? Math.min(1, traceCount / (this.dimensions.length * 5)) : 0;
    const confidence = Math.min(1, this.dimensions.length * 0.15 + dimPopulation * 0.5);

    // Coherence = cluster quality (tight clusters, clear separation)
    const coherence = regions.length > 0
      ? regions.reduce((s, r) => s + (1 / (1 + r.radius)), 0) / regions.length
      : 0;

    // Gaps = dimensions with few traces at their extremes
    const gaps: SpatialGap[] = [];
    for (const dim of this.dimensions) {
      if (dim.positive_exemplars.length < 2) {
        gaps.push({ position: this.extremePosition(dim.id, +1), expected_by: `dim_${dim.id}_positive`, severity: 0.5 });
      }
      if (dim.negative_exemplars.length < 2) {
        gaps.push({ position: this.extremePosition(dim.id, -1), expected_by: `dim_${dim.id}_negative`, severity: 0.5 });
      }
    }

    return {
      dimensions: [...this.dimensions],
      dimension_count: this.dimensions.length,
      trace_count: traceCount,
      regions,
      self_region: selfRegion,
      gradient_field: gradientField,
      trajectories,
      confidence: Math.round(confidence * 1000) / 1000,
      coherence: Math.round(coherence * 1000) / 1000,
      gaps,
    };
  }

  // ═══════════════════════════════════════════
  // SELF MODEL (traces about self in same space)
  // ═══════════════════════════════════════════

  async getSelfRegion(): Promise<SpatialCluster | null> {
    const selfTraces = await this.db.query<Trace>(
      `SELECT * FROM trace WHERE source_type = 'self' AND archived = false`,
    );
    if (selfTraces.isErr() || selfTraces.value.length === 0) return null;

    const positions = selfTraces.value.map(t => t.position || []);
    const centroid = this.computeCentroid(positions);
    const maxDist = Math.max(0, ...selfTraces.value.map(t => this.distance(t.position || [], centroid)));

    return {
      centroid,
      traces: selfTraces.value.map(t => t.trace_id),
      radius: maxDist,
      shared_words: this.sharedWords(selfTraces.value.map(t => t.content)),
    };
  }

  /**
   * Create a self-trace. Positioned near relevant knowledge in concept space.
   */
  async createSelfTrace(content: string, confidence: number): Promise<void> {
    const position = await this.projectNewTrace(content);
    await this.db.create('trace', {
      trace_id: `TS${Date.now()}`,
      source_type: 'self',
      content: `[SELF] ${content}`,
      weight: confidence * 0.8,
      initial_weight: confidence * 0.8,
      freshness: 1.0,
      confidence,
      emotional_charge: 0.15, // self-knowledge is mildly positive
      reactivation_count: 0,
      last_reactivated_cycle: 0,
      reactivation_history: [],
      created_at_cycle: 0,
      position,
      velocity: new Array(position.length).fill(0),
      suppressed: false,
      archived: false,
    } as Record<string, unknown>);
  }

  // ═══════════════════════════════════════════
  // TRAJECTORIES (prediction in space)
  // ═══════════════════════════════════════════

  async recordTrajectory(fromTraceId: string, toTraceId: string, action: string): Promise<void> {
    const fromTrace = await this.db.query<Trace>('SELECT position FROM trace WHERE trace_id = $tid LIMIT 1', { tid: fromTraceId });
    const toTrace = await this.db.query<Trace>('SELECT position FROM trace WHERE trace_id = $tid LIMIT 1', { tid: toTraceId });

    if (fromTrace.isErr() || toTrace.isErr()) return;
    const fromPos = fromTrace.value[0]?.position || [];
    const toPos = toTrace.value[0]?.position || [];

    await this.db.create('trajectory', {
      from_trace_id: fromTraceId,
      to_trace_id: toTraceId,
      from_position: fromPos,
      to_position: toPos,
      action,
      confidence: 0.5,
      traversal_count: 1,
    } as Record<string, unknown>);
  }

  private async getTrajectories(): Promise<Trajectory[]> {
    const result = await this.db.query<Trajectory>('SELECT * FROM trajectory ORDER BY traversal_count DESC LIMIT 20');
    return result.isOk() ? result.value : [];
  }

  // ═══════════════════════════════════════════
  // GRADIENT FIELD (desire from affect)
  // ═══════════════════════════════════════════

  async computeGradientField(): Promise<GradientField> {
    const attractors: GradientField['attractors'] = [];
    const repellers: GradientField['repellers'] = [];

    // Success episodes → attractors (positions where good things happened)
    const successEpisodes = await this.db.query<Trace>(
      `SELECT position, weight FROM trace WHERE source_type = 'episode' AND emotional_charge > 0.1 AND archived = false LIMIT 10`,
    );
    if (successEpisodes.isOk()) {
      for (const t of successEpisodes.value) {
        if (t.position && t.position.length > 0) {
          attractors.push({ position: t.position, strength: t.weight * t.emotional_charge, source: 'success_episode' });
        }
      }
    }

    // Failed episodes → repellers
    const failedEpisodes = await this.db.query<Trace>(
      `SELECT position, weight FROM trace WHERE source_type = 'episode' AND emotional_charge < -0.1 AND archived = false LIMIT 10`,
    );
    if (failedEpisodes.isOk()) {
      for (const t of failedEpisodes.value) {
        if (t.position && t.position.length > 0) {
          repellers.push({ position: t.position, strength: t.weight * Math.abs(t.emotional_charge), source: 'failed_episode' });
        }
      }
    }

    // DRIVE 2: NOVELTY HUNGER (curiosity) — high-VOI regions
    const gaps = await this.db.query<Record<string, unknown>>(
      `SELECT description FROM knowledge_gap WHERE status = 'open' AND impact > 0.5 LIMIT 5`,
    );
    if (gaps.isOk()) {
      for (const g of gaps.value) {
        const pos = await this.projectNewTrace((g.description as string) || '');
        if (pos.length > 0) {
          attractors.push({ position: pos, strength: 0.3, source: 'curiosity' });
        }
      }
    }

    // DRIVE 3: UNCERTAINTY AVERSION — pull toward tight clusters (well-understood)
    const tightClusters = (await this.findClusters(3, 1.0)).filter(c => c.radius < 1.0);
    for (const cluster of tightClusters.slice(0, 3)) {
      attractors.push({ position: cluster.centroid, strength: 0.2, source: 'uncertainty_aversion' });
    }

    // DRIVE 4: MASTERY — pull toward domains with high success
    const masteryTraces = await this.db.query<Trace>(
      `SELECT position, weight, confidence FROM trace WHERE source_type = 'self' AND confidence > 0.7 AND archived = false LIMIT 5`,
    );
    if (masteryTraces.isOk()) {
      for (const t of masteryTraces.value) {
        if (t.position && t.position.length > 0) {
          attractors.push({ position: t.position, strength: 0.15, source: 'mastery_drive' });
        }
      }
    }

    // DRIVE 5: PREDICTION ACCURACY — push away from error-prone regions
    const errorTraces = await this.db.query<Trace>(
      `SELECT position, weight FROM trace WHERE source_type = 'signal' AND confidence < 0.3 AND archived = false LIMIT 5`,
    );
    if (errorTraces.isOk()) {
      for (const t of errorTraces.value) {
        if (t.position && t.position.length > 0) {
          repellers.push({ position: t.position, strength: 0.2, source: 'prediction_accuracy' });
        }
      }
    }

    return { attractors, repellers };
  }

  /**
   * Compute desire vector at a position: sum of 5 drives.
   * Pain avoidance, novelty hunger, uncertainty aversion, mastery, prediction accuracy.
   */
  desireVector(position: number[], field: GradientField): number[] {
    const len = position.length;
    if (len === 0) return [];

    const vector = new Array(len).fill(0);

    for (const a of field.attractors) {
      for (let d = 0; d < len; d++) {
        const diff = (a.position[d] ?? 0) - (position[d] ?? 0);
        const dist = this.distance(position, a.position);
        const pull = a.strength / (1 + dist);
        vector[d] += diff * pull * 0.1;
      }
    }

    for (const r of field.repellers) {
      for (let d = 0; d < len; d++) {
        const diff = (position[d] ?? 0) - (r.position[d] ?? 0);
        const dist = this.distance(position, r.position);
        const push = r.strength / (1 + dist);
        vector[d] += diff * push * 0.1;
      }
    }

    return vector;
  }

  // ═══════════════════════════════════════════
  // FORGETTING = LOSS OF RESOLUTION & SEPARABILITY
  // ═══════════════════════════════════════════

  /**
   * Forgetting is NOT drift to origin. It's drift toward nearest ATTRACTOR.
   * "I don't remember the specific ball, but I remember roundness."
   *
   * Traces lose distinctiveness → merge into nearest schema/cluster centroid.
   * When a trace reaches its attractor and is weak → archived (absorbed).
   */
  async drift(driftRate = 0.01): Promise<{ merged: number }> {
    const archiveThreshold = this.config.get('kernel.archive_threshold');
    await this.db.execute(
      `RETURN fn::drift_traces($rate, $threshold, $cycle)`,
      { rate: driftRate, threshold: archiveThreshold, cycle: 0 },
    );
    return { merged: 0 }; // exact count not needed for SLOW cadence
  }

  // ═══════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════

  private extremePosition(dimId: number, direction: number): number[] {
    const pos = new Array(this.dimensions.length).fill(0);
    if (dimId < pos.length) pos[dimId] = direction;
    return pos;
  }

  private async getTraceCount(): Promise<number> {
    const r = await this.db.query<{ c: number }>('SELECT count() AS c FROM trace WHERE archived = false GROUP ALL');
    return r.isOk() && r.value.length > 0 ? r.value[0].c : 0;
  }

  /**
   * Load dimensions from DB on startup.
   */
  async loadDimensions(): Promise<void> {
    const result = await this.db.query<any>(
      `SELECT * FROM concept_dimension ORDER BY dimension_id`,
    );
    if (result.isOk()) {
      for (const d of result.value) {
        this.dimensions.push({
          id: d.dimension_id,
          born_at_cycle: d.born_at_cycle,
          born_from_conflict: { trace_a: d.born_from_a, trace_b: d.born_from_b },
          positive_exemplars: d.positive_exemplars || [],
          negative_exemplars: d.negative_exemplars || [],
          label: d.label,
          temporal_tier: d.temporal_tier || 'slow',
          variance: d.variance || 0,
          usage_count: d.usage_count || 0,
        });
        if (d.dimension_id >= this.dimCounter) this.dimCounter = d.dimension_id + 1;
      }
      if (this.dimensions.length > 0) {
        this.logger.log(`Loaded ${this.dimensions.length} dimensions from DB`);
      }
    }
  }
}
