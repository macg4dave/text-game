use std::collections::BTreeMap;
use std::path::Path;
use std::time::Duration;

use anyhow::Result;
use reqwest::blocking::Client;
use serde_json::{json, Value};

use crate::config::RepoAiConfig;

use super::compose::{compose_env_with_port, docker_compose};
use super::issues::{fail_issue, PreflightIssue};
use super::output::{write_info, write_step};
use super::probes::{
    port_is_available, wait_for_container_healthy, wait_for_http_ready, wait_for_port_release,
};

const PORT_FALLBACK_OFFSET: u16 = 100;
const PORT_FALLBACK_ATTEMPTS: u16 = 20;
const CONTAINER_HEALTH_TIMEOUT: Duration = Duration::from_secs(90);
const APP_READY_TIMEOUT: Duration = Duration::from_secs(20);
const PORT_RELEASE_TIMEOUT: Duration = Duration::from_secs(15);

pub fn start_app_container(
    repo_root: &Path,
    config: &mut RepoAiConfig,
    compose_env: &BTreeMap<String, String>,
    rebuild: bool,
) -> Result<()> {
    write_step("Clearing any previous app container");
    docker_compose(repo_root)
        .with_args(["down", "--remove-orphans"])
        .with_envs(compose_env.clone())
        .run_checked()?;

    wait_for_port_release(config.port, PORT_RELEASE_TIMEOUT);
    resolve_launch_port(config, repo_root)?;
    let compose_env = compose_env_with_port(compose_env, config.port);

    if rebuild {
        write_step("Rebuilding app image without cache");
        docker_compose(repo_root)
            .with_args(["build", "--no-cache", "app"])
            .with_envs(compose_env.clone())
            .run_checked()?;
    }

    write_step("Starting app container");
    docker_compose(repo_root)
        .with_args(["up", "-d", "--build", "app"])
        .with_envs(compose_env.clone())
        .run_checked()?;

    let container_id = get_app_container_id(repo_root, &compose_env)?;
    if container_id.is_empty() {
        return fail_issue(
            PreflightIssue::blocker(
                "host",
                "app_container_missing",
                "The app container did not start correctly",
                "Docker Compose did not return an app container id for the app service.",
            )
            .with_recovery([
                "Run `docker compose ps` and `docker compose logs app`, then rerun the launcher.",
            ])
            .with_details(json!({"service": "app"})),
        );
    }

    if !wait_for_container_healthy(&container_id, CONTAINER_HEALTH_TIMEOUT)? {
        show_docker_debug(repo_root, &compose_env);
        return fail_issue(
            PreflightIssue::blocker(
                "host",
                "app_container_unhealthy",
                "The app container never became healthy",
                "Docker started the app container, but it did not report a healthy state in time.",
            )
            .with_recovery([
                "Review the container logs above, fix the startup failure, and rerun the launcher.",
            ])
            .with_details(json!({"container_id": container_id, "ready_url": config.ready_url()})),
        );
    }

    if !wait_for_http_ready(&config.ready_url(), APP_READY_TIMEOUT, Some("\"player\""))? {
        show_docker_debug(repo_root, &compose_env);
        return fail_issue(
            PreflightIssue::blocker(
                "host",
                "app_api_not_ready",
                "The app started, but the player surface was not ready",
                format!(
                    "The app container became healthy, but the app API was not confirmed at {}.",
                    config.ready_url()
                ),
            )
            .with_recovery(["Review the container logs above, confirm the server is listening on the expected port, and rerun the launcher."])
            .with_details(json!({"container_id": container_id, "probe_target": config.ready_url()})),
        );
    }

    write_info(&format!("App server is ready at {}", config.app_url));
    Ok(())
}

pub fn show_app_preflight(config: &RepoAiConfig) -> Result<()> {
    let client = Client::builder().timeout(Duration::from_secs(5)).build()?;
    let response = client.get(config.ready_url()).send();
    let Ok(response) = response else {
        return Ok(());
    };
    let Ok(payload) = response.json::<Value>() else {
        return Ok(());
    };

    let preflight = payload
        .get("debug")
        .and_then(|value| value.get("runtime"))
        .and_then(|value| value.get("preflight"));
    let Some(preflight) = preflight else {
        return Ok(());
    };

    let issues = preflight
        .get("issues")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if issues.is_empty() {
        return Ok(());
    }

    write_step("Startup checks reported by the app");
    for issue in issues {
        println!(
            "{}",
            serde_json::to_string_pretty(&issue).unwrap_or_else(|_| issue.to_string())
        );
        println!();
    }

    Ok(())
}

fn resolve_launch_port(config: &mut RepoAiConfig, repo_root: &Path) -> Result<()> {
    if port_is_available(config.port) {
        return Ok(());
    }

    if let Some(port) = find_fallback_port(
        config.port,
        PORT_FALLBACK_OFFSET,
        PORT_FALLBACK_ATTEMPTS,
        port_is_available,
    ) {
        write_info(&format!(
            "Port {} is in use by another local service. Using port {} for this launcher run.",
            config.port, port
        ));
        config.set_port(port);
        return Ok(());
    }

    fail_issue(
        PreflightIssue::blocker(
            "host",
            "app_port_in_use",
            "Choose a different app port",
            format!(
                "Port {} is already in use by another local service.",
                config.port
            ),
        )
        .with_recovery([
            "Stop that service, or set `PORT` in `.env` or your shell to an unused port, then rerun the launcher.",
        ])
        .with_env_vars(["PORT"])
        .with_details(json!({"cwd": repo_root.display().to_string(), "port": config.port})),
    )
}

fn find_fallback_port<F>(
    current_port: u16,
    offset: u16,
    attempts: u16,
    mut is_available: F,
) -> Option<u16>
where
    F: FnMut(u16) -> bool,
{
    let mut candidate = current_port.saturating_add(offset);
    for _ in 0..attempts {
        if candidate > 0 && is_available(candidate) {
            return Some(candidate);
        }
        candidate = candidate.saturating_add(1);
    }

    None
}

fn get_app_container_id(
    repo_root: &Path,
    compose_env: &BTreeMap<String, String>,
) -> Result<String> {
    let capture = docker_compose(repo_root)
        .with_args(["ps", "-q", "app"])
        .with_envs(compose_env.clone())
        .capture()?;
    Ok(capture.stdout.trim().to_string())
}

fn show_docker_debug(repo_root: &Path, compose_env: &BTreeMap<String, String>) {
    let ps = docker_compose(repo_root)
        .with_args(["ps"])
        .with_envs(compose_env.clone())
        .capture();
    if let Ok(ps) = ps {
        if !ps.stdout.is_empty() {
            println!();
            println!("{}", ps.stdout);
        }
    }

    let logs = docker_compose(repo_root)
        .with_args(["logs", "--tail", "100", "app", "litellm", "ollama"])
        .with_envs(compose_env.clone())
        .capture();
    if let Ok(logs) = logs {
        if !logs.stdout.is_empty() {
            println!();
            println!("{}", logs.stdout);
        }
        if !logs.stderr.is_empty() {
            println!();
            println!("{}", logs.stderr);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::find_fallback_port;

    #[test]
    fn fallback_port_uses_first_available_candidate() {
        let port = find_fallback_port(3000, 100, 4, |candidate| candidate == 3101);
        assert_eq!(port, Some(3101));
    }

    #[test]
    fn fallback_port_returns_none_when_candidates_are_exhausted() {
        let port = find_fallback_port(3000, 100, 3, |_| false);
        assert_eq!(port, None);
    }
}
