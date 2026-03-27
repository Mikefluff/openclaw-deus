/**
 * CHILDHOOD: Child lives in a world. Kernel IS the child.
 *
 * Training script is NOT the brain — it's the WORLD + OBSERVER.
 * - Creates virtual world
 * - Feeds world events to kernel
 * - Executes kernel's actions in the world
 * - Observes and reports (never controls)
 *
 * The kernel decides: what to explore, when to rest, when to ask for help.
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { CognitivePipelineService } from '../cognitive/cognitive-pipeline.service';
import { KernelLoopService } from '../kernel/kernel-loop.service';
import { TraceGraphService } from '../kernel/memory/trace-graph.service';
import { CommitKernelService } from '../kernel/commit/commit-kernel.service';
import { AffectiveStateService } from '../kernel/affect/affective-state.service';
import { ConceptSpaceService } from '../kernel/space/concept-space.service';
import { ModalityDiscoveryService } from '../kernel/sensory/modality-discovery.service';
import { EnergyService } from '../kernel/energy.service';
import { SurrealService } from '../database/surreal.service';
import { VirtualWorld } from './virtual-world';
import { AgentAction, ActionConsequence, WorldBridge } from '../kernel/agency.types';

const TOTAL_TICKS = parseInt(process.argv[2] || '500', 10);
const REPORT_INTERVAL = Math.max(10, Math.floor(TOTAL_TICKS / 20));

/**
 * WorldBridge: connects kernel's agency to the virtual world.
 * Kernel ACTS → bridge EXECUTES → world RESPONDS.
 */
class VirtualWorldBridge implements WorldBridge {
  constructor(private readonly world: VirtualWorld) {}

  async executeAction(action: AgentAction): Promise<ActionConsequence[]> {
    const consequences = this.world.childAction(action.method || 'touch', action.target);
    return consequences.map(e => ({
      content: e.content,
      source: e.source,
      emotional_valence: this.inferValence(e.content),
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
  const pipeline = app.get(CognitivePipelineService);
  const kernelLoop = app.get(KernelLoopService);
  const traceGraph = app.get(TraceGraphService);
  const commitKernel = app.get(CommitKernelService);
  const affect = app.get(AffectiveStateService);
  const conceptSpace = app.get(ConceptSpaceService);
  const modalities = app.get(ModalityDiscoveryService);
  const energy = app.get(EnergyService);
  const db = app.get(SurrealService);

  const world = new VirtualWorld();
  const bridge = new VirtualWorldBridge(world);

  // Connect kernel to world — kernel can now ACT
  kernelLoop.setWorld(bridge);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  CHILDHOOD: ${TOTAL_TICKS} world ticks`);
  console.log(`  Location: ${world.getState().location}`);
  console.log(`  Kernel controls its own life.`);
  console.log(`${'═'.repeat(60)}\n`);

  let totalMs = 0;
  let lastReportTraces = 0;

  for (let tick = 0; tick < TOTAL_TICKS; tick++) {
    const start = Date.now();

    // === WORLD TICK: generate ambient events ===
    const events = world.tick();

    // === FEED events to kernel (kernel decides what to do with them) ===
    for (const event of events) {
      await pipeline.processMessage(event.content);
    }

    totalMs += Date.now() - start;

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
      console.log(`  World: ${worldState.location} | ${worldState.weather} | ${worldState.timeOfDay}`);
      console.log(`  Brain: traces=${traces}(+${traces - lastReportTraces}) commits=${commits} dims=${dims} modalities=${mods}`);
      console.log(`  Affect: mode=${affectState.mode} val=${affectState.valence} arousal=${affectState.arousal}`);
      console.log(`  Energy: ${energyState.current}/${energyState.max} fatigue=${energyState.fatigue_level} sleeps=${energyState.cycles_since_sleep > 0 ? 'awake' : 'just slept'}`);
      console.log(`  Speed: ${Math.round(totalMs / Math.max(1, tick + 1))}ms/tick`);

      // World model check
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
          const texts = traces_q.value.map(t => (t.content as string || '').toLowerCase());
          if (Object.values(obj.properties).some(p => texts.some(t => t.includes(p.toLowerCase())))) correct++;
        }
      }
      if (total > 0) console.log(`  World model: ${correct}/${total} objects correct (${Math.round(correct / total * 100)}%)`);

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

  console.log(`\n  Ticks: ${TOTAL_TICKS} | Time: ${Math.round(totalMs / 1000)}s`);
  console.log(`  Traces: ${finalTraces} | Commits: ${commitKernel.getCommitCount()}`);
  console.log(`  Dimensions: ${conceptSpace.getDimensionCount()} | Modalities: ${modalities.getModalityCount()}`);
  console.log(`  Affect: mode=${finalAffect.mode} val=${finalAffect.valence}`);
  console.log(`  Energy: ${finalEnergy.current}/${finalEnergy.max} total_spent=${finalEnergy.total_energy_spent}`);

  for (const d of conceptSpace.getDimensions().slice(0, 5)) {
    console.log(`  axis_${d.id}: ${d.label || '(unnamed)'}`);
  }
  for (const m of modalities.getModalities().slice(0, 5)) {
    console.log(`  modality #${m.id}: ${m.label || '(unlabeled)'} (${m.member_count} events)`);
  }

  await app.close();
}

main().catch(e => console.error('FATAL:', e.message || e));
