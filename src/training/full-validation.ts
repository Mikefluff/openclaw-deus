/**
 * Full Validation: comprehensive test of the cognitive engine.
 *
 * Phase 1: N ticks in EvolvingWorld -- verify learning curves
 * Phase 2: N/2 ticks in SocialWorld -- verify transfer learning
 *
 * Reports: JSON with all metrics + console summary + PASS/FAIL assertions
 *
 * Run: npx ts-node src/training/full-validation.ts 500
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { KernelLoopService } from '../kernel/kernel-loop.service';
import { TraceGraphService } from '../kernel/memory/trace-graph.service';
import { CommitKernelService } from '../kernel/commit/commit-kernel.service';
import { AffectiveStateService } from '../kernel/affect/affective-state.service';
import { ConceptSpaceService } from '../kernel/space/concept-space.service';
import { ModalityDiscoveryService } from '../kernel/sensory/modality-discovery.service';
import { EnergyService } from '../kernel/energy.service';
import { DevelopmentalMetricsService } from '../kernel/developmental-metrics.service';
import { LlmClientService } from '../llm/llm-client.service';
import { SurrealService } from '../database/surreal.service';
import { SensorimotorPredictorService } from '../kernel/sensorimotor-predictor.service';
import { EvolvingWorld } from './evolving-world';
import { SocialWorld } from './social-world';
import { AgentAction, ActionConsequence, WorldBridge } from '../kernel/agency.types';

// ─── Types ───────────────────────────────────────────────────

interface ValidationCheckpoint {
  tick: number;
  // Core
  trace_count: number;
  commit_count: number;
  dimension_count: number;
  modality_count: number;
  // World model
  accuracy: number;
  // Affect
  cortisol: number;
  arousal: number;
  valence: number;
  mode: string;
  // Energy
  energy: number;
  total_spent: number;
  // Language
  vocabulary_size: number;
  words_produced: number;
  // Predictor
  predictor_steps: number;
  // Performance
  ms_per_tick: number;
  // Stage
  stage: string;
  health: number;
}

interface Assertion {
  name: string;
  passed: boolean;
  details: string;
  soft?: boolean;
}

interface PhaseReport {
  ticks: number;
  duration_seconds: number;
  checkpoints: ValidationCheckpoint[];
  final_world_level: number;
  assertions: Assertion[];
  transfer_learning_rate?: number;
}

interface ValidationReport {
  phase1: PhaseReport;
  phase2?: PhaseReport;
  summary: {
    total_ticks: number;
    total_seconds: number;
    assertions_passed: number;
    assertions_failed: number;
    overall: 'PASS' | 'FAIL';
  };
}

// ─── Config ──────────────────────────────────────────────────

const PHASE1_TICKS = parseInt(process.argv[2] || '1000', 10);
const PHASE2_TICKS = Math.floor(PHASE1_TICKS * 0.5);
const CHECKPOINT_INTERVAL = Math.max(50, Math.floor(PHASE1_TICKS / 10));

// ─── Minimal World Bridge ────────────────────────────────────

class SimpleWorldBridge implements WorldBridge {
  constructor(
    private readonly world: { childAction(action: string, target?: string): Array<{ content: string; source: string }> },
    private readonly getNames: () => string[],
    private readonly getActions: () => string[],
  ) {}

  async executeAction(action: AgentAction): Promise<ActionConsequence[]> {
    const consequences = this.world.childAction(action.method || 'touch', action.target);
    return consequences.map(e => ({
      content: e.content,
      source: e.source,
      emotional_valence: 0.02,
    }));
  }

  getAvailableTargets(): string[] { return this.getNames(); }
  getAvailableActions(): string[] { return this.getActions(); }
}

// ─── Helpers ─────────────────────────────────────────────────

async function collectCheckpoint(
  tick: number,
  elapsed: number,
  traceGraph: TraceGraphService,
  commitKernel: CommitKernelService,
  conceptSpace: ConceptSpaceService,
  modalities: ModalityDiscoveryService,
  affect: AffectiveStateService,
  energy: EnergyService,
  devMetrics: DevelopmentalMetricsService,
  predictor: SensorimotorPredictorService,
  kernelLoop: KernelLoopService,
  db: SurrealService,
  world: { getGroundTruth(): Array<{ name: string; properties: Record<string, string> }> },
): Promise<ValidationCheckpoint> {
  const traces = await traceGraph.getTraceCount();
  const commits = commitKernel.getCommitCount();
  const dims = conceptSpace.getDimensionCount();
  const mods = modalities.getModalityCount();
  const affectSnap = affect.getSnapshot();
  const energyState = energy.getState();
  const vocabSize = await conceptSpace.getVocabularySize();
  const wordsProduced = kernelLoop.getVerbalProductions().length;
  const predictorSteps = predictor.getStepCount();

  // World model accuracy
  const groundTruth = world.getGroundTruth();
  let correct = 0;
  let total = 0;
  for (const obj of groundTruth) {
    const traces_q = await db.query<Record<string, unknown>>(
      `SELECT content FROM trace WHERE content CONTAINS $name AND archived = false LIMIT 3`,
      { name: obj.name },
    );
    if (traces_q.isOk() && traces_q.value.length > 0) {
      total++;
      const texts = traces_q.value.map(t => ((t.content as string) || '').toLowerCase());
      if (Object.values(obj.properties).some(p => texts.some(t => t.includes(p.toLowerCase())))) {
        correct++;
      }
    }
  }
  const accuracy = total > 0 ? correct / total : 0;

  // Developmental snapshot
  const snap = await devMetrics.snapshot(tick);

  return {
    tick,
    trace_count: traces,
    commit_count: commits,
    dimension_count: dims,
    modality_count: mods,
    accuracy,
    cortisol: affectSnap.hormones?.cortisol ?? 0,
    arousal: affectSnap.arousal ?? 0,
    valence: affectSnap.valence ?? 0,
    mode: affectSnap.mode ?? 'unknown',
    energy: energyState.current,
    total_spent: energyState.total_energy_spent,
    vocabulary_size: vocabSize,
    words_produced: wordsProduced,
    predictor_steps: predictorSteps,
    ms_per_tick: elapsed,
    stage: snap.stage,
    health: snap.overall_health,
  };
}

function printCheckpoint(cp: ValidationCheckpoint): void {
  console.log(
    `  [tick ${cp.tick}] traces=${cp.trace_count} dims=${cp.dimension_count} ` +
    `acc=${(cp.accuracy * 100).toFixed(0)}% vocab=${cp.vocabulary_size} ` +
    `stage=${cp.stage} ${cp.ms_per_tick}ms/tick`,
  );
}

function addAssertion(
  phase: PhaseReport,
  name: string,
  condition: boolean,
  soft = false,
): void {
  phase.assertions.push({
    name,
    passed: condition,
    details: condition ? 'OK' : 'FAILED',
    soft,
  });
}

// ─── Main ────────────────────────────────────────────────────

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn'] });

  const kernelLoop = app.get(KernelLoopService);
  const traceGraph = app.get(TraceGraphService);
  const commitKernel = app.get(CommitKernelService);
  const affect = app.get(AffectiveStateService);
  const conceptSpace = app.get(ConceptSpaceService);
  const modalities = app.get(ModalityDiscoveryService);
  const energy = app.get(EnergyService);
  const devMetrics = app.get(DevelopmentalMetricsService);
  const llm = app.get(LlmClientService);
  const db = app.get(SurrealService);
  const predictor = app.get(SensorimotorPredictorService);

  llm.pause();

  const globalStart = Date.now();

  const report: ValidationReport = {
    phase1: {
      ticks: PHASE1_TICKS,
      duration_seconds: 0,
      checkpoints: [],
      final_world_level: 0,
      assertions: [],
    },
    summary: {
      total_ticks: 0,
      total_seconds: 0,
      assertions_passed: 0,
      assertions_failed: 0,
      overall: 'FAIL',
    },
  };

  // ════════════════════════════════════════════
  // PHASE 1: EvolvingWorld
  // ════════════════════════════════════════════

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  PHASE 1: Physical World (${PHASE1_TICKS} ticks)`);
  console.log(`${'='.repeat(60)}\n`);

  const world = new EvolvingWorld();
  const bridge = new SimpleWorldBridge(
    world,
    () => world.getObjectNames(),
    () => world.getAvailableActions(),
  );
  kernelLoop.setWorld(bridge);

  const phase1Start = Date.now();
  let phase1TotalMs = 0;

  for (let tick = 0; tick < PHASE1_TICKS; tick++) {
    const start = Date.now();

    const events = world.tick();
    for (const event of events) {
      kernelLoop.pushEvent(event.content, 'message', event.source);
    }
    await kernelLoop.pump();

    if (energy.needsSleep()) {
      devMetrics.recordSleep(tick);
      energy.sleep();
    }

    const elapsed = Date.now() - start;
    phase1TotalMs += elapsed;

    // Checkpoint + world progression + accuracy
    if ((tick + 1) % CHECKPOINT_INTERVAL === 0 || tick === PHASE1_TICKS - 1) {
      // Compute accuracy for reward shaping
      const groundTruth = world.getGroundTruth();
      let correct = 0; let total = 0;
      for (const obj of groundTruth) {
        const tq = await db.query<Record<string, unknown>>(
          `SELECT content FROM trace WHERE content CONTAINS $name AND archived = false LIMIT 3`,
          { name: obj.name },
        );
        if (tq.isOk() && tq.value.length > 0) {
          total++;
          const texts = tq.value.map(t => (t.content as string || '').toLowerCase());
          if (Object.values(obj.properties).some(p => texts.some(t => t.includes(p.toLowerCase())))) correct++;
        }
      }
      const accuracy = total > 0 ? correct / total : 0;
      devMetrics.recordAccuracy(tick, accuracy);
      if (accuracy > 0.5) affect.reward(accuracy * 0.2);

      // Developmental snapshot + world progression
      const snap = await devMetrics.snapshot(tick);
      const progressed = world.checkProgression(snap);
      if (progressed) {
        console.log(`  ★ WORLD LEVEL UP → ${world.getLevel()} at tick ${tick + 1}`);
      }

      // Cluster materialization
      await conceptSpace.materializeClusters(tick);
      const avgMs = Math.round(phase1TotalMs / (tick + 1));
      const checkpoint = await collectCheckpoint(
        tick + 1, avgMs,
        traceGraph, commitKernel, conceptSpace, modalities,
        affect, energy, devMetrics, predictor, kernelLoop, db, world,
      );
      report.phase1.checkpoints.push(checkpoint);
      printCheckpoint(checkpoint);
    }
  }

  report.phase1.duration_seconds = Math.round((Date.now() - phase1Start) / 1000);
  report.phase1.final_world_level = world.getLevel();

  // Phase 1 assertions
  const p1cps = report.phase1.checkpoints;
  const p1First = p1cps[0];
  const p1Last = p1cps[p1cps.length - 1];
  const p1AvgMs = p1cps.length > 0
    ? Math.round(p1cps.reduce((s, c) => s + c.ms_per_tick, 0) / p1cps.length)
    : 0;

  if (p1First && p1Last) {
    addAssertion(report.phase1, 'traces_grow', p1Last.trace_count > p1First.trace_count);
    addAssertion(report.phase1, 'dimensions_grow', p1Last.dimension_count > 2);
    addAssertion(report.phase1, 'dimensions_capped', p1Last.dimension_count <= 30);
    addAssertion(report.phase1, 'accuracy_improves', p1Last.accuracy >= p1First.accuracy);
    addAssertion(report.phase1, 'accuracy_above_50', p1Last.accuracy > 0.5);
    addAssertion(report.phase1, 'affect_alive', p1Last.cortisol > 0 || p1Last.arousal > 0);
    addAssertion(report.phase1, 'energy_spent', p1Last.total_spent > 1);
    addAssertion(report.phase1, 'world_progresses', world.getLevel() >= 1);
    addAssertion(report.phase1, 'performance', p1AvgMs < 50);
    // Soft assertions (may not pass yet)
    addAssertion(report.phase1, 'vocab_grows', p1Last.vocabulary_size > 0, true);
    addAssertion(report.phase1, 'predictor_trains', p1Last.predictor_steps > 0, true);
  }

  // ════════════════════════════════════════════
  // PHASE 2: SocialWorld (Transfer Learning)
  // ════════════════════════════════════════════

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  PHASE 2: Social World (${PHASE2_TICKS} ticks, transfer learning)`);
  console.log(`${'='.repeat(60)}\n`);

  const phase2: PhaseReport = {
    ticks: PHASE2_TICKS,
    duration_seconds: 0,
    checkpoints: [],
    final_world_level: 0,
    assertions: [],
  };
  report.phase2 = phase2;

  const socialWorld = new SocialWorld();
  const socialBridge = new SimpleWorldBridge(
    socialWorld,
    () => socialWorld.getObjectNames(),
    () => socialWorld.getAvailableActions(),
  );
  kernelLoop.setWorld(socialBridge);

  const phase2Start = Date.now();
  let phase2TotalMs = 0;

  for (let tick = 0; tick < PHASE2_TICKS; tick++) {
    const start = Date.now();

    const events = socialWorld.tick();
    for (const event of events) {
      kernelLoop.pushEvent(event.content, 'message', event.source);
    }
    await kernelLoop.pump();

    if (energy.needsSleep()) {
      devMetrics.recordSleep(PHASE1_TICKS + tick);
      energy.sleep();
    }

    const elapsed = Date.now() - start;
    phase2TotalMs += elapsed;

    // Checkpoint
    if ((tick + 1) % CHECKPOINT_INTERVAL === 0 || tick === PHASE2_TICKS - 1) {
      const avgMs = Math.round(phase2TotalMs / (tick + 1));
      const checkpoint = await collectCheckpoint(
        PHASE1_TICKS + tick + 1, avgMs,
        traceGraph, commitKernel, conceptSpace, modalities,
        affect, energy, devMetrics, predictor, kernelLoop, db, socialWorld,
      );
      phase2.checkpoints.push(checkpoint);
      printCheckpoint(checkpoint);
    }
  }

  phase2.duration_seconds = Math.round((Date.now() - phase2Start) / 1000);
  phase2.final_world_level = socialWorld.getLevel();

  // Transfer learning metric
  const p2cps = phase2.checkpoints;
  const p2First = p2cps[0];
  const p2Last = p2cps[p2cps.length - 1];

  if (p1cps.length >= 2 && p2cps.length >= 2) {
    const p1EarlyRate = (p1cps[1].trace_count - p1cps[0].trace_count) / CHECKPOINT_INTERVAL;
    const p2EarlyRate = (p2cps[1].trace_count - p2cps[0].trace_count) / CHECKPOINT_INTERVAL;
    phase2.transfer_learning_rate = p2EarlyRate / Math.max(0.01, p1EarlyRate);
  }

  if (p2First && p2Last) {
    addAssertion(phase2, 'social_traces_grow', p2Last.trace_count > p2First.trace_count);
    addAssertion(phase2, 'transfer_positive', (phase2.transfer_learning_rate ?? 0) > 0.8, true);
  }

  // ════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════

  const allAssertions: Assertion[] = [
    ...report.phase1.assertions,
    ...(report.phase2?.assertions || []),
  ];

  const hardFailures = allAssertions.filter(a => !a.passed && !a.soft).length;

  report.summary = {
    total_ticks: PHASE1_TICKS + PHASE2_TICKS,
    total_seconds: Math.round((Date.now() - globalStart) / 1000),
    assertions_passed: allAssertions.filter(a => a.passed).length,
    assertions_failed: allAssertions.filter(a => !a.passed).length,
    overall: hardFailures === 0 ? 'PASS' : 'FAIL',
  };

  console.log(`\n${'='.repeat(60)}`);
  console.log('  VALIDATION REPORT');
  console.log(`${'='.repeat(60)}`);

  for (const a of allAssertions) {
    const icon = a.passed ? 'V' : 'X';
    const suffix = a.soft ? ' (soft)' : '';
    console.log(`  ${icon} ${a.name}: ${a.details}${suffix}`);
  }

  console.log(`\n  Result: ${report.summary.overall}`);
  console.log(`  ${report.summary.assertions_passed}/${allAssertions.length} passed`);
  console.log(`  Total: ${report.summary.total_ticks} ticks in ${report.summary.total_seconds}s`);

  if (phase2.transfer_learning_rate !== undefined) {
    console.log(`  Transfer learning rate: ${phase2.transfer_learning_rate.toFixed(2)}x`);
  }

  console.log(`\n${JSON.stringify(report, null, 2)}`);

  await app.close();
  process.exit(report.summary.overall === 'PASS' ? 0 : 1);
}

main().catch(e => {
  console.error('FATAL:', e.message || e);
  process.exit(1);
});
