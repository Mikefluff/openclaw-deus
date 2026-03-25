import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { BootstrapService } from './bootstrap/bootstrap.service';
import { HealthService } from './health/health.service';
import { BeliefsService } from './beliefs/beliefs.service';
import { BeliefDecayService } from './beliefs/services/belief-decay.service';
import { BeliefExtractionService } from './beliefs/services/belief-extraction.service';
import { BeliefContradictionService } from './beliefs/services/belief-contradiction.service';
import { BeliefPromotionService } from './beliefs/services/belief-promotion.service';
import { MemoryService } from './memory/memory.service';
import { MemoryAggregationService } from './memory/services/memory-aggregation.service';
import { PolicyService } from './policy/policy.service';
import { WorldModelService } from './world-model/world-model.service';
import { IntrospectionService } from './introspection/introspection.service';
import { NightlyService } from './nightly/nightly.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const command = process.argv[2];
  const args = process.argv.slice(3);

  try {
    const result = await runCommand(app, command, args);
    if (result !== undefined) {
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (e: any) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  } finally {
    await app.close();
  }
}

async function runCommand(app: any, command: string, args: string[]): Promise<any> {
  switch (command) {
    case 'bootstrap': {
      const svc = app.get(BootstrapService);
      await svc.runMigrations();
      const report = await svc.validate();
      if (report.isErr()) throw new Error(report.error.message);
      const seed = await svc.seedFromCoreJsonl();
      return { ...report.value, seed: seed.isOk() ? seed.value : { error: seed.error.message } };
    }

    case 'health': {
      const svc = app.get(HealthService);
      const r = await svc.getHealth();
      if (r.isErr()) throw new Error(r.error.message);
      return r.value;
    }

    case 'beliefs:list': {
      const svc = app.get(BeliefsService);
      const r = await svc.findAll();
      if (r.isErr()) throw new Error(r.error.message);
      return r.value;
    }

    case 'beliefs:get': {
      const svc = app.get(BeliefsService);
      const r = await svc.findById(args[0]);
      if (r.isErr()) throw new Error(r.error.message);
      return r.value;
    }

    case 'beliefs:extract': {
      const svc = app.get(BeliefExtractionService);
      const r = await svc.extractFromMemory();
      if (r.isErr()) throw new Error(r.error.message);
      return r.value;
    }

    case 'beliefs:decay': {
      const svc = app.get(BeliefDecayService);
      const r = await svc.runDecayCycle();
      if (r.isErr()) throw new Error(r.error.message);
      return r.value;
    }

    case 'beliefs:contradictions': {
      const svc = app.get(BeliefContradictionService);
      const r = await svc.scanForContradictions();
      if (r.isErr()) throw new Error(r.error.message);
      return r.value;
    }

    case 'beliefs:promote': {
      const svc = app.get(BeliefPromotionService);
      const r = await svc.runPromotionReview();
      if (r.isErr()) throw new Error(r.error.message);
      return r.value;
    }

    case 'beliefs:cycle': {
      const extract = app.get(BeliefExtractionService);
      const contr = app.get(BeliefContradictionService);
      const decay = app.get(BeliefDecayService);
      const promo = app.get(BeliefPromotionService);

      const results: Record<string, any> = {};
      const r1 = await extract.extractFromMemory();
      results.extraction = r1.isOk() ? r1.value : { error: r1.error.message };
      const r2 = await contr.scanForContradictions();
      results.contradictions = r2.isOk() ? r2.value : { error: r2.error.message };
      const r3 = await decay.runDecayCycle();
      results.decay = r3.isOk() ? r3.value : { error: r3.error.message };
      const r4 = await promo.runPromotionReview();
      results.promotion = r4.isOk() ? r4.value : { error: r4.error.message };
      return results;
    }

    case 'memory:log': {
      const svc = app.get(MemoryService);
      const type = args[0] as any;
      const desc = args.slice(1).join(' ');
      const r = await svc.logActivity({ type, description: desc });
      if (r.isErr()) throw new Error(r.error.message);
      return r.value;
    }

    case 'memory:search': {
      const svc = app.get(MemoryService);
      const r = await svc.search(args[0], args[1] ? parseInt(args[1]) : 20);
      if (r.isErr()) throw new Error(r.error.message);
      return r.value;
    }

    case 'memory:aggregate': {
      const svc = app.get(MemoryAggregationService);
      const r = await svc.aggregateDay(args[0]);
      if (r.isErr()) throw new Error(r.error.message);
      return r.value;
    }

    case 'policy:evaluate': {
      const svc = app.get(PolicyService);
      const intent = JSON.parse(args[0]);
      const r = await svc.evaluateAction(intent);
      if (r.isErr()) throw new Error(r.error.message);
      return r.value;
    }

    case 'world-model': {
      const svc = app.get(WorldModelService);
      const r = await svc.build();
      if (r.isErr()) throw new Error(r.error.message);
      return r.value;
    }

    case 'introspect': {
      const svc = app.get(IntrospectionService);
      const profile = args[0] === 'sleep' ? 'sleep' as const : 'full' as const;
      const r = await svc.run(profile);
      if (r.isErr()) throw new Error(r.error.message);
      return r.value;
    }

    case 'nightly': {
      const svc = app.get(NightlyService);
      const r = await svc.run();
      if (r.isErr()) throw new Error(r.error.message);
      return r.value;
    }

    default:
      console.log(`DEUS CLI — Available commands:
  bootstrap          Validate identity + init DB + seed
  health             Health summary
  beliefs:list       List all beliefs
  beliefs:get <id>   Get belief by ID
  beliefs:extract    Extract from memory
  beliefs:decay      Apply time decay
  beliefs:contradictions  Scan for conflicts
  beliefs:promote    Run promotion review
  beliefs:cycle      Full belief cycle
  memory:log <type> <desc>  Log activity
  memory:search <q>  Search memory
  memory:aggregate   Aggregate today
  policy:evaluate <json>  Evaluate action
  world-model        Build world model
  introspect [full|sleep]  Run introspection
  nightly            Full nightly run`);
      return undefined;
  }
}

main();
