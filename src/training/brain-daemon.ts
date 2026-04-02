/**
 * Brain Daemon: runs brain_tick_auto in a loop until stopped.
 * Like an OS — always on, processing whatever sensory_input arrives.
 * Status dumped to brain-status.json every 10 seconds.
 *
 * Start: npx tsx src/training/brain-daemon.ts
 * Stop:  Ctrl+C or kill the process
 * Status: cat brain-status.json
 */

import { Surreal } from 'surrealdb';
import * as fs from 'fs';

const STATUS_FILE = 'brain-status.json';
const STATUS_INTERVAL = 10_000; // 10s
const TICK_DELAY = 50; // ms between ticks (20 ticks/sec max)

let running = true;

process.on('SIGINT', () => { running = false; console.log('\nShutting down...'); });
process.on('SIGTERM', () => { running = false; });

async function main() {
  const db = new Surreal();
  await db.connect('ws://127.0.0.1:8000/rpc', {
    namespace: 'deus',
    database: 'runtime',
    reconnect: { enabled: true, attempts: -1, retryDelay: 1000, retryDelayMax: 10000 },
  });
  await db.signin({ username: 'root', password: 'root' });

  db.subscribe('reconnecting', () => console.log('[reconnecting]'));
  db.subscribe('connected', () => console.log('[connected]'));

  // Start brain
  await db.query('UPDATE kernel_state SET running = true');
  console.log('Brain daemon started. Status → ' + STATUS_FILE);
  console.log('Press Ctrl+C to stop.\n');

  let tickCount = 0;
  let lastStatus = Date.now();
  const t0 = Date.now();

  while (running) {
    try {
      await db.query('RETURN fn::brain_tick_auto()');
      tickCount++;
    } catch {}

    // Status dump
    if (Date.now() - lastStatus > STATUS_INTERVAL) {
      lastStatus = Date.now();
      try {
        const r = await db.query('RETURN fn::training_report()') as any;
        const report = r?.[0] ?? {};
        const status = {
          timestamp: new Date().toISOString(),
          uptime_s: Math.floor((Date.now() - t0) / 1000),
          ticks: tickCount,
          ticks_per_sec: (tickCount / ((Date.now() - t0) / 1000)).toFixed(1),
          ...report,
        };
        fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));

        // Console summary
        const lang = report.language ?? {};
        console.log(
          `[${status.uptime_s}s] cycle=${report.cycle}` +
          ` traces=${report.traces?.active ?? 0}` +
          ` Q=${report.q_learning?.pairs ?? 0}` +
          ` CE=${report.cognitive_events ?? 0}` +
          ` grounded=${lang.grounded_symbols ?? 0}` +
          ` tps=${status.ticks_per_sec}`,
        );
      } catch {}
    }

    // Small delay to not hammer the DB
    await new Promise(r => setTimeout(r, TICK_DELAY));
  }

  await db.query('UPDATE kernel_state SET running = false');
  console.log('Brain stopped. Final status in ' + STATUS_FILE);
  await db.close();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
