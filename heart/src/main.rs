//! DEUS Heart v0.3 — full cognitive runtime in Rust.
//!
//! Architecture:
//!   Thread 1: Brain (1000Hz, spin_sleep)
//!   Thread 2: World (60Hz, rapier3d physics)
//!   Tokio:    DB sync, HTTP dashboard, future gRPC
//!
//! Communication:
//!   World → Brain: sensory interrupt queue (crossbeam mpsc)
//!   Brain → World: motor command queue (crossbeam mpsc)
//!   Brain → Tokio: state watch channel (latest snapshot)

mod accel;
mod brain;
mod cache;
mod db;
mod sensory;
mod world;
mod scheduler;
mod dashboard;

use std::sync::Arc;
use std::time::Duration;
use crossbeam::channel;
use tokio::sync::watch;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_target(false)
        .with_timer(tracing_subscriber::fmt::time::uptime())
        .init();

    let db_url = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "127.0.0.1:8000".into());

    tracing::info!("DEUS Heart v0.3");
    tracing::info!("3 threads: brain(1000Hz) + world(60Hz) + tokio(I/O)");

    // Connect to SurrealDB
    let db = db::connect(&db_url).await;
    tracing::info!("SurrealDB connected");

    // Load initial brain state from DB
    let initial_state = db::load_state(&db).await;
    tracing::info!("initial state loaded");

    // ═══════════════════════════════════════════
    // CHANNELS
    // ═══════════════════════════════════════════

    // World → Brain: sensory interrupts (bounded, backpressure)
    let (sensory_tx, sensory_rx) = channel::bounded::<sensory::SensoryFrame>(256);

    // Brain → World: motor commands
    let (motor_tx, motor_rx) = channel::bounded::<sensory::MotorCommand>(64);

    // Brain → observers: state snapshot (latest value)
    let (state_tx, state_rx) = watch::channel(brain::BrainSnapshot::default());

    // Shutdown signal
    let (shutdown_tx, _) = watch::channel(false);
    let shutdown_rx_brain = shutdown_tx.subscribe();
    let shutdown_rx_world = shutdown_tx.subscribe();
    let shutdown_rx_dash = shutdown_tx.subscribe();

    // ═══════════════════════════════════════════
    // THREAD 1: Brain (1000Hz)
    // ═══════════════════════════════════════════
    let brain_handle = {
        let mut shutdown = shutdown_rx_brain;
        std::thread::Builder::new()
            .name("brain".into())
            .spawn(move || {
                let mut brain = brain::Brain::new(initial_state);
                let mut sched = scheduler::BrainScheduler::new();
                let interval = Duration::from_micros(1000); // 1ms = 1000Hz
                let mut tick_count: u64 = 0;
                let mut last_tps = std::time::Instant::now();

                loop {
                    let start = std::time::Instant::now();

                    // Check shutdown
                    if *shutdown.borrow() { break; }

                    // Drain sensory interrupt queue (non-blocking)
                    while let Ok(frame) = sensory_rx.try_recv() {
                        brain.process_sensory(&frame);
                    }

                    // Run scheduled brain functions
                    sched.tick(interval, &mut brain);

                    // If agency decided to act, send motor command
                    if let Some(cmd) = brain.take_motor_command() {
                        let _ = motor_tx.try_send(cmd);
                    }

                    // Publish state snapshot (non-blocking)
                    tick_count += 1;
                    if tick_count % 100 == 0 {
                        let _ = state_tx.send(brain.snapshot());
                    }

                    // TPS counter
                    if last_tps.elapsed() >= Duration::from_secs(1) {
                        brain.set_tps(tick_count);
                        tick_count = 0;
                        last_tps = std::time::Instant::now();
                    }

                    // Precise sleep to maintain 1000Hz
                    let elapsed = start.elapsed();
                    if elapsed < interval {
                        spin_sleep::sleep(interval - elapsed);
                    }
                }
                tracing::info!("brain thread stopped");
            })
            .expect("failed to spawn brain thread")
    };

    // ═══════════════════════════════════════════
    // THREAD 2: World (60Hz)
    // ═══════════════════════════════════════════
    let world_handle = {
        let mut shutdown = shutdown_rx_world;
        std::thread::Builder::new()
            .name("world".into())
            .spawn(move || {
                let mut world = world::PhysicsWorld::new();
                let interval = Duration::from_millis(16); // ~60Hz

                loop {
                    let start = std::time::Instant::now();

                    if *shutdown.borrow() { break; }

                    // World tick → ambient sensory events
                    let frames = world.tick();
                    for frame in frames {
                        let _ = sensory_tx.try_send(frame);
                    }

                    // Drain motor command queue → execute in world → send consequences
                    while let Ok(cmd) = motor_rx.try_recv() {
                        let consequence = world.act(&cmd);
                        let _ = sensory_tx.try_send(consequence);

                        // Mama feedback
                        for fb in world.drain_feedback() {
                            let _ = sensory_tx.try_send(fb);
                        }
                    }

                    let elapsed = start.elapsed();
                    if elapsed < interval {
                        std::thread::sleep(interval - elapsed);
                    }
                }
                tracing::info!("world thread stopped");
            })
            .expect("failed to spawn world thread")
    };

    // ═══════════════════════════════════════════
    // TOKIO: DB sync + Dashboard
    // ═══════════════════════════════════════════

    // DB sync task (2Hz)
    let db_sync = {
        let db = db.clone();
        let state_rx = state_rx.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_millis(500));
            loop {
                interval.tick().await;
                let snapshot = state_rx.borrow().clone();
                db::sync_snapshot(&db, &snapshot).await;
            }
        })
    };

    // Status reporter (5s)
    let reporter = {
        let state_rx = state_rx.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(5));
            loop {
                interval.tick().await;
                let s = state_rx.borrow().clone();
                tracing::info!(
                    "cycle={} tps={} energy={:.3} fatigue={:.3} DA={:.3} NE={:.3} cort={:.3} sero={:.3}",
                    s.cycle, s.tps, s.energy, s.fatigue,
                    s.hormones[0], s.hormones[1], s.hormones[2], s.hormones[3],
                );
            }
        })
    };

    // HTTP dashboard
    let dashboard_task = dashboard::serve(3333, state_rx.clone(), shutdown_rx_dash);

    // Wait for Ctrl+C
    tokio::signal::ctrl_c().await.ok();
    tracing::info!("shutting down...");
    let _ = shutdown_tx.send(true);

    // Sync final state
    let final_snapshot = state_rx.borrow().clone();
    db::sync_snapshot(&db, &final_snapshot).await;

    brain_handle.join().ok();
    world_handle.join().ok();
    db_sync.abort();
    reporter.abort();

    tracing::info!("goodbye.");
}
