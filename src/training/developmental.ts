/**
 * Membrane: feeds ambient sensory + executes brain's actions in world.
 * Brain ticks autonomously (ASYNC MAXDEPTH 16, re-kicked by membrane every 200ms).
 */
import { Surreal } from 'surrealdb';
import { PhysicsWorld } from './physics-world';

const MAX_SECONDS = parseInt(process.argv[2] || '300', 10);
const TARGET_MATURITY = parseFloat(process.argv[3] || '0.95');

async function main() {
  const db = new Surreal();
  await db.connect('ws://127.0.0.1:8000/rpc');
  await db.signin({ username: 'root', password: 'root' });
  await db.use({ namespace: 'deus', database: 'runtime' });

  const world = new PhysicsWorld();
  let totalActions = 0;
  const seen = new Set<string>();
  let seq = 0;
  const t0 = Date.now();

  console.log(`Membrane: max ${MAX_SECONDS}s, level 0: ${world.getObjectCount()} objects\n`);

  // Init
  await db.query('DELETE kernel_request');
  await db.query('DELETE sensory_input');
  const ks = (await db.query('SELECT count() AS c FROM kernel_state GROUP ALL') as any)[0]?.[0]?.c ?? 0;
  if (ks === 0) await db.query('CREATE kernel_state SET cycle=0,energy=1.0,fatigue=0.0,running=false,config={}');
  await db.query('UPDATE kernel_state SET energy=1.0,fatigue=0.0,running=false');

  // Start brain
  console.log('Starting brain...');
  await db.query('RETURN fn::start_brain()');

  // Membrane loop: ambient feed + re-kick brain + process actions
  const mainLoop = setInterval(async () => {
    try {
      // 1. Feed ambient sensory
      for (const t of world.tick()) {
        seq++;
        await db.query('CREATE sensory_input SET seq=$seq,is_consequence=false,action_id=$a,channels=$c,speech=$sp,valence=$v,object_idx=$o',
          { seq, a: t.action_id, c: t.channels, sp: t.speech, v: t.valence, o: t.object_idx });
      }

      // 2. Re-kick brain tick pump
      await db.query('UPSERT _tick:main SET kick = rand::float()').catch(() => {});

      // 3. Process brain's action requests
      const r = await db.query("SELECT * FROM kernel_request WHERE status = 'pending' LIMIT 3") as any;
      for (const req of (Array.isArray(r[0]) ? r[0] : [])) {
        const rid = String(req.id);
        if (seen.has(rid)) continue;
        seen.add(rid);
        const method = req.payload?.method ?? 'touch';
        const target = req.payload?.target_content ?? '';
        const idx = ['touch', 'push', 'drop', 'shake', 'look', 'squeeze'].indexOf(method);
        const c = world.act(idx >= 0 ? idx : 0);
        totalActions++;
        seq++;
        await db.query('CREATE sensory_input SET seq=$seq,is_consequence=true,action_id=$a,channels=$ch,speech=$sp,valence=$v,object_idx=$o,action_method=$m,target_content=$t',
          { seq, a: c.action_id, ch: c.channels, sp: c.speech, v: c.valence, o: c.object_idx, m: method, t: target });
      }
    } catch {}
  }, 200);

  // Monitor
  const monLoop = setInterval(async () => {
    const el = (Date.now() - t0) / 1000;
    if (el > MAX_SECONDS) { cleanup(); return; }
    try {
      const snap = await db.query(`
        LET $s = (SELECT cycle, energy, config FROM kernel_state LIMIT 1)[0];
        LET $tr = (SELECT count() AS c FROM trace_state WHERE archived = false GROUP ALL)[0].c ?? 0;
        LET $ed = (SELECT count() AS c FROM activates WHERE (archived IS NONE OR archived = false) GROUP ALL)[0].c ?? 0;
        LET $h = (SELECT node_id, value, phasic FROM nn_node WHERE model = 'affect' AND layer = 'hidden');
        LET $ce = (SELECT count() AS c FROM cognitive_event GROUP ALL)[0].c ?? 0;
        LET $rpe = IF $ce > 1 THEN (SELECT math::mean(math::abs(prediction_error)) AS r FROM cognitive_event GROUP ALL)[0].r ?? 0 ELSE 0 END;
        LET $mat = fn::compute_maturity();
        RETURN { s: $s, tr: $tr, ed: $ed, h: $h, ce: $ce, rpe: $rpe, mat: $mat };
      `) as any;
      const d = (Array.isArray(snap) ? snap : [snap]).pop() ?? {};
      const s = d.s ?? {};
      const h = Array.isArray(d.h) ? d.h : [];
      const mat = d.mat ?? {};
      const cy = s.cycle ?? 0;
      console.log(`\n── ${el.toFixed(0)}s cy=${cy} (${(cy / el).toFixed(0)} tps) E=${s.energy?.toFixed(2)} ──`);
      console.log(`  tr=${d.tr} ed=${d.ed} act=${totalActions} ce=${d.ce} rpe=${d.rpe?.toFixed(4)}`);
      console.log(`  H: ${h.map((n: any) => (n.node_id as string).replace('hormone:', '').slice(0, 4) + '=' + n.value?.toFixed(3)).join(' ')}`);
      console.log(`  MAT=${(mat.maturity ?? 0).toFixed(3)} drain=${s.config?.energy_drain_rate?.toFixed(5)}`);
      if ((mat.maturity ?? 0) >= (s.config?.levelup_maturity_threshold ?? 0.7) && world.getLevel() < 4) {
        world.levelUp();
        console.log(`  >>> LEVEL UP to ${world.getLevel()} <<<`);
      }
    } catch {}
  }, 5000);

  async function cleanup() {
    clearInterval(mainLoop); clearInterval(monLoop);
    try { await db.query('RETURN fn::stop_brain()'); } catch {}
    console.log(`\n═══ ${((Date.now() - t0) / 1000).toFixed(0)}s, ${totalActions} actions ═══`);
    await db.close(); process.exit(0);
  }
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
