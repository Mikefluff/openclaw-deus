//! DEUS Brainstem — cognitive runtime in Rust.
//!
//! In-memory: hormones, accumulators, STI, energy, fatigue.
//! SurrealDB: traces, edges, bindings, rules (persistent memory).
//! Tick loop runs at native speed. DB ops are async background.
//!
//! Usage: heart [ws://127.0.0.1:8000]

mod brain;
mod cache;
mod db;

use std::time::{Duration, Instant};
use tokio::sync::watch;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_target(false)
        .with_timer(tracing_subscriber::fmt::time::uptime())
        .init();

    let url = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "127.0.0.1:8000".into());

    tracing::info!("DEUS brainstem v0.2");
    tracing::info!("connecting to SurrealDB at {url}");

    let db = db::connect(&url).await;
    tracing::info!("connected");

    // Load initial state from DB
    let mut brain = brain::Brain::new();
    brain.load_from_db(&db).await;
    tracing::info!("brain loaded: {} traces cached", brain.trace_count());

    let (shutdown_tx, shutdown_rx) = watch::channel(false);

    // Spawn DB sync task (writes accumulated changes to SurrealDB)
    let db_clone = db.clone();
    let mut shutdown_rx_db = shutdown_rx.clone();
    let brain_state = brain.shared_state();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(500));
        loop {
            tokio::select! {
                _ = interval.tick() => {
                    db::sync_to_db(&db_clone, &brain_state).await;
                }
                _ = shutdown_rx_db.changed() => break,
            }
        }
    });

    // Spawn status reporter
    let brain_state2 = brain.shared_state();
    let mut shutdown_rx_status = shutdown_rx.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(5));
        loop {
            tokio::select! {
                _ = interval.tick() => {
                    let s = brain_state2.lock().unwrap();
                    tracing::info!(
                        "cycle={} energy={:.3} fatigue={:.3} DA={:.3} NE={:.3} cort={:.3} sero={:.3} traces={} edges={} tps={}",
                        s.cycle, s.energy, s.fatigue,
                        s.hormones.dopamine, s.hormones.norepinephrine,
                        s.hormones.cortisol, s.hormones.serotonin,
                        s.trace_count, s.edge_count, s.ticks_per_sec,
                    );
                }
                _ = shutdown_rx_status.changed() => break,
            }
        }
    });

    // Main tick loop — runs at native speed
    tracing::info!("brain started. Ctrl+C to stop.");
    let mut tick_count: u64 = 0;
    let mut last_report = Instant::now();

    loop {
        brain.tick();
        tick_count += 1;

        // Compute tps every second
        if last_report.elapsed() >= Duration::from_secs(1) {
            let tps = tick_count as f64 / last_report.elapsed().as_secs_f64();
            brain.set_tps(tps as u64);
            tick_count = 0;
            last_report = Instant::now();
        }

        // Check shutdown
        if *shutdown_rx.borrow() {
            break;
        }

        // Yield to tokio runtime periodically
        if tick_count % 100 == 0 {
            tokio::task::yield_now().await;
        }
    }

    tracing::info!("brain stopping...");
    db::sync_to_db(&db, &brain.shared_state()).await;
    tracing::info!("final state synced to DB. goodbye.");
}
