//! HTTP dashboard — serves status API + static HTML.

use axum::{routing::get, Json, Router};
use tokio::sync::watch;
use crate::brain::BrainSnapshot;

pub async fn serve(
    port: u16,
    state_rx: watch::Receiver<BrainSnapshot>,
    _shutdown: watch::Receiver<bool>,
) {
    let app = Router::new()
        .route("/api/status", get({
            let rx = state_rx.clone();
            move || async move {
                let s = rx.borrow().clone();
                Json(s)
            }
        }))
        .route("/", get(|| async {
            axum::response::Html(include_str!("../static/dashboard.html"))
        }));

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .expect("failed to bind dashboard port");

    tracing::info!("dashboard → http://localhost:{port}");

    axum::serve(listener, app).await.ok();
}
