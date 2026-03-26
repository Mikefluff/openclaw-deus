import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../common/types/result.types';
import {
  Signal, CommitDelta, CommitType, KernelOutput,
  StabilizationState, RecursionGuard, PhenomenalState, TimeSense,
} from './kernel.types';
import { TraceGraphService } from './memory/trace-graph.service';
import { CommitKernelService } from './commit/commit-kernel.service';
import { CognitiveConfigService } from '../cognitive/cognitive-config.service';
import { AffectiveStateService } from './affect/affective-state.service';
import { SubstrateBridgeService } from './substrate-bridge.service';
import { ActiveCognitionService } from './cognition/active-cognition.service';
import { NarrativeService } from './narrative/narrative.service';
import { RawStreamService } from './sensory/raw-stream.service';
import { EnergyService } from './energy.service';

/**
 * KernelLoop: Continuous event loop with external interrupts.
 *
 * NOT call-and-return. A LIVING PROCESS:
 * - Runs continuously in background
 * - External events (messages) go into queue → interrupt current processing
 * - Between events: self-reflects, consolidates, decays
 * - Sleep duration modulated by arousal (high → tight loop, low → rest)
 *
 * Like a real brain: always running. External stimuli INTERRUPT the stream,
 * they don't CREATE it.
 */

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
  is_reflection: boolean;
  llm_budget: { remaining: number; used: number; total: number };
}

// Event types that can interrupt the loop
interface KernelEvent {
  type: 'message' | 'system' | 'episode_outcome';
  content: string;
  payload?: Record<string, unknown>;
  timestamp: number; // monotonic
}

@Injectable()
export class KernelLoopService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KernelLoopService.name);
  private agents: CognitiveAgent[] = [];
  private llmCallsUsed = 0;

  // Event queue: external interrupts
  private eventQueue: KernelEvent[] = [];
  private processing = false;
  private running = false;
  private loopHandle: ReturnType<typeof setTimeout> | null = null;

  // State across cycles
  private allCommits: CommitDelta[] = [];
  private phenomenalState: PhenomenalState | null = null;
  private guard: RecursionGuard = { consecutive_self_model_commits: 0, uncertainty_trend: [], orthogonal_signal_deficit: 0 };

  // LLM consultation + anti-rumination tracking
  private idleCyclesSinceLastLlm = 0;
  private idleCyclesWithoutProgress = 0;
  private lastIdleTraceCount = Infinity;
  private lastIdleErrorSum = Infinity;

  // Learning mode: proactive domain study during idle
  private learningDomain: string | null = null;
  private learningCycleCount = 0;

  // Promise resolvers for external callers waiting on results
  private pendingResolvers: Array<{ resolve: (output: KernelOutput) => void; eventId: number }> = [];
  private eventIdCounter = 0;

  constructor(
    private readonly traceGraph: TraceGraphService,
    private readonly commitKernel: CommitKernelService,
    private readonly config: CognitiveConfigService,
    private readonly affect: AffectiveStateService,
    private readonly substrateBridge: SubstrateBridgeService,
    private readonly activeCognition: ActiveCognitionService,
    private readonly narrative: NarrativeService,
    private readonly rawStream: RawStreamService,
    private readonly energy: EnergyService,
  ) {}

  onModuleInit(): void {
    this.running = true;
    this.scheduleNext(100); // start the loop
    this.logger.log('Kernel event loop started');
  }

  onModuleDestroy(): void {
    this.running = false;
    if (this.loopHandle) clearTimeout(this.loopHandle);
    this.logger.log('Kernel event loop stopped');
  }

  registerAgent(agent: CognitiveAgent): void {
    this.agents.push(agent);
    this.agents.sort((a, b) => a.rank - b.rank);
    this.logger.log(`Agent registered: ${agent.id} (rank ${agent.rank})`);
  }

  /**
   * Submit an external event for processing. Returns when the event has been processed
   * and the kernel has stabilized.
   */
  async think(input: string): Promise<Result<KernelOutput, DomainError>> {
    const eventId = this.eventIdCounter++;

    this.eventQueue.push({
      type: 'message',
      content: input,
      timestamp: Date.now(),
    });

    // Wake up the loop immediately
    if (this.loopHandle) clearTimeout(this.loopHandle);
    this.scheduleNext(0);

    // Wait for processing to complete
    return new Promise<Result<KernelOutput, DomainError>>((resolve) => {
      this.pendingResolvers.push({
        resolve: (output) => resolve(ok(output)),
        eventId,
      });

      // Timeout safety: don't wait forever
      const thinkTimeout = this.config.get('kernel.think_timeout_ms');
      setTimeout(() => {
        const idx = this.pendingResolvers.findIndex(r => r.eventId === eventId);
        if (idx >= 0) {
          this.pendingResolvers.splice(idx, 1);
          this.buildOutput(this.allCommits.slice(-10)).then(o => resolve(ok(o)));
        }
      }, thinkTimeout);
    });
  }

  /**
   * Inject pain/reward from outside (episode outcomes, operator frustration).
   */
  injectPain(source: string, intensity: number): void {
    this.affect.inflictPain(source, intensity);
    this.eventQueue.push({ type: 'episode_outcome', content: `Pain: ${source}`, payload: { intensity }, timestamp: Date.now() });
    this.wakeUp();
  }

  /**
   * Enter learning mode: system proactively studies a domain during idle.
   * Uses LLM to ask itself questions, identify gaps, deepen knowledge.
   * Like "sit down and study this subject."
   */
  startLearning(domain: string): void {
    this.learningDomain = domain;
    this.learningCycleCount = 0;
    this.logger.log(`Learning mode: studying "${domain}"`);
    this.wakeUp();
  }

  stopLearning(): void {
    this.logger.log(`Learning mode stopped after ${this.learningCycleCount} cycles on "${this.learningDomain}"`);
    this.learningDomain = null;
    this.learningCycleCount = 0;
  }

  isLearning(): boolean { return this.learningDomain !== null; }
  getLearningDomain(): string | null { return this.learningDomain; }
  getLearningProgress(): number { return this.learningCycleCount; }

  injectReward(amount: number): void {
    this.affect.reward(amount);
    this.eventQueue.push({ type: 'episode_outcome', content: `Reward: ${amount}`, payload: { amount }, timestamp: Date.now() });
    this.wakeUp();
  }

  /**
   * Episode completed: reinforce traces + train affect model.
   * This closes the loop: episode outcome → trace reinforcement → affect gradient.
   */
  async onEpisodeOutcome(episodeId: string, outcome: string): Promise<void> {
    // Reinforce trace graph paths
    await this.substrateBridge.reinforceFromEpisode(episodeId, outcome);

    // Train affect: success = reward, failure = pain
    if (outcome === 'success' || outcome === 'partial_success') {
      this.affect.reward(outcome === 'success' ? 0.4 : 0.2);
    } else if (outcome === 'failure') {
      this.affect.inflictPain(`episode_failure:${episodeId}`, 0.4);
    }

    this.wakeUp();
  }

  // ═══════════════════════════════════════════
  // THE LOOP
  // ═══════════════════════════════════════════

  private scheduleNext(delayMs: number): void {
    this.loopHandle = setTimeout(() => this.tick().catch(e => this.logger.error(`Loop error: ${e}`)), delayMs);
  }

  private wakeUp(): void {
    if (this.loopHandle) clearTimeout(this.loopHandle);
    if (!this.processing) this.scheduleNext(0);
  }

  /**
   * One tick of the event loop.
   * Either: process an external event, OR self-reflect.
   */
  private async tick(): Promise<void> {
    if (!this.running || this.processing) return;
    this.processing = true;

    try {
      const cycle = this.traceGraph.tick();
      this.energy.tick();

      // Check for external events
      const event = this.eventQueue.shift();

      if (event) {
        // EXTERNAL EVENT: interrupt, process fully
        await this.processExternalEvent(event, cycle);
      } else {
        // NO EVENT: self-reflect (idle thinking)
        await this.idleReflection(cycle);
      }
    } finally {
      this.processing = false;
    }

    // Schedule next tick: arousal modulates sleep duration
    if (this.running) {
      const sleepMs = this.computeSleepDuration();
      this.scheduleNext(sleepMs);
    }
  }

  /**
   * Process an external event: run agents, produce commits, reflect until stable.
   */
  private async processExternalEvent(event: KernelEvent, startCycle: number): Promise<void> {
    this.llmCallsUsed = 0;
    const cycleCommitsAll: CommitDelta[] = [];
    const maxIterations = this.config.get('kernel.max_iterations');
    const energyThreshold = this.config.get('kernel.energy_stable_threshold');
    const hallucinationLimit = this.config.get('kernel.hallucination_cycles');

    // Reset guardrails for new event
    this.guard = { consecutive_self_model_commits: 0, uncertainty_trend: [], orthogonal_signal_deficit: 0 };

    this.logger.log(`Kernel: processing ${event.type} "${event.content.slice(0, 50)}..."`);

    let prevEnergy = Infinity;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const cycle = iteration === 0 ? startCycle : this.traceGraph.tick();
      const isReflection = iteration > 0;

      const context = await this.buildContext(cycle, cycleCommitsAll, this.phenomenalState, isReflection);

      // CRITICAL DISTINCTION:
      // iter 0 (perception): LLM allowed — processing external input
      // iter 1+ (reflection): NO LLM — pure internal dynamics
      if (isReflection) {
        context.llm_budget = { remaining: 0, used: 0, total: 0 };
      }

      // Energy gate: if we can't afford LLM, zero out the budget
      if (!this.energy.canAffordLlm()) {
        context.llm_budget = { remaining: 0, used: context.llm_budget.used, total: context.llm_budget.total };
      }

      const input = isReflection
        ? this.buildReflectionInput(cycleCommitsAll.slice(-3), context.time_sense, this.phenomenalState)
        : event.content;

      // Raw stream: modality discovery on external input (iter 0 only)
      let rawStreamSignals: Signal[] = [];
      if (!isReflection) {
        const rawEvent = RawStreamService.stringToEvent(event.content, event.type);
        rawStreamSignals = await this.rawStream.ingest(rawEvent, cycle);
      }

      // Run agents
      const agentSignals = await this.runAgents(input, context, cycle);
      const signals = [...rawStreamSignals, ...agentSignals];

      // Guardrail: hallucination check
      if (isReflection) {
        const hasOrtho = this.hasOrthogonalSignals(signals, cycleCommitsAll);
        if (!hasOrtho) {
          this.guard.orthogonal_signal_deficit++;
          if (this.guard.orthogonal_signal_deficit >= hallucinationLimit) {
            this.logger.warn(`Cycle ${cycle}: hallucination guard — stopping`);
            break;
          }
        } else {
          this.guard.orthogonal_signal_deficit = 0;
        }
      }

      // Commit kernel
      const commitResult = await this.commitKernel.processCycle(signals);
      if (commitResult.isErr()) break;

      // Guardrail: self_model blocking
      const filteredCommits = commitResult.value.filter(c => {
        if (c.type === 'self_model') {
          this.guard.consecutive_self_model_commits++;
          if (this.guard.consecutive_self_model_commits > 1) return false;
        } else {
          this.guard.consecutive_self_model_commits = 0;
        }
        return true;
      });

      cycleCommitsAll.push(...filteredCommits);
      this.allCommits.push(...filteredCommits);

      // Energy cost per commit
      for (const _commit of filteredCommits) {
        this.energy.spend(this.energy.cost.commit, 'commit');
      }

      // Affect processes commits
      const timeSense = await this.commitKernel.computeTimeSense();
      const { configDeltas } = this.affect.processCommits(filteredCommits, timeSense);
      for (const [key, delta] of configDeltas) {
        this.config.adjust(key, delta, `affect:gradient`);
      }

      // Stabilization
      const stabilization = this.computeStabilization(filteredCommits, cycleCommitsAll, prevEnergy);
      prevEnergy = stabilization.energy;

      this.guard.uncertainty_trend.push(stabilization.energy);
      if (this.guard.uncertainty_trend.length > 5) this.guard.uncertainty_trend.shift();

      // Trace forgetting
      await this.traceGraph.forget();

      // Phenomenal state
      this.phenomenalState = await this.capturePhenomenalState(cycle, cycleCommitsAll);

      this.logger.log(`Cycle ${cycle}: ${signals.length} signals, ${filteredCommits.length} commits, energy=${stabilization.energy.toFixed(3)}`);

      // No commits → stable
      if (filteredCommits.length === 0) {
        this.logger.log(`Cycle ${cycle}: converged (no commits)`);
        break;
      }

      // Energy stable
      if (stabilization.energy < energyThreshold) {
        this.logger.log(`Cycle ${cycle}: converged (energy=${stabilization.energy.toFixed(3)})`);
        break;
      }

      // Uncertainty increasing
      if (this.guard.uncertainty_trend.length >= 3 && isReflection) {
        const recent = this.guard.uncertainty_trend.slice(-3);
        if (recent[2] > recent[1] && recent[1] > recent[0]) {
          this.logger.warn(`Cycle ${cycle}: uncertainty increasing — stopping`);
          break;
        }
      }
    }

    // Sync substrate → traces (new knowledge/intentions/episodes → traces)
    await this.substrateBridge.syncSubstrateToTraces(this.traceGraph.getCycle());

    // Apply commits → world model (actually update the picture of reality)
    await this.substrateBridge.applyCommitsToWorldModel(cycleCommitsAll);

    // Narrative compaction: compress old commits into narrative frames
    await this.narrative.compact();

    // Resolve pending callers
    const output = await this.buildOutput(cycleCommitsAll);
    const resolver = this.pendingResolvers.shift();
    if (resolver) resolver.resolve(output);
  }

  /**
   * Idle reflection: PURE INTERNAL processing. No LLM.
   *
   * The inner dialogue is autonomous — trace dynamics, spreading activation,
   * affect model, fast-path agents only. LLM is an EXTERNAL expert,
   * called only when internal processing is insufficient.
   *
   * Exception: when arousal is high AND internal resolution is failing
   * (pain chronic, prediction errors unresolved), call LLM as "psychologist" —
   * one consultation, then back to internal processing.
   */
  private async idleReflection(cycle: number): Promise<void> {
    // Energy gate: if system needs sleep, skip reflection entirely
    if (this.energy.needsSleep()) {
      this.energy.sleep();
      await new Promise(resolve => setTimeout(resolve, 200));
      return;
    }

    const activeTraces = await this.traceGraph.getActiveTraces(5);
    if (activeTraces.isErr() || activeTraces.value.length === 0) return;

    const affect = this.affect.getSnapshot();

    // Three idle modes:
    // 1. Learning mode: proactive LLM study of domain
    // 2. Expert consultation: LLM when high arousal + chronic pain
    // 3. Pure internal: no LLM, autonomous processing

    // ANTI-RUMINATION: if idle reflection isn't productive, kill it
    if (this.idleCyclesWithoutProgress > 5) {
      this.idleCyclesWithoutProgress = 0;
      return; // switch to resting — don't ruminate
    }

    // PSYCHOLOGIST: multi-signal compound trigger, not just pain
    const needsExpert = !this.learningDomain
      && affect.pain.intensity > 0.3                     // unresolved prediction error
      && affect.arousal > 0.5                             // elevated arousal
      && this.idleCyclesWithoutProgress > 3               // stalled convergence
      && this.allCommits.filter(c => c.type === 'self_model').length > 2  // repeated self-perturbation
      && this.idleCyclesSinceLastLlm > 10;

    // ADAPTIVE TEACHER: not fixed interval — triggered by accumulated error mass
    const domainErrors = this.learningDomain
      ? this.allCommits.slice(-this.learningCycleCount * 3).filter(c => c.prediction_error > 0.2).length
      : 0;
    const isLearning = this.learningDomain !== null
      && (domainErrors > 3 || this.idleCyclesSinceLastLlm > 5); // error mass OR consolidation gap

    const context = await this.buildContext(cycle, this.allCommits.slice(-5), this.phenomenalState, true);

    let input: string;

    if (isLearning && this.energy.canAffordLlm()) {
      // LEARNING MODE: proactive domain study
      context.llm_budget = { remaining: 2, used: 0, total: 2 };
      this.idleCyclesSinceLastLlm = 0;
      this.learningCycleCount++;
      input = this.buildLearningInput(this.learningDomain!);
      this.logger.log(`Learning: cycle ${this.learningCycleCount} on "${this.learningDomain}"`);
    } else if (needsExpert && this.energy.canAffordLlm()) {
      // EXPERT CONSULTATION: break internal loop
      context.llm_budget = { remaining: 1, used: 0, total: 1 };
      this.idleCyclesSinceLastLlm = 0;
      input = this.buildExpertConsultationInput();
      this.logger.log(`Idle: consulting LLM expert (arousal=${affect.arousal.toFixed(2)})`);
    } else {
      // PURE INTERNAL: no LLM
      context.llm_budget = { remaining: 0, used: 0, total: 0 };
      this.idleCyclesSinceLastLlm++;
      input = '[Idle — pure internal reflection]';
    }

    // Collect signals from agents + active cognition processes
    const agentSignals = await this.runAgents(input, context, cycle);

    // ACTIVE COGNITION (pure internal, no LLM):
    const [replaySignals, curiositySignals, inferenceSignals, schemaSignals] = await Promise.all([
      this.activeCognition.replayEpisode(cycle),   // dreaming
      this.activeCognition.generateCuriosity(cycle), // curiosity
      this.activeCognition.activeInference(cycle),   // deduction
      this.activeCognition.detectSchemas(cycle),     // pattern abstraction
    ]);

    const allSignals = [...agentSignals, ...replaySignals, ...curiositySignals, ...inferenceSignals, ...schemaSignals];

    // Energy cost for idle reflection cycle
    this.energy.spend(this.energy.cost.reflection_cycle, 'idle_reflection');

    if (allSignals.length > 0) {
      const commitResult = await this.commitKernel.processCycle(allSignals);
      if (commitResult.isOk() && commitResult.value.length > 0) {
        this.allCommits.push(...commitResult.value);
        const timeSense = await this.commitKernel.computeTimeSense();
        const { configDeltas } = this.affect.processCommits(commitResult.value, timeSense);
        for (const [key, delta] of configDeltas) {
          this.config.adjust(key, delta, 'affect:idle');
        }
      }
    }

    // Track idle progress: are we reducing errors or increasing compression?
    const currentTraceCount = await this.traceGraph.getTraceCount();
    const currentErrorSum = this.allCommits.slice(-10).reduce((s, c) => s + (c.prediction_error || 0), 0);
    if (currentTraceCount <= this.lastIdleTraceCount && currentErrorSum >= this.lastIdleErrorSum) {
      this.idleCyclesWithoutProgress++;
    } else {
      this.idleCyclesWithoutProgress = 0;
    }
    this.lastIdleTraceCount = currentTraceCount;
    this.lastIdleErrorSum = currentErrorSum;

    // Substrate sync during idle too
    await this.substrateBridge.syncSubstrateToTraces(cycle);

    await this.traceGraph.forget();
  }

  /**
   * Build input for LLM "expert consultation" — system describes its own state
   * and asks for guidance. Like seeing a psychologist when stuck.
   */
  private buildExpertConsultationInput(): string {
    const affect = this.affect.getSnapshot();
    const parts = ['[Expert consultation — system requesting external guidance]'];
    parts.push(`Current state: mode=${affect.mode}, valence=${affect.valence}, arousal=${affect.arousal}`);
    parts.push(`Pain: ${affect.pain.source} (intensity=${affect.pain.intensity.toFixed(2)}, ${affect.pain.chronic ? 'CHRONIC' : 'acute'})`);
    parts.push(`Cortisol: ${affect.hormones.cortisol.toFixed(2)}, Dopamine: ${affect.hormones.dopamine.toFixed(2)}`);

    if (this.phenomenalState) {
      if (this.phenomenalState.dominant_traces.length > 0) {
        parts.push(`Dominant in awareness: ${this.phenomenalState.dominant_traces.slice(0, 3).map(t => t.content.slice(0, 60)).join('; ')}`);
      }
      if (this.phenomenalState.top_conflicts.length > 0) {
        parts.push(`Active conflicts: ${this.phenomenalState.top_conflicts.map(c => `${c.trace_a} ↔ ${c.trace_b}`).join('; ')}`);
      }
      if (this.phenomenalState.prediction_error_hotspots.length > 0) {
        parts.push(`Prediction errors: ${this.phenomenalState.prediction_error_hotspots.map(h => `${h.domain}(${h.error.toFixed(2)})`).join(', ')}`);
      }
    }

    parts.push('What should I focus on? What am I missing? How do I resolve this tension?');
    return parts.join('\n');
  }

  /**
   * Build learning input: system proactively asks about a domain.
   * Uses knowledge gaps + current knowledge to form questions.
   */
  private buildLearningInput(domain: string): string {
    const parts = [`[Learning mode — studying "${domain}"]`];
    parts.push(`Cycle ${this.learningCycleCount} of domain study.`);

    if (this.phenomenalState?.dominant_traces.length) {
      const domainTraces = this.phenomenalState.dominant_traces
        .filter(t => t.content.toLowerCase().includes(domain.toLowerCase()));
      if (domainTraces.length > 0) {
        parts.push(`Already know: ${domainTraces.map(t => t.content.slice(0, 60)).join('; ')}`);
      }
    }

    // ADAPTIVE curriculum: driven by knowledge gaps and curiosity, not hardcoded phases
    // Check what gaps exist in this domain
    const domainGaps = this.phenomenalState?.prediction_error_hotspots
      .filter(h => h.domain.toLowerCase().includes(domain.toLowerCase()));

    if (domainGaps && domainGaps.length > 0) {
      // Domain has prediction errors → focus on resolving them
      parts.push(`I have prediction errors in ${domain}: ${domainGaps.map(g => `${g.domain}(error=${g.error.toFixed(2)})`).join(', ')}`);
      parts.push(`What am I getting wrong? How should I correct my understanding?`);
    } else if (this.learningCycleCount < this.config.get('kernel.learning_phase_early')) {
      // Early learning: fundamentals
      parts.push(`What are the essential concepts of ${domain} I must understand?`);
    } else if (this.learningCycleCount < this.config.get('kernel.learning_phase_mid')) {
      // Mid learning: depth + connections
      parts.push(`Given what I know about ${domain}, what patterns and connections am I missing?`);
      parts.push(`What are the non-obvious failure modes and risks?`);
    } else {
      // Advanced learning: integration with existing knowledge
      parts.push(`How does ${domain} interact with everything else I know?`);
      parts.push(`What should I be able to predict now that I couldn't before?`);
    }

    return parts.join('\n');
  }

  /**
   * Sleep duration modulated by arousal.
   * High arousal → short sleep (50ms, tight loop, active thinking)
   * Low arousal → long sleep (2000ms, resting, minimal processing)
   */
  private computeSleepDuration(): number {
    const affect = this.affect.getSnapshot();
    const hasEvents = this.eventQueue.length > 0;

    if (hasEvents) return 0;

    const sleepMax = this.config.get('kernel.sleep_max_ms');
    const sleepMin = this.config.get('kernel.sleep_min_ms');
    const learningSleep = this.config.get('kernel.learning_sleep_ms');

    // Learning mode: steady rhythm between study cycles
    if (this.learningDomain) return learningSleep;

    // Arousal modulated by energy: low energy dampens arousal effect → longer sleep
    const effectiveArousal = affect.arousal * this.energy.attentionFactor();
    const baseSleep = sleepMax - effectiveArousal * (sleepMax - sleepMin);
    return Math.max(sleepMin, Math.min(sleepMax, baseSleep));
  }

  // ═══════════════════════════════════════════
  // AGENT RUNNER
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

    const allSignals = signalArrays.flat()
      .filter(s => s.confidence >= 0.1)
      .map(s => ({ ...s, cycle }));

    this.llmCallsUsed += allSignals.filter(s => s.used_slow_path).length;
    return allSignals;
  }

  // ═══════════════════════════════════════════
  // STABILIZATION
  // ═══════════════════════════════════════════

  private computeStabilization(cycleCommits: CommitDelta[], allCommits: CommitDelta[], prevEnergy: number): StabilizationState {
    if (cycleCommits.length === 0) {
      return { convergence_pressure: 0, new_high_energy_traces: 0, commit_delta_magnitude: 0, prediction_error_trend: 0, pending_escalations: 0, energy: 0, stable: true };
    }

    const convergencePressure = cycleCommits.reduce((s, c) => s + c.energy, 0) / cycleCommits.length;
    const newHighEnergy = cycleCommits.filter(c => c.novelty_cost > 0.7).length;
    const lastCommit = allCommits.length > 1 ? allCommits[allCommits.length - 2] : null;
    const commitDelta = lastCommit ? Math.abs(cycleCommits[0].energy - lastCommit.energy) : cycleCommits[0].energy;
    const recentErrors = allCommits.slice(-5).map(c => c.prediction_error);
    const predTrend = recentErrors.length > 1 ? recentErrors[recentErrors.length - 1] - recentErrors[0] : 0;
    const escalations = cycleCommits.filter(c => c.is_escalation).length;

    const wNovelty = this.config.get('kernel.energy_w_novelty') || 0.4;
    const wPredErr = this.config.get('kernel.energy_w_pred_error') || 0.3;
    const wUrgency = this.config.get('kernel.energy_w_urgency') || 0.3;

    const energy = convergencePressure * wNovelty + newHighEnergy * 0.2 + commitDelta * wPredErr + Math.max(0, predTrend) * 0.15 + escalations * wUrgency;
    const threshold = this.config.get('kernel.energy_stable_threshold') || 0.1;

    return { convergence_pressure: convergencePressure, new_high_energy_traces: newHighEnergy, commit_delta_magnitude: commitDelta, prediction_error_trend: predTrend, pending_escalations: escalations, energy: Math.round(energy * 1000) / 1000, stable: energy < threshold };
  }

  // ═══════════════════════════════════════════
  // CONTEXT BUILDING
  // ═══════════════════════════════════════════

  private async buildContext(cycle: number, commits: CommitDelta[], phenomenalState: PhenomenalState | null, isReflection: boolean): Promise<AgentContext> {
    const timeSense = await this.commitKernel.computeTimeSense();
    const activeTraces = await this.traceGraph.getActiveTraces(10);

    return {
      cycle,
      recent_commits: commits.slice(-5),
      time_sense: timeSense,
      active_traces: activeTraces.isOk() ? activeTraces.value.map(t => ({ trace_id: t.trace_id, content: t.content, weight: t.weight })) : [],
      phenomenal_state: phenomenalState,
      is_reflection: isReflection,
      llm_budget: {
        remaining: Math.max(0, (this.config.get('kernel.llm_budget_per_think') || 8) - this.llmCallsUsed),
        used: this.llmCallsUsed,
        total: this.config.get('kernel.llm_budget_per_think') || 8,
      },
    };
  }

  // ═══════════════════════════════════════════
  // REFLECTION INPUT
  // ═══════════════════════════════════════════

  private buildReflectionInput(recentCommits: CommitDelta[], timeSense: TimeSense, phenomenalState: PhenomenalState | null): string {
    if (recentCommits.length === 0) return '[Idle — nothing in recent awareness]';

    const parts: string[] = ['[Self-reflection]'];
    for (const c of recentCommits) {
      parts.push(`- ${c.type} (${c.source_agents.join('+')}): novelty=${c.novelty_cost.toFixed(2)}, urgency=${c.urgency.toFixed(2)}`);
    }

    if (phenomenalState) {
      const affect = this.affect.getSnapshot();
      if (affect.pain.intensity > 0.3) parts.push(`[PAIN: ${affect.pain.source} (${affect.pain.intensity.toFixed(2)})]`);
      if (affect.hormones.cortisol > 0.5) parts.push(`[STRESS: cortisol=${affect.hormones.cortisol.toFixed(2)}]`);
      if (affect.hormones.dopamine > 0.5) parts.push(`[REWARD: dopamine=${affect.hormones.dopamine.toFixed(2)}]`);
      parts.push(`[Mode: ${affect.mode}, valence=${affect.valence}, arousal=${affect.arousal}]`);
      if (phenomenalState.dominant_traces.length > 0) {
        parts.push(`[Awareness: ${phenomenalState.dominant_traces.slice(0, 3).map(t => t.content.slice(0, 40)).join('; ')}]`);
      }
    }

    return parts.join('\n');
  }

  // ═══════════════════════════════════════════
  // GUARDRAILS
  // ═══════════════════════════════════════════

  private hasOrthogonalSignals(signals: Signal[], previousCommits: CommitDelta[]): boolean {
    const previousContents = new Set(previousCommits.map(c => c.changes.traces_activated).flat());
    return signals.some(s => s.targets.some(t => !previousContents.has(t)) || s.novelty_cost > 0.5);
  }

  // ═══════════════════════════════════════════
  // PHENOMENAL STATE
  // ═══════════════════════════════════════════

  private async capturePhenomenalState(cycle: number, commits: CommitDelta[]): Promise<PhenomenalState> {
    const activeTraces = await this.traceGraph.getActiveTraces(10);
    const dominant = activeTraces.isOk() ? activeTraces.value.map(t => ({ trace_id: t.trace_id, content: t.content, weight: t.weight })) : [];
    const recentCommits = commits.slice(-5);
    const affectSnapshot = this.affect.getSnapshot();
    const timeSense = await this.commitKernel.computeTimeSense();
    const selfWorldTension = (affectSnapshot.hormones.cortisol + affectSnapshot.pain.intensity) / 2;
    const predErrorHotspots = recentCommits.filter(c => c.prediction_error > 0.2).map(c => ({ domain: c.source_agents.join('+'), error: c.prediction_error }));

    return {
      cycle, dominant_traces: dominant, top_conflicts: await this.detectConflicts(),
      active_priorities: recentCommits.filter(c => c.type === 'priority').map(c => c.changes.actions_queued?.[0] || 'unknown'),
      self_world_tension: Math.round(selfWorldTension * 100) / 100,
      prediction_error_hotspots: predErrorHotspots,
      temporal_dilation: timeSense.dilation,
      felt_valence: affectSnapshot.valence,
      felt_urgency: affectSnapshot.arousal,
    };
  }

  private async detectConflicts(): Promise<Array<{ trace_a: string; trace_b: string; tension: number }>> {
    try {
      const inhibits = await this.traceGraph.queryInhibits();
      if (inhibits.isErr()) return [];
      return inhibits.value.map(i => ({ trace_a: (i.a || '').slice(0, 50), trace_b: (i.b || '').slice(0, 50), tension: i.w || 0 }));
    } catch { return []; }
  }

  // ═══════════════════════════════════════════
  // OUTPUT
  // ═══════════════════════════════════════════

  private async buildOutput(commits: CommitDelta[]): Promise<KernelOutput> {
    const perceptual = commits.filter(c => c.type === 'perceptual');
    const interpretive = commits.filter(c => c.type === 'interpretive');
    const selfModel = commits.filter(c => c.type === 'self_model');
    const actions = commits.filter(c => c.type === 'action');
    const timeSense = await this.commitKernel.computeTimeSense();

    return {
      total_cycles: this.traceGraph.getCycle(),
      total_commits: commits.length,
      converged: true,
      convergence_reason: 'event processed',
      what_changed: perceptual.map(c => `${c.source_agents.join('+')}: ${c.changes.traces_created.length} traces`),
      what_became_clearer: selfModel.map(c => 'self-model update'),
      what_remains_tense: this.phenomenalState?.top_conflicts.map(c => `${c.trace_a} ↔ ${c.trace_b}`) || [],
      actions_matured: actions.flatMap(c => c.changes.actions_queued || []),
      unresolved: this.phenomenalState?.dominant_traces.filter(t => t.weight > 0.5).map(t => t.content.slice(0, 80)) || [],
      time_sense: timeSense,
      phenomenal_state: this.phenomenalState || { cycle: 0, dominant_traces: [], top_conflicts: [], active_priorities: [], self_world_tension: 0, prediction_error_hotspots: [], temporal_dilation: 1, felt_valence: 0, felt_urgency: 0 },
      affect: this.affect.getSnapshot(),
      commits,
    };
  }
}
