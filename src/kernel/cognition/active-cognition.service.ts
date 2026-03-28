import { Injectable, Logger } from '@nestjs/common';
import { SurrealService } from '../../database/surreal.service';
import { TraceGraphService } from '../memory/trace-graph.service';
import { CausalGraphService } from '../../cognitive/causal-graph.service';
import { Signal } from '../kernel.types';

/**
 * ActiveCognitionService: Higher-order cognitive processes for idle reflection.
 *
 * 1. EPISODIC REPLAY (dreaming): replay past episodes through trace graph
 *    to strengthen important paths. Like the brain during sleep.
 *
 * 2. CURIOSITY: intrinsic motivation from VOI (Value of Information).
 *    High uncertainty + high expected info gain → curiosity signal.
 *
 * 3. ACTIVE INFERENCE: "if X and Y then Z" — deductive reasoning
 *    during reflection, not just reporting state changes.
 *
 * 4. SCHEMA DETECTION: find recurring patterns across episodes
 *    and abstract them into general rules.
 *
 * These are INTERNAL processes — no LLM needed.
 */
@Injectable()
export class ActiveCognitionService {
  private readonly logger = new Logger(ActiveCognitionService.name);
  private replayIndex = 0;

  constructor(
    private readonly db: SurrealService,
    private readonly traceGraph: TraceGraphService,
    private readonly causalGraph: CausalGraphService,
  ) {}

  /**
   * EPISODIC REPLAY: pick a past episode and "re-live" it through the trace graph.
   * Strengthens traces involved in important episodes. Like dreaming.
   */
  async replayEpisode(cycle: number): Promise<Signal[]> {
    const signals: Signal[] = [];

    // Get episodes ordered by importance (failures first — learn from mistakes)
    const episodes = await this.db.query<any>(
      `SELECT episode_id, summary, outcome, intention_id, lessons, created_at
       FROM episode ORDER BY outcome ASC, created_at DESC
       LIMIT 20`,
    );
    if (episodes.isErr() || episodes.value.length === 0) return signals;

    // Round-robin through episodes
    const ep = episodes.value[this.replayIndex % episodes.value.length];
    this.replayIndex++;

    // Reactivate traces related to this episode
    const relatedTraces = await this.db.query<any>(
      `SELECT trace_id FROM trace WHERE source_id = $eid OR content CONTAINS $summary AND archived = false LIMIT 5`,
      { eid: ep.episode_id, summary: (ep.summary || '').slice(0, 30) },
    );

    if (relatedTraces.isOk()) {
      for (const t of relatedTraces.value) {
        await this.traceGraph.reactivate(t.trace_id, 0.3, 0);
      }
    }

    // Generate replay signal
    const charge = ep.outcome === 'failure' ? -0.3 : ep.outcome === 'success' ? 0.2 : 0;
    signals.push({
      agent_id: 'dreaming',
      agent_rank: 0, // lowest rank — background process
      type: 'perception',
      content: `Replay [${ep.outcome}]: ${ep.summary || ep.episode_id}`,
      payload: { episode_id: ep.episode_id, outcome: ep.outcome, replay: true },
      confidence: 0.4, // low confidence — it's a memory, not current perception
      novelty_cost: 0, // replay is free — no new info
      used_slow_path: false,
      targets: relatedTraces.isOk() ? relatedTraces.value.map((t: any) => t.trace_id) : [],
      cycle,
    });

    // Process lessons: reinforce knowledge paths
    for (const lesson of ep.lessons || []) {
      signals.push({
        agent_id: 'dreaming',
        agent_rank: 0,
        type: 'prediction',
        content: `Lesson recalled: ${lesson.content}`,
        payload: { lesson, from_episode: ep.episode_id },
        confidence: lesson.confidence || 0.5,
        novelty_cost: 0,
        used_slow_path: false,
        targets: [],
        cycle,
      });
    }

    return signals;
  }

  /**
   * CURIOSITY: compute intrinsic motivation from Value of Information.
   * Generates signals about what the system WANTS to know.
   */
  async generateCuriosity(cycle: number): Promise<Signal[]> {
    const signals: Signal[] = [];

    try {
      const graph = await this.causalGraph.build();
      if (graph.isErr() || graph.value.nodes.length === 0) return signals;

      const topVOI = this.causalGraph.getTopVOIBeliefs(graph.value, 3);

      for (const voi of topVOI) {
        if (voi.voi > 0.15) {
          signals.push({
            agent_id: 'curiosity',
            agent_rank: 0,
            type: 'affect',
            content: `Curious about: "${voi.label}" (VOI=${voi.voi.toFixed(2)}) — resolving this would improve predictions`,
            payload: {
              belief_id: voi.beliefId,
              voi: voi.voi,
              charge: 0.2, // curiosity is mildly positive
              curiosity: true,
            },
            confidence: 0.5,
            novelty_cost: 0.1,
            used_slow_path: false,
            targets: [],
            cycle,
          });
        }
      }
    } catch { /* causal graph may be empty */ }

    // Also curious about knowledge gaps
    const gaps = await this.db.query<any>(
      `SELECT description, domain, impact FROM knowledge_gap WHERE status = 'open' ORDER BY impact DESC LIMIT 3`,
    );
    if (gaps.isOk()) {
      for (const gap of gaps.value) {
        if (gap.impact > 0.6) {
          signals.push({
            agent_id: 'curiosity',
            agent_rank: 0,
            type: 'affect',
            content: `Knowledge gap: "${gap.description}" (impact=${gap.impact})`,
            payload: { gap, domain: gap.domain, charge: 0.15, curiosity: true },
            confidence: 0.6,
            novelty_cost: 0.05,
            used_slow_path: false,
            targets: [],
            cycle,
          });
        }
      }
    }

    return signals;
  }

  /**
   * ACTIVE INFERENCE: deductive reasoning from active traces.
   * "If X is true AND Y is true, then Z should follow."
   * Uses graph structure: if A activates B and B activates C, infer A→C.
   */
  async activeInference(cycle: number): Promise<Signal[]> {
    const signals: Signal[] = [];

    // Find strong activation chains (DB-side filtering via stored proc)
    const chains = await this.db.query<any>(
      `RETURN fn::active_inference($threshold, $limit)`,
      { threshold: 0.3, limit: 10 },
    );

    if (chains.isErr() || chains.value.length === 0) return signals;
    for (const chain of chains.value) {
      // Normalize field names: stored proc returns source_id/mid_id/mid_weight/first_weight
      const aId = chain.source_id ?? chain.a_id;
      const bId = chain.mid_id ?? chain.b_id;
      const premiseContent = chain.source_content ?? chain.premise_a;
      const strength = chain.first_weight ?? chain.strength ?? 0;

      if (!aId || !bId) continue;

      // mid_weight is now included in stored proc result — no follow-up query needed
      const cWeight = chain.mid_weight ?? 0;
      const expectedWeight = strength * 0.7; // expected from edge strength

      if (cWeight < expectedWeight - 0.1) {
        // Conclusion weaker than expected → inference: should be stronger
        signals.push({
          agent_id: 'inference',
          agent_rank: 0,
          type: 'prediction',
          content: `Inference: "${premiseContent?.slice(0, 40)}" strongly implies (edge=${strength.toFixed(2)}) but conclusion is weak (${cWeight.toFixed(2)})`,
          payload: {
            premise_trace: aId,
            conclusion_trace: bId,
            edge_strength: strength,
            expected_weight: expectedWeight,
            actual_weight: cWeight,
            inference: true,
          },
          confidence: strength * 0.6,
          novelty_cost: 0.15,
          used_slow_path: false,
          targets: [aId, bId],
          cycle,
        });
      }
    }

    return signals;
  }

  /**
   * SCHEMA DETECTION + ABSTRACTION EMERGENCE.
   *
   * How children learn: see ball (round), plate (round), wheel (round)
   * → notice "round" co-occurs → abstract "roundness" as its own concept.
   *
   * When traces co-activate frequently:
   * 1. Detect the pattern (schema signal)
   * 2. If frequency > threshold: CREATE an abstract trace that represents the pattern
   * 3. Link all instances to the abstract trace → it becomes a HUB
   * 4. The abstract trace is now a concept that can be retrieved independently
   *
   * Abstractions are NOT taught — they EMERGE from experience.
   */
  async detectSchemas(cycle: number): Promise<Signal[]> {
    const signals: Signal[] = [];

    // Find clusters of traces that frequently co-activate (DB-side filtering)
    const hotEdges = await this.db.query<any>(
      `RETURN fn::detect_schemas_native($min, $limit)`,
      { min: 2, limit: 10 },
    );

    if (hotEdges.isErr() || hotEdges.value.length === 0) return signals;

    for (const edge of hotEdges.value) {
      // Schema signal for any pattern
      if (edge.co_activation_count > 3) {
        signals.push({
          agent_id: 'schema',
          agent_rank: 0,
          type: 'strategy',
          content: `Pattern: "${(edge.a_content || '').slice(0, 40)}" → "${(edge.b_content || '').slice(0, 40)}" (${edge.co_activation_count}x)`,
          payload: {
            schema: true,
            a_trace: edge.a_id,
            b_trace: edge.b_id,
            strength: edge.weight,
            frequency: edge.co_activation_count,
          },
          confidence: Math.min(0.9, edge.co_activation_count * 0.1),
          novelty_cost: 0.05,
          used_slow_path: false,
          targets: [edge.a_id, edge.b_id],
          cycle,
        });
      }

      // ABSTRACTION EMERGENCE: high-frequency pattern → create abstract hub trace
      if (edge.co_activation_count > 5) {
        await this.materializeAbstraction(edge, cycle);
      }
    }

    // Also check for multi-trace convergence (3+ traces with shared words)
    await this.detectPropertyAbstractions(cycle, signals);

    return signals;
  }

  /**
   * Materialize an abstraction: create a HUB trace from a strong pattern.
   * The hub connects all instances, becoming a retrievable concept.
   */
  private async materializeAbstraction(edge: any, cycle: number): Promise<void> {
    // Name abstraction by edge co-activation strength, not word overlap
    const abstractionName = `abstract_${edge.co_activation_count}_cycle${cycle}`;

    // Check if this abstraction already exists
    const existing = await this.db.query<any>(
      `SELECT trace_id FROM trace WHERE source_type = 'signal' AND content CONTAINS $name AND archived = false LIMIT 1`,
      { name: `[ABSTRACT] ${abstractionName}` },
    );
    if (existing.isOk() && existing.value.length > 0) return; // already materialized

    // CREATE the abstract trace — it IS the concept
    const result = await this.traceGraph.createTrace({
      source_type: 'signal', // abstract concepts are signal-born
      content: `[ABSTRACT] ${abstractionName} (emerged from ${edge.co_activation_count} co-activations)`,
      initial_weight: 0.7,
      confidence: Math.min(0.9, edge.co_activation_count * 0.08),
      emotional_charge: 0.1, // abstractions have mild positive charge (understanding feels good)
    });

    if (result.isOk()) {
      const abstractId = result.value.trace_id;
      // Link instances to the abstract hub
      await this.traceGraph.link(edge.a_id, abstractId, 'activates', 0.5);
      await this.traceGraph.link(edge.b_id, abstractId, 'activates', 0.5);
      await this.traceGraph.link(abstractId, edge.a_id, 'activates', 0.3); // bidirectional
      await this.traceGraph.link(abstractId, edge.b_id, 'activates', 0.3);

      this.logger.log(`ABSTRACTION EMERGED: "${abstractionName}" from ${edge.co_activation_count} co-activations`);
    }
  }

  /**
   * Detect property abstractions from GRAPH CO-ACTIVATION PATTERNS.
   *
   * No text processing! The child doesn't split words.
   * Instead: traces that share many co-activation edges form a convergence hub.
   * High co-activation count across 3+ traces = emergent property/category.
   *
   * Like a child seeing ball+plate+wheel co-activating with the same
   * downstream traces → abstracts the shared activation pattern.
   */
  private async detectPropertyAbstractions(cycle: number, signals: Signal[]): Promise<void> {
    // Find traces that are hubs of co-activation (connected to 3+ other traces via strong edges)
    const hubs = await this.db.query<any>(
      `SELECT in AS hub_id, count() AS edge_count, math::sum(weight) AS total_weight
       FROM activates
       WHERE weight > 0.3
       GROUP BY in
       HAVING count() >= 3
       ORDER BY count() DESC
       LIMIT 10`,
    );
    if (hubs.isErr() || hubs.value.length === 0) return;

    for (const hub of hubs.value) {
      const hubId = hub.hub_id;
      if (!hubId) continue;

      // Check if property abstraction already exists for this hub
      const existing = await this.db.query<any>(
        `SELECT trace_id FROM trace WHERE content CONTAINS $pattern AND archived = false LIMIT 1`,
        { pattern: `[PROPERTY] hub_${hub.edge_count}` },
      );
      if (existing.isOk() && existing.value.length > 0) continue;

      const propertyName = `hub_${hub.edge_count}_cycle${cycle}`;

      // Create property abstraction from graph convergence
      const result = await this.traceGraph.createTrace({
        source_type: 'signal',
        content: `[PROPERTY] ${propertyName} (${hub.edge_count} co-activations, strength=${(hub.total_weight as number).toFixed(2)})`,
        initial_weight: 0.5,
        confidence: Math.min(0.8, hub.edge_count * 0.15),
        emotional_charge: 0.05,
      });

      if (result.isOk()) {
        // Link the hub trace to the new property abstraction
        await this.traceGraph.link(hubId, result.value.trace_id, 'activates', 0.4);
        await this.traceGraph.link(result.value.trace_id, hubId, 'activates', 0.2);

        this.logger.log(`PROPERTY EMERGED: "${propertyName}" (${hub.edge_count} co-activations)`);

        signals.push({
          agent_id: 'schema',
          agent_rank: 0,
          type: 'strategy',
          content: `Property "${propertyName}" emerged from ${hub.edge_count} co-activations`,
          payload: { property: propertyName, instances: hub.edge_count, abstraction: true },
          confidence: 0.6,
          novelty_cost: 0.2,
          used_slow_path: false,
          targets: [result.value.trace_id],
          cycle,
        });
      }
    }
  }
}
