import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { BootstrapService } from '../bootstrap/bootstrap.service';
import { SurrealService } from '../database/surreal.service';

process.env.DEUS_NO_LOOP = '1';

const TIMEOUT = 30_000;
setTimeout(() => { console.error('TIMEOUT ' + TIMEOUT + 'ms'); process.exit(1); }, TIMEOUT);

async function main() {
  console.log('[1] Creating NestJS context...');
  const t0 = Date.now();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  console.log(`[2] App ready (${Date.now() - t0}ms)`);

  const db = app.get(SurrealService);
  console.log(`[3] DB connected: ${db.isConnected()}`);

  const svc = app.get(BootstrapService);
  console.log('[4] Running migrations...');
  const migResult = await svc.runMigrations();
  if (migResult.isErr()) {
    console.error('[!] Migration FAILED:', migResult.error.message);
    await app.close(); process.exit(1);
  }
  console.log(`[5] Migrations OK (${Date.now() - t0}ms)`);

  const report = await svc.validate();
  if (report.isOk()) {
    const passed = report.value.checks.filter(c => c.ok).length;
    console.log(`[6] Validate: ${passed}/${report.value.checks.length}`);
    for (const c of report.value.checks) {
      console.log(`    ${c.ok ? 'PASS' : 'FAIL'} ${c.name}: ${c.detail}`);
    }
  } else {
    console.error('[!] Validate FAILED:', report.error.message);
  }

  // Check neural graph
  const nnResult = await db.query('SELECT count() AS c FROM nn_node GROUP ALL');
  console.log(`[7] Neural nodes: ${(nnResult as any).value?.[0]?.c ?? 'N/A'}`);
  const nnEdges = await db.query('SELECT count() AS c FROM nn_edge GROUP ALL');
  console.log(`[8] Neural edges: ${(nnEdges as any).value?.[0]?.c ?? 'N/A'}`);

  await app.close();
  console.log(`[DONE] ${Date.now() - t0}ms total`);
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message || e); process.exit(1); });
