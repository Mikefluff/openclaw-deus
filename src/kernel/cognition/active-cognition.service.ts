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
      `SELECT episode_id, summary, outcome, intention_id, lessons
       FROM episode ORDER BY
         IF outcome = 'failure' THEN 0 ELSE IF outcome = 'partial_success' THEN 1 ELSE 2 END
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

    // Find pairs of strongly connected traces
    const chains = await this.db.query<any>(
      `SELECT
        in.content AS premise_a,
        out.content AS conclusion,
        weight AS strength,
        in.trace_id AS a_id,
        out.trace_id AS b_id
       FROM activates
       WHERE weight > 0.5
         AND in.archived = false AND out.archived = false
         AND in.weight > 0.3 AND out.weight > 0.3
       ORDER BY weight DESC LIMIT 5`,
    );

    if (chains.isErr() || chains.value.length === 0) return signals;

    for (const chain of chains.value) {
      // Check if conclusion's weight is lower than premise suggests
      // If strong edge but weak conclusion → inference opportunity
      const conclusionTrace = await this.db.query<any>(
        'SELECT weight, confidence FROM trace WHERE trace_id = $tid LIMIT 1',
        { tid: chain.b_id },
      );

      if (conclusionTrace.isOk() && conclusionTrace.value.length > 0) {
        const cWeight = conclusionTrace.value[0].weight;
        const expectedWeight = chain.strength * 0.7; // expected from edge strength

        if (cWeight < expectedWeight - 0.1) {
          // Conclusion weaker than expected → inference: should be stronger
          signals.push({
            agent_id: 'inference',
            agent_rank: 0,
            type: 'prediction',
            content: `Inference: "${chain.premise_a?.slice(0, 40)}" strongly implies "${chain.conclusion?.slice(0, 40)}" (edge=${chain.strength.toFixed(2)}) but conclusion is weak (${cWeight.toFixed(2)})`,
            payload: {
              premise_trace: chain.a_id,
              conclusion_trace: chain.b_id,
              edge_strength: chain.strength,
              expected_weight: expectedWeight,
              actual_weight: cWeight,
              inference: true,
            },
            confidence: chain.strength * 0.6,
            novelty_cost: 0.15,
            used_slow_path: false,
            targets: [chain.a_id, chain.b_id],
            cycle,
          });
        }
      }
    }

    return signals;
  }

  /**
   * SCHEMA DETECTION: find recurring patterns across traces.
   * If multiple traces with similar content have similar edge patterns → schema.
   */
  async detectSchemas(cycle: number): Promise<Signal[]> {
    const signals: Signal[] = [];

    // Find traces that are frequently co-activated (high co_activation_count)
    const hotEdges = await this.db.query<any>(
      `SELECT
        in.content AS a_content,
        out.content AS b_content,
        co_activation_count,
        weight,
        in.trace_id AS a_id,
        out.trace_id AS b_id
       FROM activates
       WHERE co_activation_count > 3
       ORDER BY co_activation_count DESC LIMIT 5`,
    );

    if (hotEdges.isErr() || hotEdges.value.length === 0) return signals;

    for (const edge of hotEdges.value) {
      if (edge.co_activation_count > 5) {
        signals.push({
          agent_id: 'schema',
          agent_rank: 0,
          type: 'strategy',
          content: `Pattern: "${edge.a_content?.slice(0, 40)}" → "${edge.b_content?.slice(0, 40)}" (${edge.co_activation_count} co-activations)`,
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
    }

    return signals;
  }
}
