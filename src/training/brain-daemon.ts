/**
 * Brain Daemon v4: membrane only.
 *
 * Brain runs INSIDE SurrealDB via fn::brain_dispatch() + ASYNC event.
 * Daemon only:
 *   1. Kicks _tick table (re-triggers brain dispatch)
 *   2. Feeds world events → sensory_input
 *   3. Reads kernel_request → world.act() → feeds consequence
 *   4. Serves dashboard + status
 *
 * Start: npx tsx src/training/brain-daemon.ts [--eden|--3d]
 */

import { Surreal } from 'surrealdb';
import { PhysicsWorld } from './physics-world';
import { PhysicsWorld3D } from './physics-world-3d';
import { EdenGarden } from './eden';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';

const USE_3D = process.argv.includes('--3d');
const USE_EDEN = process.argv.includes('--eden');

let running = true;
process.on('SIGINT', () => { running = false; console.log('\nShutting down...'); });
process.on('SIGTERM', () => { running = false; });

async function main() {
  const db = new Surreal();
  await db.connect('ws://127.0.0.1:8000/rpc', {
    namespace: 'deus', database: 'runtime',
    reconnect: { enabled: true, attempts: -1, retryDelay: 1000, retryDelayMax: 10000 },
  });
  await db.signin({ username: 'root', password: 'root' });
  db.subscribe('reconnecting', () => console.log('[reconnecting]'));

  const world: any = USE_EDEN ? new EdenGarden() : USE_3D ? new PhysicsWorld3D() : new PhysicsWorld();
  const activityLog: string[] = [];
  let latestStatus: any = {};
  let seqCounter = 0;
  let actionCount = 0;

  function log(msg: string) {
    activityLog.unshift(`[${new Date().toLocaleTimeString()}] ${msg}`);
    if (activityLog.length > 100) activityLog.length = 100;
  }

  // Dashboard
  const dashHtml = fs.readFileSync(path.join(__dirname, 'dashboard.html'), 'utf-8');
  http.createServer((req, res) => {
    if (req.url === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ...latestStatus, _log: activityLog.slice(0, 30) }));
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(dashHtml);
    }
  }).listen(3333, () => console.log('Dashboard → http://localhost:3333'));

  // Start brain inside SurrealDB
  await db.query('RETURN fn::start_brain()');
  console.log(`Membrane v4. Brain dispatches INSIDE SurrealDB.`);
  console.log(`World: ${USE_EDEN ? 'Eden' : USE_3D ? '3D' : 'flat'} (${world.getObjectCount()} objects)\n`);

  const t0 = Date.now();

  // ═══════════════════════════════════════════
  // WORLD I/O: feed events + execute actions (100ms)
  // ═══════════════════════════════════════════
  setInterval(async () => {
    if (!running) return;
    try {
      // World tick
      for (const t of world.tick()) {
        if (t.action_id === -1) log(`mama: ${t.debug_label ?? 'speech'}`);
        seqCounter++;
        db.query(`CREATE sensory_input CONTENT {
          seq: $seq, action_id: $a, channels: $c, speech: $s, valence: $v, object_idx: $o, is_consequence: false
        }`, { seq: seqCounter, a: t.action_id, c: t.channels, s: t.speech, v: t.valence, o: t.object_idx }).catch(() => {});
      }

      // Execute brain's actions in world
      const reqs = ((await db.query("SELECT * FROM kernel_request WHERE type = 'action' AND status = 'pending' LIMIT 5") as any)?.[0] ?? []);
      for (const req of reqs) {
        const aid = typeof req.payload?.action_id === 'number' ? req.payload.action_id % 6 : Math.floor(Math.random() * 6);
        const c = world.act(aid);
        actionCount++;
        log(`action ${aid} → ${c.debug_label ?? ''} v=${c.valence.toFixed(2)}`);
        seqCounter++;
        db.query(`CREATE sensory_input CONTENT {
          seq: $seq, action_id: $a, channels: $c, speech: $s, valence: $v, object_idx: $o, is_consequence: true, target_content: $t
        }`, { seq: seqCounter, a: c.action_id, c: c.channels, s: c.speech, v: c.valence, o: c.object_idx, t: req.payload?.target_content ?? '' }).catch(() => {});
        if (req.id) db.query("UPDATE $id SET status = 'completed'", { id: req.id }).catch(() => {});
        for (const fb of world.drainFeedback()) {
          log(`mama: ${fb.debug_label ?? ''}`);
          seqCounter++;
          db.query(`CREATE sensory_input CONTENT {
            seq: $seq, action_id: $a, channels: $c, speech: $s, valence: $v, object_idx: $o, is_consequence: false
          }`, { seq: seqCounter, a: fb.action_id, c: fb.channels, s: fb.speech, v: fb.valence, o: fb.object_idx }).catch(() => {});
        }
      }
    } catch {}
  }, 100);

  // No re-kick needed. MAXDEPTH 65535 = ~9 hours autonomous.
  // fn::start_brain() did the single kick.

  // ═══════════════════════════════════════════
  // STATUS (10s)
  // ═══════════════════════════════════════════
  setInterval(async () => {
    if (!running) return;
    try {
      const r = await db.query('RETURN fn::training_report()') as any;
      const report = r?.[0] ?? {};
      const positions = USE_EDEN
        ? (world as EdenGarden).getSnapshot().objects.map((o: any) => ({ idx: o.idx, x: o.x, y: o.y, z: o.z, name: o.name, color: o.color }))
        : USE_3D ? (world as PhysicsWorld3D).getAllPositions() : [];

      latestStatus = {
        timestamp: new Date().toISOString(),
        uptime_s: Math.floor((Date.now() - t0) / 1000),
        actions: actionCount,
        world_level: world.getLevel(),
        world_objects: world.getObjectCount(),
        world_3d: USE_3D || USE_EDEN,
        world_eden: USE_EDEN,
        eden_stage: USE_EDEN ? (world as EdenGarden).getStage() : undefined,
        object_positions: positions,
        ...report,
      };
      fs.writeFileSync('brain-status.json', JSON.stringify(latestStatus, null, 2));

      const lang = report.language ?? {};
      console.log(
        `[${latestStatus.uptime_s}s] cycle=${report.cycle}` +
        ` traces=${report.traces?.active ?? 0}` +
        ` Q=${report.q_learning?.pairs ?? 0}` +
        ` edges=${report.edges ?? 0}` +
        ` grounded=${lang.grounded_symbols ?? 0}` +
        ` actions=${actionCount}`,
      );

      // Auto level-up
      if (report.maturity?.maturity > 0.55 && world.getLevel() < 2) {
        (world as any).advanceStage?.() || (world as any).levelUp?.();
        log(`LEVEL UP → stage ${world.getLevel()} (${world.getObjectCount()} objects)`);
      }
    } catch {}
  }, 10000);

  // Shutdown handler
  setInterval(async () => {
    if (!running) {
      await db.query('RETURN fn::stop_brain()').catch(() => {});
      console.log('Brain stopped.');
      await db.close();
      process.exit(0);
    }
  }, 500);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
