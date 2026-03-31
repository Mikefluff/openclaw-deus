/**
 * Minimal test: just SurrealDB connection + raw migration.
 * No NestJS, no DI, no onModuleInit.
 */
import Surreal from 'surrealdb';
import * as fs from 'fs';
import * as path from 'path';

const TIMEOUT = 60_000;
setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, TIMEOUT);

async function main() {
  const db = new Surreal();
  console.log('[1] Connecting...');
  await db.connect('http://127.0.0.1:8000/rpc', { versionCheck: false } as any);
  await db.signin({ username: 'root', password: 'root' });
  await db.use({ namespace: 'deus', database: 'runtime' });
  console.log('[2] Connected');

  // Run migrations manually
  const migrationsDir = path.join(__dirname, '..', 'database', 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.surql')).sort();
  console.log(`[3] Found ${files.length} migrations`);

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    try {
      await db.query(sql);
      console.log(`  OK ${file}`);
    } catch (e: any) {
      console.error(`  FAIL ${file}: ${e.message?.slice(0, 100)}`);
    }
  }

  // Check tables
  const info = await db.query('INFO FOR DB');
  const tables = Object.keys((info as any)[0]?.tables || {});
  console.log(`[4] Tables: ${tables.length}`);

  // Check neural graph
  const nodes = await db.query('SELECT count() AS c FROM nn_node GROUP ALL');
  console.log(`[5] Neural nodes: ${JSON.stringify(nodes)}`);

  // Seed neural graph
  const { seedNeuralGraph } = await import('../database/seed-neural-graph');
  // Create a minimal wrapper
  const dbWrapper = {
    query: async (sql: string, vars?: any) => {
      try {
        const r = await db.query(sql, vars);
        return { isOk: () => true, isErr: () => false, value: Array.isArray(r) ? r.flat() : r };
      } catch (e: any) {
        return { isOk: () => false, isErr: () => true, value: [], error: { message: e.message } };
      }
    },
    create: async (table: string, data: any) => {
      try {
        const r = await db.create(table, data);
        return { isOk: () => true, isErr: () => false, value: r };
      } catch (e: any) {
        return { isOk: () => false, isErr: () => true, value: null, error: { message: e.message } };
      }
    },
    execute: async (sql: string, vars?: any) => {
      try {
        const r = await db.query(sql, vars);
        return { isOk: () => true, isErr: () => false, value: r };
      } catch (e: any) {
        return { isOk: () => false, isErr: () => true, value: null, error: { message: e.message } };
      }
    },
  };

  console.log('[6] Seeding neural graph...');
  await seedNeuralGraph(dbWrapper as any);

  const nodesAfter = await db.query('SELECT count() AS c FROM nn_node GROUP ALL');
  const edgesAfter = await db.query('SELECT count() AS c FROM nn_edge GROUP ALL');
  console.log(`[7] After seed: nodes=${JSON.stringify(nodesAfter)}, edges=${JSON.stringify(edgesAfter)}`);

  // Test forward pass
  console.log('[8] Testing fn::nn_forward...');
  try {
    const fwd = await db.query('RETURN fn::nn_forward("cone", "input", "output")');
    console.log(`  Forward result: ${JSON.stringify(fwd).slice(0, 200)}`);
  } catch (e: any) {
    console.error(`  Forward FAIL: ${e.message?.slice(0, 200)}`);
  }

  await db.close();
  console.log('[DONE]');
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
