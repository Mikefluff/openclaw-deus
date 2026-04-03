//! HTTP dashboard.

use axum::{routing::get, Json, Router};
use tokio::sync::watch;
use crate::core::state::Snapshot;

pub async fn serve(port: u16, state_rx: watch::Receiver<Snapshot>) {
    let app = Router::new()
        .route("/api/status", get({
            let rx = state_rx.clone();
            move || async move { Json(rx.borrow().clone()) }
        }))
        .route("/", get(|| async {
            axum::response::Html(include_str!("../../static/dashboard.html"))
        }));

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await.expect("bind dashboard");

    tracing::info!("dashboard → http://localhost:{port}");
    axum::serve(listener, app).await.ok();
}
