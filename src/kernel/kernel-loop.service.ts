import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../common/types/result.types';
import {
  Signal, CommitDelta, CommitType, KernelOutput,
  StabilizationState, RecursionGuard, PhenomenalState, TimeSense,
} from './kernel.types';
import { TraceGraphService } from './memory/trace-graph.service';
import { CommitKernelService } from './commit/commit-kernel.service';

/**
 * KernelLoop: Self-recursive inner dialogue.
 *
 * Input → agents signal → traces activate → convergence → commit
 *       → commit changes world → NEW signals → LOOP
 *       → until ENERGY drops below threshold (not counter)
 *
 * Output = remainder after stabilization:
 *   what changed, what became clearer, what remains tense, what actions matured.
 *
 * Guardrails:
 * - No 2 consecutive self_model commits without new independent evidence
 * - Each iteration must reduce uncertainty OR increase explanatory power
 * - 3 cycles of only internal confirmations without orthogonal signals = suspected hallucination
 */

const MAX_ITERATIONS = 12;           // hard ceiling
const ENERGY_STABLE_THRESHOLD = 0.1; // below this = converged
const HALLUCINATION_CYCLES = 3;      // cycles without orthogonal signals → stop

export interface CognitiveAgent {
  id: string;
  rank: number;
  process(input: string, context: AgentContext): Promise<Signal[]>;
}

export interface AgentContext {
  cycle: number;
  recent_commits: CommitDelta[];
  time_sense: TimeSense;
  active_traces: Array<{ trace_id: string; content: string; weight: number }>;
  phenomenal_state: PhenomenalState | null;
  is_reflection: boolean;       // true on iteration 1+: system is reflecting on itself
}

@Injectable()
export class KernelLoopService {
  private readonly logger = new Logger(KernelLoopService.name);
  private agents: CognitiveAgent[] = [];

  constructor(
    private readonly traceGraph: TraceGraphService,
    private readonly commitKernel: CommitKernelService,
  ) {}

  registerAgent(agent: CognitiveAgent): void {
    this.agents.push(agent);
    this.agents.sort((a, b) => a.rank - b.rank);
    this.logger.log(`Agent registered: ${agent.id} (rank ${agent.rank})`);
  }

  /**
   * THINK: the core recursive loop.
   * Not "process message" — "experience input and stabilize".
   */
  async think(input: string): Promise<Result<KernelOutput, DomainError>> {
    const allCommits: CommitDelta[] = [];
    let totalSignals = 0;
    let phenomenalState: PhenomenalState | null = null;

    // Recursion guardrails
    const guard: RecursionGuard = {
      consecutive_self_model_commits: 0,
      uncertainty_trend: [],
      orthogonal_signal_deficit: 0,
    };

    // Energy tracking for stabilization
    let prevEnergy = Infinity;

    this.logger.log(`Kernel.think("${input.slice(0, 50)}...")`);

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const cycle = this.traceGraph.tick();
      const isReflection = iteration > 0;

      // Build context (what system knows about itself right now)
      const context = await this.buildContext(cycle, allCommits, phenomenalState, isReflection);

      // What to process: raw input OR self-reflection
      const iterationInput = isReflection
        ? this.buildReflectionInput(allCommits.slice(-3), context.time_sense, phenomenalState)
        : input;

      // --- Run all agents in parallel ---
      const signals = await this.runAgents(iterationInput, context, cycle);
      totalSignals += signals.length;

      // --- Guardrail: check for hallucination loop ---
      const hasOrthogonal = this.hasOrthogonalSignals(signals, allCommits);
      if (isReflection && !hasOrthogonal) {
        guard.orthogonal_signal_deficit++;
        if (guard.orthogonal_signal_deficit >= HALLUCINATION_CYCLES) {
          this.logger.warn(`Cycle ${cycle}: suspected hallucination loop — ${HALLUCINATION_CYCLES} cycles without orthogonal signals`);
          break;
        }
      } else {
        guard.orthogonal_signal_deficit = 0;
      }

      // --- Feed into commit kernel ---
      const commitResult = await this.commitKernel.processCycle(signals);
      if (commitResult.isErr()) break;

      const cycleCommits = commitResult.value;

      // --- Guardrail: no 2 consecutive self_model commits without new evidence ---
      for (const c of cycleCommits) {
        if (c.type === 'self_model') {
          guard.consecutive_self_model_commits++;
          if (guard.consecutive_self_model_commits > 1) {
            this.logger.warn(`Cycle ${cycle}: blocked second consecutive self_model commit without new evidence`);
            cycleCommits.splice(cycleCommits.indexOf(c), 1);
          }
        } else {
          guard.consecutive_self_model_commits = 0;
        }
      }

      allCommits.push(...cycleCommits);

      // --- Compute stabilization energy ---
      const stabilization = this.computeStabilization(cycleCommits, allCommits, prevEnergy);
      prevEnergy = stabilization.energy;

      // Track uncertainty trend
      guard.uncertainty_trend.push(stabilization.energy);
      if (guard.uncertainty_trend.length > 5) guard.uncertainty_trend.shift();

      // --- Guardrail: uncertainty must decrease ---
      if (guard.uncertainty_trend.length >= 3 && isReflection) {
        const recent = guard.uncertainty_trend.slice(-3);
        const increasing = recent[2] > recent[1] && recent[1] > recent[0];
        if (increasing) {
          this.logger.warn(`Cycle ${cycle}: uncertainty increasing over 3 cycles — stopping to prevent runaway`);
          break;
        }
      }

      // Apply trace forgetting
      await this.traceGraph.forget();

      // Capture phenomenal state
      phenomenalState = await this.capturePhenomenalState(cycle, allCommits);

      this.logger.log(
        `Cycle ${cycle}: ${signals.length} signals, ${cycleCommits.length} commits, ` +
        `energy=${stabilization.energy.toFixed(3)} (threshold=${ENERGY_STABLE_THRESHOLD})`,
      );

      // --- Energy-based stop condition ---
      if (stabilization.stable) {
        this.logger.log(`Cycle ${cycle}: STABLE after ${iteration + 1} iterations (energy=${stabilization.energy.toFixed(3)})`);
        break;
      }
    }

    // Final time sense
    const timeSense = await this.commitKernel.computeTimeSense();
    if (!phenomenalState) {
      phenomenalState = await this.capturePhenomenalState(this.traceGraph.getCycle(), allCommits);
    }

    // Build output: remainder after stabilization
    const output = this.buildOutput(allCommits, timeSense, phenomenalState);

    this.logger.log(
      `Kernel: ${output.converged ? 'CONVERGED' : 'MAX_ITER'} — ` +
      `${allCommits.length} commits, dilation=${timeSense.dilation}`,
    );

    return ok(output);
  }

  // ═══════════════════════════════════════════
  // PRIVATE
  // ═══════════════════════════════════════════

  private async runAgents(input: string, context: AgentContext, cycle: number): Promise<Signal[]> {
    const signalArrays = await Promise.all(
      this.agents.map(agent =>
        agent.process(input, context).catch((e) => {
          this.logger.warn(`Agent ${agent.id} failed: ${e}`);
          return [] as Signal[];
        }),
      ),
    );

    return signalArrays.flat()
      .filter(s => s.confidence >= 0.1)
      .map(s => ({ ...s, cycle }));
  }

  /**
   * Energy-based stabilization criterion.
   * NOT a counter. Looks at:
   * - convergence pressure drop
   * - absence of new high-energy traces
   * - small delta between consecutive commits
   * - prediction error trend
   * - no pending escalations
   */
  private computeStabilization(
    cycleCommits: CommitDelta[],
    allCommits: CommitDelta[],
    prevEnergy: number,
  ): StabilizationState {
    if (cycleCommits.length === 0) {
      return { convergence_pressure: 0, new_high_energy_traces: 0, commit_delta_magnitude: 0, prediction_error_trend: 0, pending_escalations: 0, energy: 0, stable: true };
    }

    // Convergence pressure: total energy of this cycle's commits
    const convergencePressure = cycleCommits.reduce((s, c) => s + c.energy, 0) / cycleCommits.length;

    // New high-energy traces
    const newHighEnergy = cycleCommits.filter(c => c.novelty_cost > 0.7).length;

    // Delta between this and last commit
    const lastCommit = allCommits.length > 1 ? allCommits[allCommits.length - 2] : null;
    const commitDelta = lastCommit
      ? Math.abs(cycleCommits[0].energy - lastCommit.energy)
      : cycleCommits[0].energy;

    // Prediction error trend
    const recentErrors = allCommits.slice(-5).map(c => c.prediction_error);
    const predTrend = recentErrors.length > 1
      ? recentErrors[recentErrors.length - 1] - recentErrors[0]
      : 0;

    // Pending escalations
    const escalations = cycleCommits.filter(c => c.is_escalation).length;

    // Composite energy
    const energy = convergencePressure * 0.3
      + newHighEnergy * 0.2
      + commitDelta * 0.2
      + Math.max(0, predTrend) * 0.15
      + escalations * 0.15;

    return {
      convergence_pressure: convergencePressure,
      new_high_energy_traces: newHighEnergy,
      commit_delta_magnitude: commitDelta,
      prediction_error_trend: predTrend,
      pending_escalations: escalations,
      energy: Math.round(energy * 1000) / 1000,
      stable: energy < ENERGY_STABLE_THRESHOLD,
    };
  }

  /**
   * Check if signals contain NEW orthogonal information (not self-confirmation).
   */
  private hasOrthogonalSignals(signals: Signal[], previousCommits: CommitDelta[]): boolean {
    const previousContents = new Set(previousCommits.map(c => c.changes.traces_activated).flat());
    return signals.some(s =>
      s.targets.some(t => !previousContents.has(t)) || s.novelty_cost > 0.5,
    );
  }

  /**
   * Capture phenomenal state: what the system "experiences" right now.
   */
  private async capturePhenomenalState(cycle: number, commits: CommitDelta[]): Promise<PhenomenalState> {
    const activeTraces = await this.traceGraph.getActiveTraces(10);
    const dominant = activeTraces.isOk()
      ? activeTraces.value.map(t => ({ trace_id: t.trace_id, content: t.content, weight: t.weight }))
      : [];

    const recentCommits = commits.slice(-5);
    const avgNovelty = recentCommits.length > 0
      ? recentCommits.reduce((s, c) => s + c.novelty_cost, 0) / recentCommits.length
      : 0;
    const avgUrgency = recentCommits.length > 0
      ? recentCommits.reduce((s, c) => s + c.urgency, 0) / recentCommits.length
      : 0;

    // Felt valence: reward vs threat from emotional charges of dominant traces
    const feltValence = activeTraces.isOk() && activeTraces.value.length > 0
      ? activeTraces.value.reduce((s, t) => s + t.emotional_charge * t.weight, 0) / activeTraces.value.length
      : 0;

    const timeSense = await this.commitKernel.computeTimeSense();

    return {
      cycle,
      dominant_traces: dominant,
      top_conflicts: [], // TODO: detect from inhibits edges
      active_priorities: recentCommits.filter(c => c.type === 'priority').map(c => c.changes.actions_queued?.[0] || 'unknown'),
      self_world_tension: 0, // TODO: compute from self_model vs world_model deltas
      prediction_error_hotspots: [],
      temporal_dilation: timeSense.dilation,
      felt_valence: Math.round(feltValence * 100) / 100,
      felt_urgency: Math.round(avgUrgency * 100) / 100,
    };
  }

  /**
   * Build reflection input: what the system tells ITSELF.
   */
  private buildReflectionInput(
    recentCommits: CommitDelta[],
    timeSense: TimeSense,
    phenomenalState: PhenomenalState | null,
  ): string {
    if (recentCommits.length === 0) return '[nothing happened — stable]';

    const parts: string[] = ['[Self-reflection on what just happened]'];

    for (const c of recentCommits) {
      parts.push(`- ${c.type} commit (${c.source_agents.join('+')}): novelty=${c.novelty_cost.toFixed(2)}, urgency=${c.urgency.toFixed(2)}`);
    }

    if (phenomenalState) {
      if (phenomenalState.felt_valence < -0.3) parts.push('[Tension detected — something feels wrong]');
      if (phenomenalState.felt_urgency > 0.7) parts.push('[High urgency — action pressure building]');
      if (phenomenalState.temporal_dilation > 1.5) parts.push('[Time stretching — deep processing, high novelty]');
      if (phenomenalState.dominant_traces.length > 0) {
        parts.push(`[Dominant in awareness: ${phenomenalState.dominant_traces.slice(0, 3).map(t => t.content.slice(0, 40)).join('; ')}]`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Build output: the remainder after stabilization.
   * NOT the full internal process — the RESULT.
   */
  private buildOutput(
    commits: CommitDelta[],
    timeSense: TimeSense,
    phenomenalState: PhenomenalState,
  ): KernelOutput {
    const perceptual = commits.filter(c => c.type === 'perceptual');
    const interpretive = commits.filter(c => c.type === 'interpretive');
    const priority = commits.filter(c => c.type === 'priority');
    const selfModel = commits.filter(c => c.type === 'self_model');
    const actions = commits.filter(c => c.type === 'action');

    const whatChanged = [
      ...perceptual.map(c => `Noticed: ${c.changes.traces_created.join(', ') || 'pattern'}`),
      ...interpretive.map(c => `Understood: convergence from ${c.source_agents.join('+')}`)
    ];

    const whatClearer = selfModel.map(c => `Self-model update: ${c.changes.self_model_delta ? JSON.stringify(c.changes.self_model_delta).slice(0, 100) : 'identity shift'}`);

    const actionsMatured = actions.flatMap(c => c.changes.actions_queued || []);

    const unresolved = phenomenalState.dominant_traces
      .filter(t => t.weight > 0.5)
      .map(t => t.content.slice(0, 80));

    const tensions = phenomenalState.top_conflicts.map(c => `${c.trace_a} ↔ ${c.trace_b}`);

    return {
      total_cycles: this.traceGraph.getCycle(),
      total_commits: commits.length,
      converged: commits.length > 0 && commits[commits.length - 1].energy < ENERGY_STABLE_THRESHOLD,
      convergence_reason: commits.length === 0 ? 'no signals'
        : commits[commits.length - 1].energy < ENERGY_STABLE_THRESHOLD ? 'energy below threshold'
        : 'max iterations',

      what_changed: whatChanged,
      what_became_clearer: whatClearer,
      what_remains_tense: tensions,
      actions_matured: actionsMatured,
      unresolved,

      time_sense: timeSense,
      phenomenal_state: phenomenalState,
      commits,
    };
  }

  private async buildContext(
    cycle: number,
    commits: CommitDelta[],
    phenomenalState: PhenomenalState | null,
    isReflection: boolean,
  ): Promise<AgentContext> {
    const timeSense = await this.commitKernel.computeTimeSense();
    const activeTraces = await this.traceGraph.getActiveTraces(10);

    return {
      cycle,
      recent_commits: commits.slice(-5),
      time_sense: timeSense,
      active_traces: activeTraces.isOk()
        ? activeTraces.value.map(t => ({ trace_id: t.trace_id, content: t.content, weight: t.weight }))
        : [],
      phenomenal_state: phenomenalState,
      is_reflection: isReflection,
    };
  }
}
