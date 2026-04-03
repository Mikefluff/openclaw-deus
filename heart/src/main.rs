//! DEUS Heart v0.3 — entry point, dependency injection wiring.
//!
//! Thread 1 (brain, 1000Hz): owns all neuro state, spin_sleep
//! Thread 2 (world, 60Hz): owns PhysicsWorld, std::thread::sleep
//! Tokio: DB sync, HTTP dashboard

use std::time::Duration;
use crossbeam::channel;
use tokio::sync::watch;

use heart::core::config::HeartConfig;
use heart::core::state::*;
use heart::core::cycle::CycleCounter;
use heart::neuro::hormones::{PhasicTonicSystem, Neuromodulator};
use heart::neuro::attention::{EcanAllocator, AttentionAllocator, AttentionalFocus};
use heart::neuro::spreading::{NormalizedSpreading, SpreadingActivation};
use heart::neuro::hebbian::{AsymmetricHebbian, HebbianLearning};
use heart::neuro::sleep::{ShyConsolidation, SleepSystem};
use heart::agency::demands::{OpenPsiDemands, DemandSystem, DemandState};
use heart::agency::selection::{DemandDrivenSelector, ActionSelector};
use heart::agency::motor::MotorCommand;
use heart::memory::{VecMemoryStore, MemoryStore};
use heart::sensory::SensoryFrame;
use heart::scheduler::{MultiRateScheduler, rates};
use heart::io::surreal;
use heart::io::persistence::Persistence;
use heart::io::dashboard;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_target(false)
        .with_timer(tracing_subscriber::fmt::time::uptime())
        .init();

    let embedded = std::env::args().any(|a| a == "--embedded" || a == "--mem");
    let url = std::env::args().find(|a| !a.starts_with('-') && a != "heart")
        .unwrap_or_else(|| "127.0.0.1:8000".into());

    tracing::info!("DEUS Heart v0.3 — clean architecture");

    // Connect: embedded (no Docker) or remote
    let persistence: std::sync::Arc<dyn Persistence + Send + Sync> = if embedded {
        let db = surreal::connect_embedded().await.expect("embedded DB");
        std::sync::Arc::new(surreal::SurrealPersistence::new(db))
    } else {
        let db = surreal::connect_remote(&url).await.expect("remote DB");
        std::sync::Arc::new(surreal::SurrealPersistence::new(db))
    };

    let config = persistence.load_config().await.unwrap_or_default();
    let init = persistence.load_initial_state().await.unwrap_or_default();
    tracing::info!("loaded: cycle={} energy={:.2}", init.cycle, init.energy);

    // Channels
    let (sensory_tx, sensory_rx) = channel::bounded::<SensoryFrame>(256);
    let (motor_tx, motor_rx) = channel::bounded::<MotorCommand>(64);
    let (state_tx, state_rx) = watch::channel(Snapshot::default());
    let (shutdown_tx, _) = watch::channel(false);

    // ═══════════════════════════════════════════
    // THREAD 1: Brain (1000Hz)
    // ═══════════════════════════════════════════
    let brain_config = config.clone();
    let brain_init_cycle = init.cycle;
    let brain_init_energy = init.energy;
    let brain_init_fatigue = init.fatigue;
    let brain_shutdown = shutdown_tx.subscribe();

    let brain_handle = std::thread::Builder::new()
        .name("brain".into())
        .spawn(move || {
            // Construct all subsystems
            let hormone_sys = PhasicTonicSystem;
            let attention_sys = EcanAllocator;
            let spreading_sys = NormalizedSpreading;
            let hebbian_sys = AsymmetricHebbian;
            let sleep_sys = ShyConsolidation;
            let demand_sys = OpenPsiDemands;
            let selector = DemandDrivenSelector;

            // State
            let mut memory = VecMemoryStore::new();
            let mut vitals = VitalsState { energy: brain_init_energy, fatigue: brain_init_fatigue, sleep_count: 0 };
            let mut hormones = HormoneState::default();
            let mut accumulators = AccumulatorState::default();
            let mut demands = DemandState::default();
            let mut af = AttentionalFocus::default();
            let mut cycle = CycleCounter::new(brain_init_cycle);
            let mut sched = MultiRateScheduler::new(&rates::default_rates());
            let mut sensory_count: u64 = 0;
            let mut action_count: u64 = 0;

            let cfg = &brain_config;
            let interval = Duration::from_millis(1);

            loop {
                let start = std::time::Instant::now();
                if *brain_shutdown.borrow() { break; }

                // Drain sensory interrupts
                while let Ok(frame) = sensory_rx.try_recv() {
                    sensory_count += 1;
                    let valence = frame.valence as f64;
                    let key = format!("{}:{}", frame.action_id, frame.object_idx);

                    // Find or create trace
                    let idx = if let Some(idx) = memory.find_trace(&key) {
                        if let Some(tr) = memory.get_trace_mut(idx) {
                            tr.sti += 5.0;
                            tr.weight = (tr.weight + 0.1 + valence.abs() * 0.2).min(1.0);
                            tr.freshness = 1.0;
                        }
                        accumulators.accumulate(acc::CONVERGENCE, 0.1, cfg.vitals.accumulator_cap);
                        accumulators.accumulate(acc::STABILITY, 0.15, cfg.vitals.accumulator_cap);
                        idx
                    } else {
                        let mut pos = frame.channels.to_vec();
                        pos.resize(64, 0.0);
                        let mut trace = heart::memory::Trace::new(key.clone(), pos);
                        trace.weight = 0.5 + valence.abs() * 0.3;
                        let idx = memory.insert_trace(key, trace);
                        accumulators.accumulate(acc::NOVELTY, 0.2, cfg.vitals.accumulator_cap);
                        accumulators.accumulate(acc::PRED_ERROR, 0.3, cfg.vitals.accumulator_cap);
                        hormones.spike(0, 0.1); // DA novelty
                        hormones.spike(1, 0.15); // NE alertness
                        idx
                    };

                    if valence > 0.1 {
                        accumulators.accumulate(acc::REWARD, valence, cfg.vitals.accumulator_cap);
                        hormones.spike(0, valence * 0.15);
                    }
                    if valence < -0.1 {
                        accumulators.accumulate(acc::PAIN, valence.abs(), cfg.vitals.accumulator_cap);
                        hormones.spike(2, valence.abs() * 0.2);
                    }

                    // Hebbian bind on consequence
                    if frame.is_consequence {
                        hebbian_sys.bind(idx, &af, &mut memory, &cfg.learning);
                    }
                }

                // Scheduled ticks
                for slot in sched.tick(interval) {
                    match slot {
                        rates::VITALS => {
                            cycle.tick();
                            let drain = cfg.vitals.energy_drain * (1.0 + vitals.fatigue);
                            vitals.energy = (vitals.energy - drain).max(0.0);
                            vitals.fatigue = (vitals.fatigue + cfg.vitals.fatigue_rate).min(1.0);
                            if sleep_sys.should_sleep(&vitals, &cfg.sleep) {
                                sleep_sys.sleep(&mut vitals, &mut memory, &cfg.sleep);
                            }
                        }
                        rates::ATTENTION => {
                            af = attention_sys.tick(&mut memory, &cfg.attention);
                            accumulators.decay(cfg.vitals.accumulator_decay, cfg.vitals.accumulator_cap);
                        }
                        rates::AGENCY => {
                            if let Some(cmd) = selector.select(&demands, &hormones, &vitals, &cfg.agency) {
                                action_count += 1;
                                vitals.energy = (vitals.energy - cfg.agency.action_cost).max(0.0);
                                let _ = motor_tx.try_send(cmd);
                            }
                        }
                        rates::HORMONES => {
                            hormone_sys.tick(&mut hormones, &accumulators, &cfg.hormones);
                        }
                        rates::SPREADING => {
                            spreading_sys.spread(&mut memory, &cfg.learning);
                        }
                        rates::PLASTICITY => {
                            // Edge sprout from AF co-activation
                            if af.members.len() >= 2 {
                                let a = af.members[0];
                                for &b in af.members.iter().skip(1).take(3) {
                                    if a == b { continue; }
                                    if memory.find_edge(a, b).is_none() {
                                        memory.insert_edge(heart::memory::Edge {
                                            from: a, to: b,
                                            weight: 0.1, eligibility: 0.0, co_activation: 0,
                                        });
                                    }
                                }
                            }
                            // Prune dead edges
                            memory.retain_edges(Box::new(|e| e.weight > 0.005 || e.co_activation > 2));
                        }
                        rates::DEEP => {
                            demand_sys.update(&mut demands, &accumulators, &hormones);
                        }
                        _ => {}
                    }
                }

                // Publish snapshot
                cycle.update_tps();
                if cycle.cycle % 100 == 0 {
                    let _ = state_tx.send(Snapshot {
                        cycle: cycle.cycle,
                        tps: cycle.tps,
                        vitals: vitals.clone(),
                        hormones: hormones.clone(),
                        accumulators: accumulators.clone(),
                        memory: MemoryStats {
                            trace_count: memory.trace_count() as u32,
                            edge_count: memory.edge_count() as u32,
                            af_size: af.members.len() as u32,
                        },
                        agency: AgencyStats { actions_taken: action_count, sensory_processed: sensory_count },
                    });
                }

                let elapsed = start.elapsed();
                if elapsed < interval { spin_sleep::sleep(interval - elapsed); }
            }
            tracing::info!("brain stopped");
        })
        .expect("spawn brain");

    // ═══════════════════════════════════════════
    // THREAD 2: World (60Hz) — placeholder, no rapier yet
    // ═══════════════════════════════════════════
    let world_shutdown = shutdown_tx.subscribe();
    let world_handle = std::thread::Builder::new()
        .name("world".into())
        .spawn(move || {
            use heart::world::physics::PhysicsWorld;
            use heart::sensory::traits::SensorySource;

            let mut world = PhysicsWorld::new();
            let interval = Duration::from_millis(16); // 60Hz
            tracing::info!("world: rapier3d, {} objects", world.snapshot().objects.len());

            loop {
                let start = std::time::Instant::now();
                if *world_shutdown.borrow() { break; }

                // World tick → ambient sensory
                for frame in world.tick() {
                    let _ = sensory_tx.try_send(frame);
                }

                // Brain's motor commands → execute in world → consequence
                while let Ok(cmd) = motor_rx.try_recv() {
                    let consequence = world.act(&cmd);
                    let _ = sensory_tx.try_send(consequence);
                    for fb in world.drain_feedback() {
                        let _ = sensory_tx.try_send(fb);
                    }
                }

                let elapsed = start.elapsed();
                if elapsed < interval { std::thread::sleep(interval - elapsed); }
            }
            tracing::info!("world stopped");
        })
        .expect("spawn world");

    // ═══════════════════════════════════════════
    // TOKIO: DB sync + Dashboard
    // ═══════════════════════════════════════════
    let sync_rx = state_rx.clone();
    let sync_persist = persistence.clone();
    tokio::spawn({
        let p = sync_persist.clone();
        async move {
            let mut interval = tokio::time::interval(Duration::from_millis(500));
            loop {
                interval.tick().await;
                let snap = sync_rx.borrow().clone();
                if let Err(e) = p.sync_snapshot(&snap).await {
                    tracing::warn!("sync: {e}");
                }
            }
        }
    });

    let report_rx = state_rx.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(5));
        loop {
            interval.tick().await;
            let s = report_rx.borrow().clone();
            let h = s.hormones.combined();
            tracing::info!(
                "cycle={} tps={} e={:.3} f={:.3} DA={:.3} NE={:.3} traces={} edges={} actions={}",
                s.cycle, s.tps, s.vitals.energy, s.vitals.fatigue,
                h[0], h[1], s.memory.trace_count, s.memory.edge_count, s.agency.actions_taken,
            );
        }
    });

    tokio::spawn(dashboard::serve(3333, state_rx.clone()));

    // Wait for Ctrl+C
    tokio::signal::ctrl_c().await.ok();
    tracing::info!("shutting down...");
    let _ = shutdown_tx.send(true);

    // Final sync
    let snap = state_rx.borrow().clone();
    if let Err(e) = persistence.sync_snapshot(&snap).await {
        tracing::warn!("final sync: {e}");
    }

    brain_handle.join().ok();
    world_handle.join().ok();
    tracing::info!("goodbye.");
}
