use std::net::TcpListener;
use std::thread;
use std::time::{Duration, Instant};

use anyhow::Result;
use reqwest::blocking::Client;

use crate::process::ProcessInvocation;

pub fn port_is_available(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

pub fn wait_for_port_release(port: u16, timeout: Duration) {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if port_is_available(port) {
            return;
        }
        thread::sleep(Duration::from_millis(500));
    }
}

pub fn wait_for_container_healthy(container_id: &str, timeout: Duration) -> Result<bool> {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        let status = get_container_health_status(container_id)?;
        match status.as_deref() {
            Some("healthy") => return Ok(true),
            Some("unhealthy") | Some("dead") | Some("exited") => return Ok(false),
            _ => thread::sleep(Duration::from_secs(1)),
        }
    }
    Ok(false)
}

pub fn wait_for_http_ready(
    uri: &str,
    timeout: Duration,
    expected_content: Option<&str>,
) -> Result<bool> {
    let client = Client::builder().timeout(Duration::from_secs(5)).build()?;
    let deadline = Instant::now() + timeout;

    while Instant::now() < deadline {
        if let Ok(response) = client.get(uri).send() {
            if response.status().is_success() {
                let body = response.text().unwrap_or_default();
                if expected_content
                    .map(|needle| body.contains(needle))
                    .unwrap_or(true)
                {
                    return Ok(true);
                }
            }
        }

        thread::sleep(Duration::from_secs(1));
    }

    Ok(false)
}

fn get_container_health_status(container_id: &str) -> Result<Option<String>> {
    let capture = ProcessInvocation::new("docker")
        .with_args([
            "inspect",
            "--format",
            "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}",
            container_id,
        ])
        .capture()?;

    if capture.exit_code != Some(0) {
        return Ok(None);
    }

    let status = capture.stdout.trim();
    if status.is_empty() {
        Ok(None)
    } else {
        Ok(Some(status.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::port_is_available;

    #[test]
    fn loopback_test_port_is_available_after_probe_listener_drops() {
        let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).expect("bind ephemeral port");
        let port = listener.local_addr().expect("listener addr").port();
        assert!(!port_is_available(port));
        drop(listener);
        assert!(port_is_available(port));
    }
}
