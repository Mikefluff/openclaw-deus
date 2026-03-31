/**
 * Bootstrap: run migrations + seed neural graph.
 *
 * Usage: npx tsx src/training/bootstrap.ts
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { BootstrapService } from '../bootstrap/bootstrap.service';
import { SurrealService } from '../database/surreal.service';

async function main() {
  const app = await NestFactory.create(AppModule, { logger: ['warn', 'error'] });
  await app.init();
  (global as any).__nestApp = app;

  const db = app.get(SurrealService);
  await db.connect();
  console.log('SurrealDB connected');

  // Fix NestJS 11 @Global DI bug — manually inject db into BootstrapService
  const svc = app.get(BootstrapService);
  if (!(svc as any).db) (svc as any).db = db;

  console.time('migrations');
  const result = await svc.runMigrations();
  console.timeEnd('migrations');

  if (result.isErr()) {
    console.error('Migrations FAILED:', result.error.message);
    process.exit(1);
  }
  console.log('Migrations OK');

  // Verify
  const nodes = await db.query<{ c: number }>('SELECT count() AS c FROM nn_node GROUP ALL');
  const edges = await db.query<{ c: number }>('SELECT count() AS c FROM nn_edge GROUP ALL');
  console.log(`Neural graph: ${nodes.isOk() ? nodes.value[0]?.c : '?'} nodes, ${edges.isOk() ? edges.value[0]?.c : '?'} edges`);

  // Test kernel tick
  const tick = await db.execute('RETURN fn::kernel_tick(0)');
  if (tick.isOk()) {
    console.log('fn::kernel_tick(0):', JSON.stringify((tick as any).value).slice(0, 200));
  } else {
    console.warn('fn::kernel_tick failed:', (tick as any).error?.message?.slice(0, 200));
  }

  // Test neural forward
  const fwd = await db.query('RETURN fn::nn_forward("cone", "input", "output")');
  if (fwd.isOk()) {
    console.log('fn::nn_forward(cone):', JSON.stringify(fwd.value).slice(0, 150));
  }

  await app.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message || e); process.exit(1); });
