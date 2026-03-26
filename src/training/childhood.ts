/**
 * CHILDHOOD: A child living in a virtual world.
 *
 * Not lessons — LIFE. The world generates multi-modal events.
 * Teacher intervenes on demand (not on schedule).
 * Reflection between experiences. Sleep after fatigue.
 *
 * Three teacher modes (demand-driven):
 *   MAMA (haiku): warm, naming, emotional — when everything is new
 *   SPECIALIST (sonnet): deep, structural — when stuck or confused
 *   ALONE: no LLM, autonomous — when confident
 *
 * Rhythm: experience → reflect → check readiness → next experience
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { CognitivePipelineService } from '../cognitive/cognitive-pipeline.service';
import { TraceGraphService } from '../kernel/memory/trace-graph.service';
import { CommitKernelService } from '../kernel/commit/commit-kernel.service';
import { AffectiveStateService } from '../kernel/affect/affective-state.service';
import { ConceptSpaceService } from '../kernel/space/concept-space.service';
import { ModalityDiscoveryService } from '../kernel/sensory/modality-discovery.service';
import { SurrealService } from '../database/surreal.service';
import { VirtualWorld } from './virtual-world';

const TOTAL_TICKS = parseInt(process.argv[2] || '500', 10);
const REPORT_INTERVAL = Math.max(10, Math.floor(TOTAL_TICKS / 20));

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn'] });
  const pipeline = app.get(CognitivePipelineService);
  const traceGraph = app.get(TraceGraphService);
  const commitKernel = app.get(CommitKernelService);
  const affect = app.get(AffectiveStateService);
  const conceptSpace = app.get(ConceptSpaceService);
  const modalities = app.get(ModalityDiscoveryService);
  const db = app.get(SurrealService);

  const world = new VirtualWorld();

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  CHILDHOOD: ${TOTAL_TICKS} world ticks`);
  console.log(`  Location: ${world.getState().location}`);
  console.log(`${'═'.repeat(60)}\n`);

  let totalMs = 0;
  let teacherCalls = { mama: 0, specialist: 0, alone: 0 };
  let totalReflectionCycles = 0;
  let lastReportTraces = 0;

  for (let tick = 0; tick < TOTAL_TICKS; tick++) {
    // === WORLD TICK: generate multi-modal events ===
    const events = world.tick();
    if (events.length === 0) continue;

    // === PROCESS each event through kernel ===
    for (const event of events) {
      const start = Date.now();
      const result = await pipeline.processMessage(event.content);
      totalMs += Date.now() - start;
    }

    // === CHECK: does child need teacher? ===
    const affectState = affect.getSnapshot();
    const needsTeacher = decideTeacher(affectState, tick, modalities.getModalityCount());
    teacherCalls[needsTeacher]++;

    // If teacher needed, send a teaching event through pipeline
    if (needsTeacher === 'mama' || needsTeacher === 'specialist') {
      const worldState = world.getState();
      const obj = worldState.objects.length > 0
        ? worldState.objects[Math.floor(Math.random() * worldState.objects.length)]
        : null;

      if (obj) {
        const teachingText = needsTeacher === 'mama'
          ? `Мама показывает: "Смотри, это ${obj.nameRu}. Он ${obj.properties.color || ''} и ${obj.properties.shape || ''}. ${obj.nameRu.charAt(0).toUpperCase() + obj.nameRu.slice(1)} ${obj.properties.physics || ''}. Запомни!"`
          : `Учитель объясняет: "${obj.nameRu} — это предмет. Его свойства: форма — ${obj.properties.shape || '?'}, цвет — ${obj.properties.color || '?'}, размер — ${obj.properties.size || '?'}. Он ${obj.properties.physics || 'обычный'} потому что ${obj.properties.texture || 'такой'}."`;

        const start = Date.now();
        await pipeline.processMessage(teachingText);
        totalMs += Date.now() - start;
      }
    }

    // === REFLECTION: wait until kernel settles ===
    // Not a fixed pause — wait until the mind calms down.
    // Like a child: sees something new → eyes wide → thinking... → "ah, got it" → ready.
    let reflectionCycles = 0;
    const maxReflection = 20;
    while (reflectionCycles < maxReflection) {
      const state = affect.getSnapshot();
      // Settled: low arousal = "переварил"
      if (state.arousal < 0.3 && reflectionCycles > 2) break;
      // Bored: very low arousal = nothing to process
      if (state.arousal < 0.15) break;
      // Give kernel one idle tick to dream/infer/reflect
      await new Promise(r => setTimeout(r, 100));
      reflectionCycles++;
    }
    totalReflectionCycles += reflectionCycles;

    // === REPORT ===
    if ((tick + 1) % REPORT_INTERVAL === 0 || tick === TOTAL_TICKS - 1) {
      const traces = await traceGraph.getTraceCount();
      const commits = commitKernel.getCommitCount();
      const dims = conceptSpace.getDimensionCount();
      const mods = modalities.getModalityCount();
      const pct = Math.round(((tick + 1) / TOTAL_TICKS) * 100);
      const worldState = world.getState();

      console.log(`\n  ── ${pct}% (tick ${tick + 1}/${TOTAL_TICKS}) ──`);
      console.log(`  Location: ${worldState.location} | Weather: ${worldState.weather} | Time: ${worldState.timeOfDay}`);
      console.log(`  Traces: ${traces} (+${traces - lastReportTraces}) | Commits: ${commits} | Dims: ${dims} | Modalities: ${mods}`);
      console.log(`  Affect: mode=${affectState.mode} val=${affectState.valence} arousal=${affectState.arousal} loss=${affectState.loss}`);
      console.log(`  Teacher: mama=${teacherCalls.mama} specialist=${teacherCalls.specialist} alone=${teacherCalls.alone}`);
      console.log(`  Reflection: ${totalReflectionCycles} total cycles (avg ${(totalReflectionCycles / Math.max(1, tick + 1)).toFixed(1)}/tick)`);
      console.log(`  Avg: ${Math.round(totalMs / Math.max(1, tick + 1))}ms/tick`);

      // Abstractions
      const abstractions = await db.query<Record<string, unknown>>(
        `SELECT content, weight FROM trace WHERE (content CONTAINS '[ABSTRACT]' OR content CONTAINS '[PROPERTY]') AND archived = false ORDER BY weight DESC LIMIT 3`,
      );
      if (abstractions.isOk() && abstractions.value.length > 0) {
        console.log(`  Abstractions: ${abstractions.value.map(a => `"${(a.content as string).slice(0, 50)}"`).join(', ')}`);
      }

      lastReportTraces = traces;
    }
  }

  // === FINAL REPORT ===
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  CHILDHOOD COMPLETE');
  console.log(`${'═'.repeat(60)}`);

  const finalTraces = await traceGraph.getTraceCount();
  const finalAffect = affect.getSnapshot();

  console.log(`\n  World ticks: ${TOTAL_TICKS}`);
  console.log(`  Total time: ${Math.round(totalMs / 1000)}s`);
  console.log(`  Traces: ${finalTraces}`);
  console.log(`  Commits: ${commitKernel.getCommitCount()}`);
  console.log(`  Dimensions: ${conceptSpace.getDimensionCount()}`);
  console.log(`  Modalities: ${modalities.getModalityCount()}`);
  console.log(`  Teacher calls: mama=${teacherCalls.mama} specialist=${teacherCalls.specialist} alone=${teacherCalls.alone}`);
  console.log(`  Affect: mode=${finalAffect.mode} val=${finalAffect.valence} loss=${finalAffect.loss}`);

  const allDims = conceptSpace.getDimensions();
  if (allDims.length > 0) {
    console.log(`\n  Dimensions:`);
    for (const d of allDims.slice(0, 10)) {
      console.log(`    axis_${d.id}: ${d.label || '(unnamed)'} (usage=${d.usage_count})`);
    }
  }

  const allMods = modalities.getModalities();
  if (allMods.length > 0) {
    console.log(`\n  Modalities:`);
    for (const m of allMods) {
      console.log(`    #${m.id}: ${m.label || '(unlabeled)'} (${m.member_count} events)`);
    }
  }

  await app.close();
}

/**
 * Demand-driven teacher selection.
 * Based on child's internal state, not schedule.
 */
function decideTeacher(
  affect: { arousal: number; valence: number; pain: { intensity: number }; hormones: { cortisol: number; dopamine: number } },
  tick: number,
  modalityCount: number,
): 'mama' | 'specialist' | 'alone' {
  // Early ticks: mama almost always (everything is new)
  if (tick < 30) return Math.random() < 0.7 ? 'mama' : 'alone';

  // High cortisol (stressed) + high pain → specialist
  if (affect.hormones.cortisol > 0.6 && affect.pain.intensity > 0.3) return 'specialist';

  // Low arousal (bored/tired) → mama for encouragement
  if (affect.arousal < 0.2) return 'mama';

  // High dopamine (learning well) → mostly alone
  if (affect.hormones.dopamine > 0.6) return Math.random() < 0.1 ? 'mama' : 'alone';

  // New modality just discovered → mama to label it
  if (modalityCount > 5 && Math.random() < 0.3) return 'mama';

  // Default: power-law distribution
  // As tick increases, less teacher needed
  const teacherProb = Math.max(0.05, 0.5 * Math.exp(-tick / 200));
  if (Math.random() < teacherProb) {
    return Math.random() < 0.7 ? 'mama' : 'specialist';
  }

  return 'alone';
}

main().catch(e => console.error('FATAL:', e.message || e));
