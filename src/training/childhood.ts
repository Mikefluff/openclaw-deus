/**
 * CHILDHOOD: Child lives in an evolving world. Kernel IS the child.
 *
 * Training script is NOT the brain — it's the WORLD + OBSERVER.
 * - Creates evolving virtual world
 * - Feeds world events to kernel
 * - Executes kernel's actions in the world
 * - Observes developmental metrics (never controls)
 * - World evolves based on child's development
 *
 * The kernel decides: what to explore, when to rest, when to ask for help.
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
import { EvolvingWorld } from './evolving-world';
import { AgentAction, ActionConsequence, WorldBridge } from '../kernel/agency.types';

const TOTAL_TICKS = parseInt(process.argv[2] || '500', 10);
const REPORT_INTERVAL = Math.max(10, Math.floor(TOTAL_TICKS / 20));
const DEV_METRICS_INTERVAL = Math.max(25, Math.floor(TOTAL_TICKS / 10));

/**
 * WorldBridge: connects kernel's agency to the evolving world.
 * Kernel ACTS → bridge EXECUTES → world RESPONDS.
 */
class EvolvingWorldBridge implements WorldBridge {
  constructor(
    private readonly world: EvolvingWorld,
    private readonly devMetrics: DevelopmentalMetricsService,
  ) {}

  async executeAction(action: AgentAction): Promise<ActionConsequence[]> {
    const consequences = this.world.childAction(action.method || 'touch', action.target);
    const valence = this.inferValence(consequences.map(c => c.content).join(' '));

    // Record action for developmental metrics
    const isExploration = !action.target || Math.random() < 0.5; // heuristic
    this.devMetrics.recordAction(
      action.method || 'touch',
      action.target || 'unknown',
      this.world.getState().tick,
      isExploration,
    );

    // Track pain
    if (valence < -0.1) {
      this.devMetrics.recordPainOnset(this.world.getState().tick);
    }

    return consequences.map(e => ({
      content: e.content,
      source: e.source,
      emotional_valence: valence,
    }));
  }

  getAvailableTargets(): string[] { return this.world.getObjectNames(); }
  getAvailableActions(): string[] { return this.world.getAvailableActions(); }

  private inferValence(content: string): number {
    const lower = content.toLowerCase();
    if (lower.includes('разбил') || lower.includes('расстро') || lower.includes('нельзя') || lower.includes('больно')) return -0.3;
    if (lower.includes('молодец') || lower.includes('умница') || lower.includes('хорошо') || lower.includes('красив')) return 0.3;
    if (lower.includes('покатил') || lower.includes('плавает') || lower.includes('звенит')) return 0.1;
    return 0;
  }
}

async function main() {
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

  // TRAINING MODE: zero LLM calls. Child learns from experience, not from asking adults.
  // Set LLM_MODEL=claude-haiku-4-5-20251001 for rare LLM calls if needed.
  llm.pause();

  const world = new EvolvingWorld();
  const bridge = new EvolvingWorldBridge(world, devMetrics);

  // Connect kernel to world — kernel can now ACT
  kernelLoop.setWorld(bridge);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  CHILDHOOD: ${TOTAL_TICKS} world ticks (evolving world)`);
  console.log(`  Starting: ${world.getState().location} | Level ${world.getLevel()}`);
  console.log(`  Fast path: pushEvent → pump (no LLM, no blocking)`);
  console.log(`${'═'.repeat(60)}\n`);

  let totalMs = 0;
  let lastReportTraces = 0;

  for (let tick = 0; tick < TOTAL_TICKS; tick++) {
    const start = Date.now();

    // === WORLD TICK: generate ambient events ===
    const events = world.tick();

    // === PUSH events to kernel queue (non-blocking) ===
    for (const event of events) {
      kernelLoop.pushEvent(event.content);
    }

    // === PUMP: kernel processes all queued events + light-cone tick ===
    await kernelLoop.pump();

    // === TRACK SLEEP ===
    if (energy.needsSleep()) {
      devMetrics.recordSleep(tick);
      energy.sleep();
    }

    totalMs += Date.now() - start;

    // === DEVELOPMENTAL METRICS (periodic) ===
    if ((tick + 1) % DEV_METRICS_INTERVAL === 0) {
      // Compute world model accuracy for metrics
      const groundTruth = world.getGroundTruth();
      let correct = 0; let total = 0;
      for (const obj of groundTruth) {
        const traces_q = await db.query<Record<string, unknown>>(
          `SELECT content FROM trace WHERE content CONTAINS $name AND archived = false LIMIT 3`,
          { name: obj.name },
        );
        if (traces_q.isOk() && traces_q.value.length > 0) {
          total++;
          const texts = traces_q.value.map(t => (t.content as string || '').toLowerCase());
          if (Object.values(obj.properties).some(p => texts.some(t => t.includes(p.toLowerCase())))) correct++;
        }
      }
      const accuracy = total > 0 ? correct / total : 0;
      devMetrics.recordAccuracy(tick, accuracy);

      // Reward for accurate world model — child feels good when understanding improves
      if (accuracy > 0.5) {
        affect.reward(accuracy * 0.3);
      }

      // Take snapshot
      const snap = await devMetrics.snapshot(tick);

      // Check world progression
      const progressed = world.checkProgression(snap);
      if (progressed) {
        console.log(`\n  ★★★ WORLD LEVEL UP → ${world.getLevel()} at tick ${tick + 1} ★★★`);
        console.log(`  New location: ${world.getState().location}`);
        console.log(`  Objects: ${world.getObjectNames().join(', ')}\n`);
      }
    }

    // === OBSERVE (never control) ===
    if ((tick + 1) % REPORT_INTERVAL === 0 || tick === TOTAL_TICKS - 1) {
      const pct = Math.round(((tick + 1) / TOTAL_TICKS) * 100);
      const traces = await traceGraph.getTraceCount();
      const commits = commitKernel.getCommitCount();
      const dims = conceptSpace.getDimensionCount();
      const mods = modalities.getModalityCount();
      const affectState = affect.getSnapshot();
      const energyState = energy.getState();
      const worldState = world.getState();

      console.log(`\n  ── ${pct}% (tick ${tick + 1}/${TOTAL_TICKS}) ──`);
      console.log(`  World: ${worldState.location} | Level ${worldState.level} | ${worldState.weather} | ${worldState.timeOfDay}`);
      console.log(`  Brain: traces=${traces}(+${traces - lastReportTraces}) commits=${commits} dims=${dims} modalities=${mods}`);
      console.log(`  Affect: mode=${affectState.mode} val=${affectState.valence} arousal=${affectState.arousal}`);
      console.log(`  Energy: ${energyState.current}/${energyState.max} fatigue=${energyState.fatigue_level}`);
      console.log(`  Speed: ${Math.round(totalMs / Math.max(1, tick + 1))}ms/tick`);

      // Show latest developmental snapshot if available
      const latestSnap = devMetrics.getLatest();
      if (latestSnap) {
        console.log(devMetrics.formatSnapshot(latestSnap));
      }

      lastReportTraces = traces;
    }
  }

  // === FINAL ===
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  CHILDHOOD COMPLETE');
  console.log(`${'═'.repeat(60)}`);

  const finalTraces = await traceGraph.getTraceCount();
  const finalAffect = affect.getSnapshot();
  const finalEnergy = energy.getState();
  const finalSnap = await devMetrics.snapshot(TOTAL_TICKS);

  console.log(`\n  Ticks: ${TOTAL_TICKS} | Time: ${Math.round(totalMs / 1000)}s`);
  console.log(`  Traces: ${finalTraces} | Commits: ${commitKernel.getCommitCount()}`);
  console.log(`  Dimensions: ${conceptSpace.getDimensionCount()} | Modalities: ${modalities.getModalityCount()}`);
  console.log(`  Affect: mode=${finalAffect.mode} val=${finalAffect.valence}`);
  console.log(`  Energy: ${finalEnergy.current}/${finalEnergy.max} total_spent=${finalEnergy.total_energy_spent}`);

  console.log(`\n  ── DEVELOPMENTAL PROFILE ──`);
  console.log(devMetrics.formatSnapshot(finalSnap));

  // World progression history
  const levelHist = world.getLevelHistory();
  if (levelHist.length > 1) {
    console.log(`\n  ── WORLD PROGRESSION ──`);
    for (const lh of levelHist) {
      console.log(`  Level ${lh.level} at tick ${lh.tick}`);
    }
  }

  // Show developmental trajectory
  const history = devMetrics.getHistory();
  if (history.length >= 3) {
    console.log(`\n  ── DEVELOPMENTAL TRAJECTORY ──`);
    for (const snap of history) {
      console.log(`  tick=${snap.tick} stage=${snap.stage} health=${snap.overall_health} accuracy=${snap.world_model.property_accuracy} abstractions=${snap.cognitive.abstraction_count}`);
    }
  }

  for (const d of conceptSpace.getDimensions().slice(0, 5)) {
    console.log(`  axis_${d.id}: ${d.label || '(unnamed)'}`);
  }
  for (const m of modalities.getModalities().slice(0, 5)) {
    console.log(`  modality #${m.id}: ${m.label || '(unlabeled)'} (${m.member_count} events)`);
  }

  await app.close();
}

main().catch(e => console.error('FATAL:', e.message || e));
