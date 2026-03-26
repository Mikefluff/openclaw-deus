import { Injectable, Logger } from '@nestjs/common';
import { SurrealService } from '../../database/surreal.service';
import { CognitiveConfigService } from '../../cognitive/cognitive-config.service';
import { Dimension, SpatialConflict, SpatialMovement, SpatialCluster } from './concept-space.types';
import { Trace } from '../kernel.types';

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

const NEGATION_WORDS = ['не', 'нет', 'без', 'никогда', 'not', 'no', 'without', 'never', 'unlike'];
const CONFLICT_RADIUS = 2.0;
const SEPARATION_THRESHOLD = 0.5;

@Injectable()
export class ConceptSpaceService {
  private readonly logger = new Logger(ConceptSpaceService.name);
  private dimensions: Dimension[] = [];
  private dimCounter = 0;

  constructor(
    private readonly db: SurrealService,
    private readonly config: CognitiveConfigService,
  ) {}

  getDimensionCount(): number { return this.dimensions.length; }
  getDimensions(): Dimension[] { return [...this.dimensions]; }

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
    // Get active traces with positions
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
  // CONFLICT DETECTION
  // ═══════════════════════════════════════════

  /**
   * Check if two traces conflict: same region + opposing content.
   * Opposing = negation detected between contents.
   */
  detectConflict(traceA: Trace, traceB: Trace): SpatialConflict | null {
    const posA = traceA.position || [];
    const posB = traceB.position || [];
    const dist = this.distance(posA, posB);

    // Same region? (within conflict radius)
    if (dist > CONFLICT_RADIUS && posA.length > 0) return null;

    // Opposing content?
    if (!this.hasOpposition(traceA.content, traceB.content)) return null;

    // Already separated by existing dimension?
    for (const dim of this.dimensions) {
      const aVal = posA[dim.id] ?? 0;
      const bVal = posB[dim.id] ?? 0;
      if (Math.abs(aVal - bVal) > SEPARATION_THRESHOLD) return null;
    }

    return {
      trace_a_id: traceA.trace_id,
      trace_b_id: traceB.trace_id,
      trace_a_content: traceA.content,
      trace_b_content: traceB.content,
      distance: dist,
      severity: dist > 0 ? 1 / dist : 10,
      resolved: false,
    };
  }

  /**
   * Detect opposition between two text contents.
   * One contains negation of what the other states.
   */
  private hasOpposition(contentA: string, contentB: string): boolean {
    const a = contentA.toLowerCase();
    const b = contentB.toLowerCase();

    // One has negation, other doesn't, but share significant words
    for (const neg of NEGATION_WORDS) {
      const aHas = a.includes(neg);
      const bHas = b.includes(neg);
      if (aHas !== bHas) {
        // One negated, one not — check if they share topic
        const wordsA = new Set(a.split(/\s+/).filter(w => w.length > 3 && !NEGATION_WORDS.includes(w)));
        const wordsB = new Set(b.split(/\s+/).filter(w => w.length > 3 && !NEGATION_WORDS.includes(w)));
        let overlap = 0;
        for (const w of wordsA) { if (wordsB.has(w)) overlap++; }
        if (overlap >= 1) return true; // share topic + one negated
      }
    }

    // Explicit antonyms (круглый/угловатый, катится/не катится)
    const antonymPairs = [
      ['круглый', 'угловатый'], ['круглая', 'угловатая'], ['круглое', 'угловатое'],
      ['катится', 'не катится'], ['гладкий', 'шершавый'],
      ['большой', 'маленький'], ['тяжёлый', 'лёгкий'],
      ['round', 'angular'], ['rolls', 'doesn\'t roll'],
    ];
    for (const [w1, w2] of antonymPairs) {
      if ((a.includes(w1) && b.includes(w2)) || (a.includes(w2) && b.includes(w1))) {
        return true;
      }
    }

    return false;
  }

  // ═══════════════════════════════════════════
  // DIMENSION BIRTH
  // ═══════════════════════════════════════════

  /**
   * Birth a new dimension from a conflict. The dimension separates
   * the conflicting traces along a new axis.
   */
  async birthDimension(conflict: SpatialConflict, cycle: number): Promise<Dimension> {
    const dim: Dimension = {
      id: this.dimCounter++,
      born_at_cycle: cycle,
      born_from_conflict: { trace_a: conflict.trace_a_id, trace_b: conflict.trace_b_id },
      positive_exemplars: [conflict.trace_a_id],
      negative_exemplars: [conflict.trace_b_id],
      label: undefined,
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
      variance: dim.variance,
      usage_count: dim.usage_count,
    } as any);

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
   * Compute initial position for a new trace based on content similarity
   * to existing traces. New trace is placed NEAR similar existing traces.
   */
  async projectNewTrace(content: string): Promise<number[]> {
    if (this.dimensions.length === 0) return []; // no dimensions yet

    // Find similar existing traces
    const active = await this.db.query<Trace>(
      `SELECT trace_id, content, position FROM trace WHERE archived = false AND array::len(position) > 0 LIMIT 30`,
    );
    if (active.isErr() || active.value.length === 0) {
      return new Array(this.dimensions.length).fill(0);
    }

    // Content similarity → weighted average of neighbor positions
    const contentWords = new Set(content.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    let totalWeight = 0;
    const position = new Array(this.dimensions.length).fill(0);

    for (const trace of active.value) {
      const traceWords = new Set((trace.content || '').toLowerCase().split(/\s+/).filter(w => w.length > 3));
      let overlap = 0;
      for (const w of contentWords) { if (traceWords.has(w)) overlap++; }
      const similarity = contentWords.size > 0 ? overlap / contentWords.size : 0;

      if (similarity > 0.2 && trace.position) {
        const weight = similarity;
        totalWeight += weight;
        for (let d = 0; d < Math.min(position.length, trace.position.length); d++) {
          position[d] += (trace.position[d] || 0) * weight;
        }
      }
    }

    // Normalize
    if (totalWeight > 0) {
      for (let d = 0; d < position.length; d++) {
        position[d] /= totalWeight;
      }
    }

    return position;
  }

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

  /**
   * Apply movement to a trace in concept space.
   */
  async applyMovement(traceId: string, delta: number[]): Promise<void> {
    const trace = await this.db.query<Trace>(
      `SELECT position, velocity FROM trace WHERE trace_id = $tid LIMIT 1`,
      { tid: traceId },
    );
    if (trace.isErr() || trace.value.length === 0) return;

    const pos = [...(trace.value[0].position || [])];
    const vel = [...(trace.value[0].velocity || [])];

    // Apply delta with momentum
    for (let d = 0; d < Math.max(pos.length, delta.length); d++) {
      if (d >= pos.length) { pos.push(0); vel.push(0); }
      const d_val = delta[d] ?? 0;
      vel[d] = vel[d] * 0.7 + d_val * 0.3; // momentum
      pos[d] += vel[d];
    }

    await this.db.execute(
      `UPDATE trace SET position = $pos, velocity = $vel WHERE trace_id = $tid`,
      { pos, vel, tid: traceId },
    );
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

      // Find traces at extremes of this dimension
      const positive = await this.db.query<Trace>(
        `SELECT content FROM trace WHERE archived = false AND array::len(position) > $dimId
         ORDER BY position[$dimId] DESC LIMIT 3`,
        { dimId: dim.id },
      );
      const negative = await this.db.query<Trace>(
        `SELECT content FROM trace WHERE archived = false AND array::len(position) > $dimId
         ORDER BY position[$dimId] ASC LIMIT 3`,
        { dimId: dim.id },
      );

      if (positive.isErr() || negative.isErr()) continue;
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
          `UPDATE concept_dimension SET label = $label, positive_exemplars = $pos, negative_exemplars = $neg WHERE dimension_id = $did`,
          { label: dim.label, pos: dim.positive_exemplars, neg: dim.negative_exemplars, did: dim.id },
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
