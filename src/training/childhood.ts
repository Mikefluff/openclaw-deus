/**
 * CHILDHOOD: Train the kernel like a child learning concepts.
 *
 * Level 1: Simple shapes — circle, square, triangle
 * Level 2: Properties — sides, corners, round
 * Level 3: Relationships — "circle is like oval", "square is like rectangle"
 * Level 4: Categories — "round things" vs "angular things"
 * Level 5: Abstract reasoning — "all polygons have corners"
 *
 * After each level: test what the kernel learned by asking questions.
 * Monitor: traces, edges, schemas, affect, world model.
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

interface LevelResult {
  level: number;
  name: string;
  messages_processed: number;
  traces_created: number;
  total_commits: number;
  schemas_detected: number;
  affect_state: any;
  test_results: Array<{ question: string; answer: string; traces_activated: number }>;
}

const CURRICULUM = [
  {
    level: 1,
    name: 'Basic shapes',
    teach: [
      'Круг — это фигура. Круг круглый. У круга нет углов.',
      'Квадрат — это фигура. У квадрата 4 стороны. У квадрата 4 угла. Все стороны квадрата равны.',
      'Треугольник — это фигура. У треугольника 3 стороны. У треугольника 3 угла.',
    ],
    test: [
      'Что круглое?',
      'У чего есть углы?',
      'Сколько сторон у квадрата?',
    ],
  },
  {
    level: 2,
    name: 'Properties',
    teach: [
      'Углы бывают у многоугольников. Круг — не многоугольник.',
      'Квадрат — это частный случай прямоугольника. У прямоугольника все углы прямые.',
      'Стороны бывают равные и неравные. У квадрата все стороны равные. У прямоугольника — не все.',
    ],
    test: [
      'Квадрат — это многоугольник?',
      'Чем отличается квадрат от прямоугольника?',
      'У круга есть стороны?',
    ],
  },
  {
    level: 3,
    name: 'Relationships',
    teach: [
      'Круг похож на овал — оба круглые, без углов. Но овал вытянутый.',
      'Квадрат похож на ромб — у обоих все стороны равны. Но у квадрата углы прямые.',
      'Треугольник бывает разный: равносторонний, равнобедренный, прямоугольный.',
    ],
    test: [
      'Что общего у круга и овала?',
      'Чем похожи квадрат и ромб?',
      'Какие бывают треугольники?',
    ],
  },
  {
    level: 4,
    name: 'Categories',
    teach: [
      'Фигуры делятся на круглые и угловатые. Круглые: круг, овал, эллипс. Угловатые: квадрат, треугольник, прямоугольник.',
      'Многоугольники — это фигуры с прямыми сторонами. Квадрат, треугольник, пятиугольник — многоугольники.',
      'Количество сторон определяет тип многоугольника: 3 — треугольник, 4 — четырёхугольник, 5 — пятиугольник.',
    ],
    test: [
      'Круг — многоугольник?',
      'Что такое четырёхугольник?',
      'Приведи примеры круглых фигур.',
    ],
  },
  {
    level: 5,
    name: 'Abstract reasoning',
    teach: [
      'Все многоугольники имеют формулу: сумма углов = (n-2) * 180°, где n — количество сторон.',
      'Площадь круга = π * r². Площадь квадрата = a². Площадь треугольника = (a * h) / 2.',
      'Если фигура имеет бесконечное количество сторон бесконечно малой длины — она стремится к кругу.',
    ],
    test: [
      'Какова сумма углов треугольника?',
      'Что больше — площадь круга с радиусом 1 или квадрата со стороной 2?',
      'Почему круг — это предел многоугольника?',
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

  const results: LevelResult[] = [];

  for (const level of CURRICULUM) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  LEVEL ${level.level}: ${level.name}`);
    console.log(`${'═'.repeat(60)}\n`);

    const tracesBefore = await traceGraph.getTraceCount();
    const commitsBefore = commitKernel.getCommitCount();
    let messagesProcessed = 0;

    // === TEACH ===
    for (const lesson of level.teach) {
      console.log(`  📚 Teaching: "${lesson.slice(0, 60)}..."`);
      const result = await pipeline.processMessage(lesson);
      if (result.isOk()) {
        messagesProcessed++;
        console.log(`     → ${result.value.duration_ms}ms`);
      } else {
        console.log(`     ✗ Error: ${result.error.message}`);
      }
    }

    // === OBSERVE ===
    const tracesAfter = await traceGraph.getTraceCount();
    const commitsAfter = commitKernel.getCommitCount();
    const affectState = affect.getSnapshot();

    // Check for schemas
    const schemas = await db.query<any>(
      `SELECT in.content AS a, out.content AS b, co_activation_count AS freq, weight
       FROM activates WHERE co_activation_count > 2 ORDER BY co_activation_count DESC LIMIT 5`,
    );
    const schemaCount = schemas.isOk() ? schemas.value.length : 0;

    console.log(`\n  📊 Level ${level.level} stats:`);
    console.log(`     Traces: ${tracesBefore} → ${tracesAfter} (+${tracesAfter - tracesBefore})`);
    console.log(`     Commits: ${commitsBefore} → ${commitsAfter} (+${commitsAfter - commitsBefore})`);
    console.log(`     Schemas: ${schemaCount}`);
    console.log(`     Affect: mode=${affectState.mode}, valence=${affectState.valence}, arousal=${affectState.arousal}`);
    console.log(`     Pain: ${affectState.pain.intensity.toFixed(2)}, Loss: ${affectState.loss}`);

    if (schemas.isOk() && schemas.value.length > 0) {
      console.log(`\n  🧠 Detected patterns:`);
      for (const s of schemas.value.slice(0, 3)) {
        console.log(`     "${(s.a || '').slice(0, 40)}" → "${(s.b || '').slice(0, 40)}" (${s.freq}x, w=${(s.weight || 0).toFixed(2)})`);
      }
    }

    // === TEST ===
    console.log(`\n  🧪 Testing level ${level.level}:`);
    const testResults: LevelResult['test_results'] = [];

    for (const question of level.test) {
      console.log(`     Q: "${question}"`);
      const result = await pipeline.processMessage(question);
      if (result.isOk()) {
        // Check what traces were activated
        const activeTraces = await traceGraph.getActiveTraces(5);
        const traceCount = activeTraces.isOk() ? activeTraces.value.length : 0;
        const topTrace = activeTraces.isOk() && activeTraces.value.length > 0
          ? activeTraces.value[0].content.slice(0, 60) : 'none';
        console.log(`     A: [${traceCount} traces active] "${topTrace}"`);
        testResults.push({ question, answer: topTrace, traces_activated: traceCount });
      }
    }

    results.push({
      level: level.level,
      name: level.name,
      messages_processed: messagesProcessed,
      traces_created: tracesAfter - tracesBefore,
      total_commits: commitsAfter - commitsBefore,
      schemas_detected: schemaCount,
      affect_state: affectState,
      test_results: testResults,
    });

    // Brief pause between levels
    await new Promise(r => setTimeout(r, 1000));
  }

  // === FINAL REPORT ===
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  DEVELOPMENT REPORT');
  console.log(`${'═'.repeat(60)}\n`);

  for (const r of results) {
    console.log(`  Level ${r.level} (${r.name}):`);
    console.log(`    Traces: +${r.traces_created}, Commits: +${r.total_commits}, Schemas: ${r.schemas_detected}`);
    console.log(`    Affect: mode=${r.affect_state.mode}, valence=${r.affect_state.valence}`);
    console.log(`    Tests: ${r.test_results.filter(t => t.traces_activated > 0).length}/${r.test_results.length} activated traces`);
  }

  const finalTraces = await traceGraph.getTraceCount();
  const finalAffect = affect.getSnapshot();
  console.log(`\n  Final state:`);
  console.log(`    Total traces: ${finalTraces}`);
  console.log(`    Total commits: ${commitKernel.getCommitCount()}`);
  console.log(`    Affect: mode=${finalAffect.mode}, valence=${finalAffect.valence}, loss=${finalAffect.loss}`);
  console.log(`    Hormones: C=${finalAffect.hormones.cortisol.toFixed(2)} D=${finalAffect.hormones.dopamine.toFixed(2)} NE=${finalAffect.hormones.norepinephrine.toFixed(2)} S=${finalAffect.hormones.serotonin.toFixed(2)}`);

  await app.close();
}

main().catch(e => console.error('FATAL:', e.message || e));
