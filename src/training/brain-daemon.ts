/**
 * Brain Daemon v3: THIN MEMBRANE.
 *
 * Brain ticks INSIDE SurrealDB via ASYNC events on clock tables.
 * This daemon only:
 *   1. Feeds world events → sensory_input table
 *   2. Reads kernel_request → executes in world → feeds consequence
 *   3. Kicks clock tables periodically (re-trigger ASYNC events)
 *   4. Serves dashboard
 *
 * Brain logic: ZERO. All in stored procedures.
 *
 * Start: npx tsx src/training/brain-daemon.ts [--eden|--3d]
 * Dashboard: http://localhost:3333
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
const STATUS_FILE = 'brain-status.json';

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
  const server = http.createServer((req, res) => {
    if (req.url === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ...latestStatus, _log: activityLog.slice(0, 30) }));
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(dashHtml);
    }
  });
  server.listen(3333, () => console.log('Dashboard → http://localhost:3333'));

  // Start brain (ASYNC events inside SurrealDB)
  await db.query('RETURN fn::start_brain()');
  console.log(`Membrane v3. Brain ticks INSIDE SurrealDB.`);
  console.log(`World: ${USE_EDEN ? 'Eden' : USE_3D ? '3D' : 'flat'} (${world.getObjectCount()} objects)\n`);

  const t0 = Date.now();

  // ═══════════════════════════════════════════
  // WORLD LOOP: feed sensory + execute actions (50ms)
  // This is the ONLY thing membrane does to the brain.
  // ═══════════════════════════════════════════
  const worldLoop = setInterval(async () => {
    if (!running) return;
    try {
      // World tick → ambient events
      const ambient = world.tick();
      for (const t of ambient) {
        if (t.action_id === -1) log(`mama: ${t.debug_label ?? 'speech'}`);
        seqCounter++;
        db.query(`CREATE sensory_input CONTENT {
          seq: $seq, action_id: $action_id, channels: $channels,
          speech: $speech, valence: $valence, object_idx: $object_idx,
          is_consequence: false
        }`, { seq: seqCounter, action_id: t.action_id, channels: t.channels, speech: t.speech, valence: t.valence, object_idx: t.object_idx }).catch(() => {});
      }

      // Read brain's action requests → execute in world → feed consequence
      const requests = await db.query(
        "SELECT * FROM kernel_request WHERE type = 'action' AND status = 'pending' LIMIT 5",
      ) as any;
      const reqs = Array.isArray(requests?.[0]) ? requests[0] : [];
      for (const req of reqs) {
        const payload = req.payload || {};
        const action_id = typeof payload.action_id === 'number' ? payload.action_id % 6 : Math.floor(Math.random() * 6);
        const consequence = world.act(action_id);
        actionCount++;
        log(`action ${action_id} → ${consequence.debug_label ?? ''} v=${consequence.valence.toFixed(2)}`);
        seqCounter++;
        db.query(`CREATE sensory_input CONTENT {
          seq: $seq, action_id: $action_id, channels: $channels,
          speech: $speech, valence: $valence, object_idx: $object_idx,
          is_consequence: true, target_content: $target
        }`, {
          seq: seqCounter, action_id: consequence.action_id, channels: consequence.channels,
          speech: consequence.speech, valence: consequence.valence, object_idx: consequence.object_idx,
          target: payload.target_content ?? '',
        }).catch(() => {});
        if (req.id) db.query("UPDATE $id SET status = 'completed'", { id: req.id }).catch(() => {});

        for (const fb of world.drainFeedback()) {
          log(`mama: ${fb.debug_label ?? 'feedback'}`);
          seqCounter++;
          db.query(`CREATE sensory_input CONTENT {
            seq: $seq, action_id: $action_id, channels: $channels,
            speech: $speech, valence: $valence, object_idx: $object_idx,
            is_consequence: false
          }`, { seq: seqCounter, action_id: fb.action_id, channels: fb.channels, speech: fb.speech, valence: fb.valence, object_idx: fb.object_idx }).catch(() => {});
        }
      }
    } catch {}
  }, 50);

  // ═══════════════════════════════════════════
  // CLOCK KICKER: re-trigger ASYNC events at different rates
  // Brain circuits run inside SurrealDB, we just kick the clocks.
  // ═══════════════════════════════════════════
  const kick = (table: string) => db.query(`UPDATE ${table} SET t = time::now()`).catch(() => {});

  const kickSensory    = setInterval(() => kick('_clock_sensory'), 100);
  const kickVitals     = setInterval(() => kick('_clock_vitals'), 200);
  const kickAttention  = setInterval(() => kick('_clock_attention'), 150);
  const kickAffect     = setInterval(() => kick('_clock_affect'), 1000);
  const kickAgency     = setInterval(() => kick('_clock_agency'), 500);
  const kickLearning   = setInterval(() => kick('_clock_learning'), 2000);
  const kickPlasticity = setInterval(() => kick('_clock_plasticity'), 5000);
  const kickDeep       = setInterval(() => kick('_clock_deep'), 30000);

  // ═══════════════════════════════════════════
  // STATUS: periodic report (10s)
  // ═══════════════════════════════════════════
  const statusLoop = setInterval(async () => {
    if (!running) return;
    try {
      const r = await db.query('RETURN fn::training_report()') as any;
      const report = r?.[0] ?? {};
      const positions = USE_EDEN
        ? (world as EdenGarden).getSnapshot().objects.map((o: any) => ({ idx: o.idx, x: o.x, y: o.y, z: o.z, name: o.name, color: o.color }))
        : USE_3D ? (world as PhysicsWorld3D).getAllPositions() : [];

      const uptime = Math.floor((Date.now() - t0) / 1000);
      const status = {
        timestamp: new Date().toISOString(),
        uptime_s: uptime,
        actions: actionCount,
        world_level: world.getLevel(),
        world_objects: world.getObjectCount(),
        world_3d: USE_3D || USE_EDEN,
        world_eden: USE_EDEN,
        eden_stage: USE_EDEN ? (world as EdenGarden).getStage() : undefined,
        object_positions: positions,
        ...report,
      };
      latestStatus = status;
      fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));

      const lang = report.language ?? {};
      console.log(
        `[${uptime}s] cycle=${report.cycle}` +
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

  // ═══════════════════════════════════════════
  // SHUTDOWN
  // ═══════════════════════════════════════════
  const check = setInterval(async () => {
    if (!running) {
      clearInterval(check);
      clearInterval(worldLoop);
      clearInterval(kickSensory); clearInterval(kickVitals);
      clearInterval(kickAttention); clearInterval(kickAffect);
      clearInterval(kickAgency); clearInterval(kickLearning);
      clearInterval(kickPlasticity); clearInterval(kickDeep);
      clearInterval(statusLoop);
      await db.query('RETURN fn::stop_brain()').catch(() => {});
      server.close();
      console.log('Brain stopped.');
      await db.close();
      process.exit(0);
    }
  }, 500);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
