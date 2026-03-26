/**
 * CHILDHOOD TRAINING: 1000 lessons, tracked metrics, progressive reporting.
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
import { generateCurriculum } from './curriculum-generator';

async function main() {
  const LESSON_COUNT = parseInt(process.argv[2] || '1000', 10);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn'] });
  const pipeline = app.get(CognitivePipelineService);
  const traceGraph = app.get(TraceGraphService);
  const commitKernel = app.get(CommitKernelService);
  const affect = app.get(AffectiveStateService);
  const conceptSpace = app.get(ConceptSpaceService);
  const modalities = app.get(ModalityDiscoveryService);
  const db = app.get(SurrealService);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  CHILDHOOD TRAINING: ${LESSON_COUNT} lessons`);
  console.log(`${'═'.repeat(60)}\n`);

  const lessons = generateCurriculum(LESSON_COUNT);
  const domainCounts: Record<string, number> = {};
  let totalMs = 0;
  let totalCommits = 0;

  // Report every N lessons
  const REPORT_INTERVAL = Math.max(10, Math.floor(LESSON_COUNT / 20));

  for (let i = 0; i < lessons.length; i++) {
    const lesson = lessons[i];
    domainCounts[lesson.domain] = (domainCounts[lesson.domain] || 0) + 1;

    const start = Date.now();
    const result = await pipeline.processMessage(lesson.text);
    const ms = Date.now() - start;
    totalMs += ms;

    if (result.isOk()) {
      totalCommits += result.value.deliberations_made + result.value.intentions_recognized;
    }

    // Progress bar
    if ((i + 1) % REPORT_INTERVAL === 0 || i === lessons.length - 1) {
      const pct = Math.round(((i + 1) / lessons.length) * 100);
      const traces = await traceGraph.getTraceCount();
      const commits = commitKernel.getCommitCount();
      const dims = conceptSpace.getDimensionCount();
      const mods = modalities.getModalityCount();
      const affectState = affect.getSnapshot();

      console.log(`\n  ── ${pct}% (${i + 1}/${lessons.length}) ──`);
      console.log(`  Traces: ${traces} | Commits: ${commits} | Dims: ${dims} | Modalities: ${mods}`);
      console.log(`  Affect: mode=${affectState.mode} val=${affectState.valence} arousal=${affectState.arousal} loss=${affectState.loss}`);
      console.log(`  Hormones: C=${affectState.hormones.cortisol} D=${affectState.hormones.dopamine} NE=${affectState.hormones.norepinephrine} S=${affectState.hormones.serotonin}`);
      console.log(`  Avg latency: ${Math.round(totalMs / (i + 1))}ms/lesson`);
      console.log(`  Domains: ${Object.entries(domainCounts).map(([d, c]) => `${d}:${c}`).join(' ')}`);

      // Check for emerged abstractions
      const abstractions = await db.query<Record<string, unknown>>(
        `SELECT content, weight, confidence FROM trace
         WHERE (content CONTAINS '[ABSTRACT]' OR content CONTAINS '[PROPERTY]')
         AND archived = false ORDER BY weight DESC LIMIT 5`,
      );
      if (abstractions.isOk() && abstractions.value.length > 0) {
        console.log(`  ABSTRACTIONS (${abstractions.value.length}):`);
        for (const a of abstractions.value.slice(0, 3)) {
          console.log(`    "${(a.content as string || '').slice(0, 70)}" (w=${a.weight})`);
        }
      }

      // Check dimensions
      const dimsList = conceptSpace.getDimensions();
      if (dimsList.length > 0) {
        console.log(`  DIMENSIONS (${dimsList.length}):`);
        for (const d of dimsList.slice(0, 3)) {
          console.log(`    axis_${d.id}: ${d.label || '(unnamed)'} (usage=${d.usage_count})`);
        }
      }

      // Check modalities
      const modList = modalities.getModalities();
      if (modList.length > 0) {
        console.log(`  MODALITIES (${modList.length}):`);
        for (const m of modList.slice(0, 5)) {
          console.log(`    #${m.id}: ${m.label || '(unlabeled)'} (${m.member_count} events)`);
        }
      }
    }
  }

  // === FINAL REPORT ===
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  FINAL DEVELOPMENT REPORT');
  console.log(`${'═'.repeat(60)}`);

  const finalTraces = await traceGraph.getTraceCount();
  const finalCommits = commitKernel.getCommitCount();
  const finalAffect = affect.getSnapshot();

  console.log(`\n  Lessons processed: ${lessons.length}`);
  console.log(`  Total time: ${Math.round(totalMs / 1000)}s (avg ${Math.round(totalMs / lessons.length)}ms/lesson)`);
  console.log(`  Traces: ${finalTraces}`);
  console.log(`  Commits: ${finalCommits}`);
  console.log(`  Dimensions: ${conceptSpace.getDimensionCount()}`);
  console.log(`  Modalities: ${modalities.getModalityCount()}`);
  console.log(`  Affect: mode=${finalAffect.mode} valence=${finalAffect.valence} arousal=${finalAffect.arousal}`);
  console.log(`  Loss: ${finalAffect.loss}`);

  console.log(`\n  Domains taught:`);
  for (const [domain, count] of Object.entries(domainCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${domain}: ${count} lessons`);
  }

  console.log(`\n  Emerged concepts:`);
  const allAbstractions = await db.query<Record<string, unknown>>(
    `SELECT content, weight FROM trace WHERE (content CONTAINS '[ABSTRACT]' OR content CONTAINS '[PROPERTY]') AND archived = false ORDER BY weight DESC LIMIT 20`,
  );
  if (allAbstractions.isOk()) {
    for (const a of allAbstractions.value) {
      console.log(`    "${(a.content as string || '').slice(0, 80)}"`);
    }
  }

  console.log(`\n  Concept space dimensions:`);
  for (const d of conceptSpace.getDimensions()) {
    console.log(`    axis_${d.id}: ${d.label || '(unnamed)'} (born cycle ${d.born_at_cycle}, usage ${d.usage_count})`);
  }

  console.log(`\n  Discovered modalities:`);
  for (const m of modalities.getModalities()) {
    console.log(`    #${m.id}: ${m.label || '(unlabeled)'} (${m.member_count} events)`);
  }

  await app.close();
}

main().catch(e => console.error('FATAL:', e.message || e));
