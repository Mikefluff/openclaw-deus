/**
 * Membrane: thin translator between brain (SurrealDB) and world (PhysicsWorld).
 *
 * Brain runs autonomously (fn::brain_tick). Membrane:
 * 1. World tick → ambient sensory transitions → fn::process_sensory (numbers only)
 * 2. Brain generates kernel_request type='action' → membrane executes in world
 * 3. World returns sensory consequence (13 channels + valence) → fn::process_sensory
 *
 * Brain sees ONLY numbers. Never text. Never object names.
 */

import { Surreal } from 'surrealdb';
import { PhysicsWorld, SensoryTransition } from './physics-world';

const TOTAL_TICKS = parseInt(process.argv[2] || '5000', 10);

async function main() {
  const db = new Surreal();

  await db.connect('ws://127.0.0.1:8000/rpc', {
    namespace: 'deus',
    database: 'runtime',
    reconnect: { enabled: true, attempts: -1, retryDelay: 1000, retryDelayMax: 10000 },
  });
  await db.signin({ username: 'root', password: 'root' });

  db.subscribe('reconnecting', () => console.log('  [reconnecting]'));
  db.subscribe('connected', () => console.log('  [connected]'));
  console.log('Membrane connected (auto-reconnect enabled)');

  const world = new PhysicsWorld();
  console.log(`World: level ${world.getLevel()}, ${world.getObjectCount()} objects`);

  await db.query('RETURN fn::start_brain()');

  const t0 = Date.now();
  let actionCount = 0;
  let seqCounter = 0;

  console.log(`Training: ${TOTAL_TICKS} world ticks\n`);

  for (let tick = 0; tick < TOTAL_TICKS; tick++) {
    // 1. World ambient events → brain via sensory_input table
    const ambient = world.tick();
    for (const t of ambient) {
      seqCounter++;
      await db.query(
        `CREATE sensory_input CONTENT {
          seq: $seq, action_id: $action_id, channels: $channels,
          speech: $speech, valence: $valence, object_idx: $object_idx,
          is_consequence: false
        }`,
        { seq: seqCounter, action_id: t.action_id, channels: t.channels, speech: t.speech, valence: t.valence, object_idx: t.object_idx },
      );
    }

    // Brain tick: membrane drives the clock
    await db.query('RETURN fn::brain_tick_auto()').catch(() => {});

    // 3. Brain's action requests → execute in world → feed consequence
    const requests = await db.query(
      'SELECT * FROM kernel_request WHERE type = \'action\' AND status = \'pending\' LIMIT 5',
    ) as any;
    const reqs = Array.isArray(requests[0]) ? requests[0] : [];

    for (const req of reqs) {
      const payload = req.payload || {};
      // Brain sends action_id (int). Membrane translates to world action.
      const action_id = typeof payload.action_id === 'number'
        ? payload.action_id % 6
        : Math.floor(Math.random() * 6);

      // Execute in physics world
      const consequence = world.act(action_id);
      actionCount++;

      // Feed consequence via sensory_input (brain picks up next tick)
      seqCounter++;
      await db.query(
        `CREATE sensory_input CONTENT {
          seq: $seq, action_id: $action_id, channels: $channels,
          speech: $speech, valence: $valence, object_idx: $object_idx,
          is_consequence: true, target_content: $target
        }`,
        {
          seq: seqCounter, action_id: consequence.action_id, channels: consequence.channels,
          speech: consequence.speech, valence: consequence.valence, object_idx: consequence.object_idx,
          target: payload.target_content ?? '',
        },
      );

      // Mark processed
      if (req.id) await db.query('UPDATE $id SET status = \'completed\'', { id: req.id });
    }

    // 4. Report
    if (tick % Math.max(1, Math.floor(TOTAL_TICKS / 20)) === 0) {
      const status = await db.query('RETURN fn::run_parallel_status()') as any;
      const s = status[0] || {};
      const traces = await db.query('SELECT count() AS c FROM trace WHERE archived = false GROUP ALL') as any;
      const traceCount = traces[0]?.[0]?.c ?? traces[0]?.c ?? 0;
      const elapsed = (Date.now() - t0) / 1000;
      console.log(
        `tick=${tick}/${TOTAL_TICKS}` +
        ` cycle=${s?.cycle ?? '?'}` +
        ` energy=${(s?.energy ?? 0).toFixed?.(2) ?? '?'}` +
        ` traces=${traceCount}` +
        ` actions=${actionCount}` +
        ` (${elapsed.toFixed(1)}s)`,
      );
    }
  }

  // ═══════════════════════════════════════════
  // REPORT
  // ═══════════════════════════════════════════

  const elapsed = (Date.now() - t0) / 1000;
  const traces = await db.query('SELECT count() AS c FROM trace WHERE archived = false GROUP ALL') as any;
  const archived = await db.query('SELECT count() AS c FROM trace WHERE archived = true GROUP ALL') as any;
  const edges = await db.query('SELECT count() AS c FROM activates GROUP ALL') as any;
  const topTraces = await db.query('SELECT trace_id, content, weight, reactivation_count FROM trace_state WHERE archived = false LIMIT 10') as any;
  const hormones = await db.query('SELECT node_id, value FROM nn_node WHERE model = \'affect\' AND layer = \'hidden\'') as any;
  const accumulators = await db.query('SELECT node_id, value FROM nn_node WHERE model = \'affect\' AND layer = \'input\'') as any;
  const nnStats = await db.query('SELECT math::mean(math::abs(weight)) AS w, math::mean(update_count) AS u FROM nn_edge GROUP ALL') as any;
  const status = await db.query('RETURN fn::run_parallel_status()') as any;
  const s = status[0] || {};

  console.log('\n=== TRAINING COMPLETE ===');
  console.log(`Time: ${elapsed.toFixed(1)}s | World ticks: ${TOTAL_TICKS} | Brain cycles: ${s?.cycle ?? '?'}`);
  console.log(`Energy: ${(s?.energy ?? 0).toFixed?.(3)} | Fatigue: ${(s?.fatigue ?? 0).toFixed?.(3)}`);
  console.log(`Actions: ${actionCount} | World: ${JSON.stringify(world.getDebugInfo())}`);

  // AtomSpace-inspired metrics
  const metaMods = await db.query('SELECT count() AS c FROM modulates GROUP ALL') as any;
  const metaGates = await db.query('SELECT count() AS c FROM gates GROUP ALL') as any;
  const patternStats = await db.query('SELECT name, match_count FROM graph_pattern WHERE match_count > 0') as any;

  console.log('\n--- TRACES ---');
  console.log(`Active: ${traces[0]?.[0]?.c ?? traces[0]?.c ?? '?'} | Archived: ${archived[0]?.[0]?.c ?? archived[0]?.c ?? 0} | Edges: ${edges[0]?.[0]?.c ?? edges[0]?.c ?? 0}`);
  console.log(`Meta-edges: modulates=${metaMods[0]?.[0]?.c ?? 0} gates=${metaGates[0]?.[0]?.c ?? 0}`);
  const patList = Array.isArray(patternStats[0]) ? patternStats[0] : [];
  if (patList.length > 0) {
    console.log(`Patterns fired: ${patList.map((p: any) => `${p.name}(${p.match_count})`).join(', ')}`);
  }

  console.log('\n--- TOP TRACES (action:object patterns) ---');
  const tops = Array.isArray(topTraces[0]) ? topTraces[0] : topTraces;
  for (const t of (tops as any[]).slice(0, 8)) {
    console.log(`  w=${t.weight?.toFixed(3)} react=${t.reactivation_count} "${t.content}"`);
  }

  console.log('\n--- HORMONES ---');
  const horms = Array.isArray(hormones[0]) ? hormones[0] : hormones;
  for (const h of (horms as any[])) console.log(`  ${h.node_id}: ${h.value?.toFixed(4)}`);

  console.log('\n--- ACCUMULATORS ---');
  const accs = Array.isArray(accumulators[0]) ? accumulators[0] : accumulators;
  for (const a of (accs as any[])) console.log(`  ${a.node_id}: ${a.value?.toFixed(4)}`);

  console.log('\n--- NEURAL GRAPH ---');
  const es = nnStats[0]?.[0] ?? nnStats[0] ?? {};
  console.log(`  Mean |weight|: ${(es.w ?? 0).toFixed?.(4)} | Mean updates: ${(es.u ?? 0).toFixed?.(0)}`);

  // ═══════════════════════════════════════════
  // LEARNING METRICS — does brain ACTUALLY learn?
  // ═══════════════════════════════════════════

  console.log('\n--- LEARNING METRICS ---');

  // 1. Q-values: what did brain learn about actions?
  const qvals = await db.query('SELECT key, value, update_count FROM action_value WHERE update_count > 0 LIMIT 10') as any;
  const qlist = Array.isArray(qvals[0]) ? qvals[0] : [];
  if (qlist.length > 0) {
    console.log(`  Q-values learned: ${qlist.length}`);
    for (const q of qlist.slice(0, 5)) {
      console.log(`    ${q.key}: Q=${(q.value ?? 0).toFixed(3)} (${q.update_count} updates)`);
    }
  }

  // 2. Reactivation distribution: highly reactivated = well-learned
  const reactDist = await db.query('SELECT content, reactivation_count, weight FROM trace_state WHERE archived = false') as any;
  const reactList = Array.isArray(reactDist[0]) ? reactDist[0] : reactDist;
  if ((reactList as any[]).length > 0) {
    const reacts = (reactList as any[]).map((t: any) => t.reactivation_count ?? 0);
    const mean = reacts.reduce((s: number, r: number) => s + r, 0) / reacts.length;
    const max = Math.max(...reacts);
    const weights = (reactList as any[]).map((t: any) => t.weight ?? 0);
    const meanW = weights.reduce((s: number, w: number) => s + w, 0) / weights.length;
    console.log(`  Reactivation: mean=${mean.toFixed(1)} max=${max} (more = better learning)`);
    console.log(`  Mean trace weight: ${meanW.toFixed(3)} (higher = stronger memories)`);
  }

  // 3. Speech binding: mama traces linked to action traces?
  const speechTraces = await db.query('SELECT content, weight, reactivation_count FROM trace_state WHERE string::starts_with(content, \'-1:\') AND archived = false') as any;
  const speechList = Array.isArray(speechTraces[0]) ? speechTraces[0] : speechTraces;
  console.log(`  Speech traces: ${(speechList as any[]).length} (mama named ${(speechList as any[]).length} objects)`);
  for (const st of (speechList as any[]).slice(0, 5)) {
    console.log(`    "${st.content}" w=${st.weight?.toFixed(3)} react=${st.reactivation_count}`);
  }

  // 4. Accumulator balance: convergence should grow, novelty should decay
  const accFinal = Array.isArray(accumulators[0]) ? accumulators[0] : accumulators;
  const conv = (accFinal as any[]).find((a: any) => a.node_id === 'acc:convergence')?.value ?? 0;
  const nov = (accFinal as any[]).find((a: any) => a.node_id === 'acc:novelty')?.value ?? 0;
  const pred = (accFinal as any[]).find((a: any) => a.node_id === 'acc:pred_error')?.value ?? 0;
  console.log(`  Learning signal: convergence=${conv.toFixed(3)} novelty=${nov.toFixed(3)} pred_error=${pred.toFixed(3)}`);
  console.log(`  ${conv > nov ? 'CONVERGING (world becoming predictable)' : 'EXPLORING (still discovering)'}`);

  // 5. ECAN + Sheaves + Language + Predictor
  const hebbCount = await db.query('SELECT count() AS c FROM hebbian GROUP ALL') as any;
  const sectionCount = await db.query('SELECT count() AS c FROM trace_section WHERE connector_count > 0 GROUP ALL') as any;
  const lexCount = await db.query('SELECT count() AS c FROM trace WHERE source_type = \'lexical\' GROUP ALL') as any;
  const bindCount = await db.query('SELECT count() AS c FROM lexical_binding WHERE weight > 0.1 GROUP ALL') as any;
  const transitions = await db.query('SELECT count() AS c FROM sensorimotor_transition GROUP ALL') as any;

  console.log(`\n--- ATOMSPACE FEATURES ---`);
  console.log(`  HebbianLinks: ${hebbCount[0]?.[0]?.c ?? 0}`);
  console.log(`  Sheaf sections: ${sectionCount[0]?.[0]?.c ?? 0}`);
  console.log(`  Lexical traces: ${lexCount[0]?.[0]?.c ?? 0} | Bindings: ${bindCount[0]?.[0]?.c ?? 0}`);
  console.log(`  Predictor transitions: ${transitions[0]?.[0]?.c ?? 0}`);

  await db.query('UPDATE kernel_state SET running = false');
  await db.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message || e); process.exit(1); });
