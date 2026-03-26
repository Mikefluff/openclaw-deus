/**
 * CHILDHOOD: Teach through INSTANCES, not definitions.
 *
 * Children don't learn "circle = round shape with no corners".
 * They see ball, plate, wheel → notice "round" → abstract concept emerges.
 *
 * Level 1: Concrete objects (ball, plate, box, book)
 * Level 2: More objects → system notices shared properties
 * Level 3: Contrasts (round vs angular) → system forms categories
 * Level 4: New objects → system predicts properties from categories
 * Level 5: Abstract questions → system uses emerged concepts
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { CognitivePipelineService } from '../cognitive/cognitive-pipeline.service';
import { KernelLoopService } from '../kernel/kernel-loop.service';
import { TraceGraphService } from '../kernel/memory/trace-graph.service';
import { CommitKernelService } from '../kernel/commit/commit-kernel.service';
import { AffectiveStateService } from '../kernel/affect/affective-state.service';
import { SurrealService } from '../database/surreal.service';

const CURRICULUM = [
  {
    level: 1,
    name: 'First objects',
    teach: [
      'Вот мячик. Мячик круглый. Мячик катится.',
      'Вот кубик. У кубика углы. Кубик не катится.',
      'Вот тарелка. Тарелка круглая. Тарелка гладкая.',
      'Вот книжка. У книжки углы. Книжка прямоугольная.',
    ],
    test: [
      'Что катится?',
      'У чего есть углы?',
    ],
  },
  {
    level: 2,
    name: 'More instances → patterns should emerge',
    teach: [
      'Вот колесо. Колесо круглое. Колесо катится, как мячик.',
      'Вот коробка. У коробки углы. Коробка не катится, как кубик.',
      'Вот монетка. Монетка круглая и маленькая.',
      'Вот окно. Окно прямоугольное. У окна углы.',
    ],
    test: [
      'Монетка катится?',
      'Что общего у мячика и колеса?',
      'Что общего у кубика и коробки?',
    ],
  },
  {
    level: 3,
    name: 'Contrasts → categories should form',
    teach: [
      'Круглые вещи катятся: мячик, колесо, монетка.',
      'Угловатые вещи не катятся: кубик, коробка, книжка.',
      'Вот апельсин. Апельсин круглый и оранжевый.',
      'Вот кирпич. У кирпича углы. Кирпич тяжёлый.',
    ],
    test: [
      'Апельсин катится?',
      'Кирпич круглый?',
      'Назови что-то круглое.',
    ],
  },
  {
    level: 4,
    name: 'Prediction from categories',
    teach: [
      'Вот арбуз. Какой он формы?',
      'Вот телевизор. Какой он формы?',
      'Мяч для футбола и мяч для регби — оба мячи, но разной формы.',
    ],
    test: [
      'Арбуз катится?',
      'У телевизора есть углы?',
      'Мяч для регби круглый?',
    ],
  },
  {
    level: 5,
    name: 'Abstract reasoning',
    teach: [
      'Всё что круглое — может катиться. Это свойство формы.',
      'Углы мешают катиться. Чем больше углов — тем хуже катится.',
      'Если много-много углов и все маленькие — почти как круг.',
    ],
    test: [
      'Почему круглое катится?',
      'Шестиугольник катится лучше чем квадрат?',
      'Что общего у всех круглых предметов?',
    ],
  },
];

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'log'] });
  const pipeline = app.get(CognitivePipelineService);
  const traceGraph = app.get(TraceGraphService);
  const commitKernel = app.get(CommitKernelService);
  const affect = app.get(AffectiveStateService);
  const db = app.get(SurrealService);

  for (const level of CURRICULUM) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  LEVEL ${level.level}: ${level.name}`);
    console.log(`${'═'.repeat(60)}\n`);

    const tracesBefore = await traceGraph.getTraceCount();

    // === TEACH ===
    for (const lesson of level.teach) {
      console.log(`  📚 "${lesson}"`);
      const r = await pipeline.processMessage(lesson);
      if (r.isOk()) console.log(`     → ${r.value.duration_ms}ms`);
    }

    // === OBSERVE ===
    const tracesAfter = await traceGraph.getTraceCount();
    const affectState = affect.getSnapshot();

    // Check for emerged abstractions
    const abstractions = await db.query<any>(
      `SELECT content, weight, confidence FROM trace WHERE content CONTAINS '[ABSTRACT]' OR content CONTAINS '[PROPERTY]' AND archived = false ORDER BY weight DESC LIMIT 10`,
    );
    const abstractCount = abstractions.isOk() ? abstractions.value.length : 0;

    console.log(`\n  📊 Level ${level.level}:`);
    console.log(`     Traces: +${tracesAfter - tracesBefore} (total: ${tracesAfter})`);
    console.log(`     Affect: mode=${affectState.mode} valence=${affectState.valence} arousal=${affectState.arousal}`);

    if (abstractions.isOk() && abstractions.value.length > 0) {
      console.log(`\n  🧠 EMERGED ABSTRACTIONS (${abstractCount}):`);
      for (const a of abstractions.value) {
        console.log(`     "${a.content.slice(0, 70)}" (w=${(a.weight || 0).toFixed(2)}, c=${(a.confidence || 0).toFixed(2)})`);
      }
    } else {
      console.log(`     No abstractions yet — need more instances`);
    }

    // === TEST ===
    console.log(`\n  🧪 Tests:`);
    for (const q of level.test) {
      console.log(`     Q: "${q}"`);
      const r = await pipeline.processMessage(q);
      if (r.isOk()) {
        const active = await traceGraph.getActiveTraces(3);
        if (active.isOk() && active.value.length > 0) {
          for (const t of active.value.slice(0, 2)) {
            console.log(`     → "${t.content.slice(0, 60)}" (w=${t.weight.toFixed(2)})`);
          }
        }
      }
    }

    await new Promise(r => setTimeout(r, 500));
  }

  // === FINAL ===
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  DEVELOPMENT SUMMARY');
  console.log(`${'═'.repeat(60)}`);

  const totalTraces = await traceGraph.getTraceCount();
  const totalCommits = commitKernel.getCommitCount();
  const finalAffect = affect.getSnapshot();

  const allAbstractions = await db.query<any>(
    `SELECT content, weight, confidence FROM trace WHERE (content CONTAINS '[ABSTRACT]' OR content CONTAINS '[PROPERTY]') AND archived = false ORDER BY weight DESC`,
  );

  console.log(`\n  Traces: ${totalTraces}`);
  console.log(`  Commits: ${totalCommits}`);
  console.log(`  Affect: mode=${finalAffect.mode} valence=${finalAffect.valence} loss=${finalAffect.loss}`);
  console.log(`  Hormones: C=${finalAffect.hormones.cortisol.toFixed(2)} D=${finalAffect.hormones.dopamine.toFixed(2)}`);

  if (allAbstractions.isOk() && allAbstractions.value.length > 0) {
    console.log(`\n  EMERGED CONCEPTS (${allAbstractions.value.length}):`);
    for (const a of allAbstractions.value) {
      console.log(`    "${a.content.slice(0, 80)}"`);
    }
  } else {
    console.log('\n  No abstractions emerged — more training needed');
  }

  await app.close();
}

main().catch(e => console.error('FATAL:', e.message || e));
