use std::collections::BTreeMap;
use std::fs;
use std::net::TcpListener;
use std::path::Path;
use std::thread;
use std::time::{Duration, Instant};

use anyhow::{anyhow, Result};
use reqwest::blocking::Client;
use serde_json::{json, Value};

use crate::config::{resolve_repo_ai_config, resolve_workspace_root_from, RepoAiConfig};
use crate::env::load_repo_env;
use crate::process::{ProcessCapture, ProcessInvocation};

const PORT_FALLBACK_OFFSET: u16 = 100;
const PORT_FALLBACK_ATTEMPTS: u16 = 20;
const CONTAINER_HEALTH_TIMEOUT: Duration = Duration::from_secs(90);
const APP_READY_TIMEOUT: Duration = Duration::from_secs(20);
const PORT_RELEASE_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StartDevOptions {
    pub no_browser: bool,
    pub rebuild: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PreflightIssue {
    severity: &'static str,
    area: &'static str,
    code: &'static str,
    title: String,
    message: String,
    recovery: Vec<String>,
    env_vars: Vec<String>,
    details: Option<Value>,
}

impl PreflightIssue {
    fn blocker(area: &'static str, code: &'static str, title: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            severity: "blocker",
            area,
            code,
            title: title.into(),
            message: message.into(),
            recovery: Vec::new(),
            env_vars: Vec::new(),
            details: None,
        }
    }

    fn with_recovery(mut self, recovery: impl IntoIterator<Item = impl Into<String>>) -> Self {
        self.recovery = recovery.into_iter().map(Into::into).collect();
        self
    }

    fn with_env_vars(mut self, env_vars: impl IntoIterator<Item = impl Into<String>>) -> Self {
        self.env_vars = env_vars.into_iter().map(Into::into).collect();
        self
    }

    fn with_details(mut self, details: Value) -> Self {
        self.details = Some(details);
        self
    }

    fn format(&self) -> String {
        let mut lines = vec![
            format!("[{}] {}", self.severity.to_uppercase(), self.title),
            self.message.clone(),
        ];

        if let Some(first) = self.recovery.first() {
            lines.push(format!("Recommended next step: {first}"));
        }

        if !self.env_vars.is_empty() {
            lines.push(format!("Env vars: {}", self.env_vars.join(", ")));
        }

        if let Some(details) = &self.details {
            lines.push("Advanced details:".to_string());
            lines.push(serde_json::to_string_pretty(details).unwrap_or_else(|_| details.to_string()));
        }

        lines.join("\n")
    }
}

pub fn run(options: StartDevOptions) -> Result<()> {
    let repo_root = resolve_workspace_root_from(&std::env::current_dir()?)?;
    let repo_env = load_repo_env(&repo_root)?;
    let mut config = resolve_provider_config(&repo_env);

    println!("Text Game Docker startup");
    write_info(&format!("repo: {}", repo_root.display()));
    write_info("ai stack: gpu-backed docker");
    write_info(&format!("profile: {}", config.profile));
    write_info(&format!("provider: {}", config.provider));
    if config.has_dot_env {
        write_info("configuration: using .env");
    } else {
        write_info("configuration: no .env found, using GPU-backed LiteLLM defaults for this run");
    }

    confirm_docker_tooling(&repo_root)?;
    confirm_host_path_prerequisites(&repo_root)?;
    confirm_local_gpu_support()?;
    confirm_provider_ready(&config)?;

    let compose_env = compose_env_overrides(&config);
    start_app_container(&repo_root, &mut config, &compose_env, options.rebuild)?;
    show_app_preflight(&config)?;

    if options.no_browser {
        write_info("Skipping browser open because --no-browser was provided.");
    } else {
        write_step("Opening browser");
        open_browser(&config.app_url)?;
    }

    println!();
    println!("Ready: {}", config.app_url);
    Ok(())
}

fn write_step(message: &str) {
    println!("==> {message}");
}

fn write_info(message: &str) {
    println!("    {message}");
}

fn fail_issue(issue: PreflightIssue) -> Result<()> {
    Err(anyhow!(issue.format()))
}

fn confirm_docker_tooling(repo_root: &Path) -> Result<()> {
    let docker_version = ProcessInvocation::new("docker")
        .with_args(["--version"])
        .in_dir(repo_root)
        .capture();

    if docker_version.is_err() {
        return fail_issue(
            PreflightIssue::blocker(
                "host",
                "docker_missing",
                "Install Docker before starting the game",
                "Docker was not found on PATH, so the supported startup path cannot launch the app and LiteLLM sidecar.",
            )
            .with_recovery(["Install Docker Desktop or Docker Engine with Compose support, then rerun this launcher."])
            .with_details(json!({"check": "docker"})),
        );
    }

    let mut compose_version = docker_compose(repo_root)
        .with_args(["version", "--short"])
        .capture()?;
    if compose_version.exit_code != Some(0) {
        let fallback = docker_compose(repo_root).with_args(["version"]).capture()?;
        if fallback.exit_code == Some(0) {
            compose_version = fallback;
        }
    }
    if compose_version.exit_code != Some(0) {
        return fail_issue(
            PreflightIssue::blocker(
                "host",
                "docker_compose_missing",
                "Install Docker Compose support before launching the game",
                "Docker is installed, but `docker compose` is not available in this shell.",
            )
            .with_recovery([
                "Update Docker Desktop or Docker Engine so the Compose plugin is available.",
                "Open a new terminal window after the update, confirm `docker compose version` works, then rerun the launcher.",
            ])
            .with_details(json!({
                "compose_output": combine_capture_output(&compose_version)
            })),
        );
    }
    if !compose_version.stdout.is_empty() {
        write_info(&format!("docker compose: {}", compose_version.stdout));
    }

    let docker_engine = ProcessInvocation::new("docker")
        .with_args(["info", "--format", "{{.ServerVersion}}"])
        .in_dir(repo_root)
        .capture()?;
    if docker_engine.exit_code != Some(0) {
        return fail_issue(
            PreflightIssue::blocker(
                "host",
                "docker_engine_unavailable",
                "Start Docker Desktop before launching the game",
                "Docker is installed, but the Docker engine is not responding.",
            )
            .with_recovery([
                "Start Docker Desktop and wait for the Linux container engine to finish starting, then rerun this launcher.",
                "If Docker Desktop is already open, switch it to Linux containers and confirm `docker info` works in a new shell.",
            ])
            .with_details(json!({"docker_output": combine_capture_output(&docker_engine)})),
        );
    }
    if !docker_engine.stdout.is_empty() {
        write_info(&format!("docker engine: {}", docker_engine.stdout));
    }

    let docker_os = ProcessInvocation::new("docker")
        .with_args(["info", "--format", "{{.OSType}}"])
        .in_dir(repo_root)
        .capture()?;
    let os_type = docker_os.stdout.trim().to_lowercase();
    if !os_type.is_empty() {
        write_info(&format!("docker runtime: {} containers", os_type));
    }
    if os_type != "linux" {
        return fail_issue(
            PreflightIssue::blocker(
                "host",
                "docker_linux_containers_required",
                "Switch Docker to Linux containers before launching the game",
                "The supported launcher path expects the Docker Linux container runtime, but Docker is currently using Windows containers.",
            )
            .with_recovery(["Switch Docker Desktop back to Linux containers, confirm `docker info` reports `OSType=linux`, then rerun the launcher."])
            .with_details(json!({"resolved_value": os_type})),
        );
    }

    Ok(())
}

fn confirm_host_path_prerequisites(repo_root: &Path) -> Result<()> {
    let data_path = repo_root.join("data");
    fs::create_dir_all(&data_path)?;
    let probe_path = data_path.join(format!(".preflight-write-{}.tmp", std::process::id()));
    let write_result = fs::write(&probe_path, "ok");
    let _ = fs::remove_file(&probe_path);

    if let Err(error) = write_result {
        return fail_issue(
            PreflightIssue::blocker(
                "storage",
                "launcher_data_path_unwritable",
                "Fix the app data folder permissions",
                format!(
                    "The launcher could not create a temporary file in {}.",
                    data_path.display()
                ),
            )
            .with_recovery(vec![
                format!(
                    "Confirm that {} exists on a writable drive and your user account can create files there.",
                    data_path.display()
                ),
                "Restart the launcher after fixing the folder permissions or moving the project to a writable location.".to_string(),
            ])
            .with_details(json!({"error": error.to_string()})),
        );
    }

    Ok(())
}

fn confirm_local_gpu_support() -> Result<()> {
    write_step("Checking NVIDIA GPU prerequisites");

    let gpu_info = ProcessInvocation::new("nvidia-smi")
        .with_args(["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"])
        .capture();

    let gpu_info = match gpu_info {
        Ok(capture) if capture.exit_code == Some(0) && !capture.stdout.trim().is_empty() => capture,
        _ => {
            return fail_issue(
                PreflightIssue::blocker(
                    "host",
                    "gpu_tooling_not_detected",
                    "Install NVIDIA GPU tooling before launching the game",
                    "This launcher only supports the GPU-backed Docker Ollama path, and `nvidia-smi` was not available on the host.",
                )
                .with_recovery([
                    "Install or repair the NVIDIA driver stack until `nvidia-smi` works in a normal terminal session.",
                    "Open a new terminal window and rerun this launcher after `nvidia-smi` reports your GPU.",
                ])
                .with_details(json!({"check": "nvidia-smi"})),
            );
        }
    };

    for line in gpu_info.stdout.lines().map(str::trim).filter(|line| !line.is_empty()) {
        write_info(&format!("gpu: {line}"));
    }

    let runtimes = ProcessInvocation::new("docker")
        .with_args(["info", "--format", "{{json .Runtimes}}"])
        .capture()?;
    let runtimes_json = serde_json::from_str::<Value>(runtimes.stdout.trim()).unwrap_or(Value::Null);
    let has_nvidia = runtimes_json
        .as_object()
        .map(|object| object.contains_key("nvidia"))
        .unwrap_or(false);

    if !has_nvidia {
        return fail_issue(
            PreflightIssue::blocker(
                "host",
                "docker_nvidia_runtime_missing",
                "Enable Docker NVIDIA GPU support before launching the game",
                "Docker is running, but it did not report an NVIDIA runtime for the GPU-backed Ollama path.",
            )
            .with_recovery([
                "Enable NVIDIA GPU support in Docker Desktop and WSL2, then confirm `docker info` shows an `nvidia` runtime.",
                "Rerun the launcher after Docker Desktop reports the Linux engine as ready.",
            ])
            .with_details(json!({"resolved_value": runtimes.stdout.trim()})),
        );
    }

    Ok(())
}

fn confirm_provider_ready(config: &RepoAiConfig) -> Result<()> {
    if config.provider != "litellm" {
        return fail_issue(
            PreflightIssue::blocker(
                "config",
                "launcher_requires_litellm",
                "Use LiteLLM mode for the GPU-backed launcher",
                "The Windows launcher now always uses the GPU-backed Docker LiteLLM stack so the app can keep using the stable gateway aliases.",
            )
            .with_recovery(["Remove custom direct-provider launcher overrides and rerun the launcher so it can start the repo-managed LiteLLM and Ollama containers."])
            .with_env_vars(["AI_PROVIDER"])
            .with_details(json!({"provider": config.provider})),
        );
    }

    write_step(&format!("Checking AI provider: {}", config.provider));
    write_info("Docker Compose will start the LiteLLM sidecar and the GPU-backed Ollama container for this run.");
    Ok(())
}

fn start_app_container(
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
            .with_recovery(["Run `docker compose ps` and `docker compose logs app`, then rerun the launcher."])
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
            .with_recovery(["Review the container logs above, fix the startup failure, and rerun the launcher."])
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

fn docker_compose(repo_root: &Path) -> ProcessInvocation {
    ProcessInvocation::new("docker")
        .with_args([
            "compose",
            "-f",
            repo_root.join("docker-compose.yml").to_string_lossy().to_string().as_str(),
            "-f",
            repo_root
                .join("docker-compose.gpu.yml")
                .to_string_lossy()
                .to_string()
                .as_str(),
        ])
        .in_dir(repo_root)
}

fn compose_env_overrides(config: &RepoAiConfig) -> BTreeMap<String, String> {
    BTreeMap::from([
        ("AI_PROFILE".to_string(), config.profile.clone()),
        ("COMPOSE_AI_PROVIDER".to_string(), "litellm".to_string()),
        (
            "COMPOSE_LITELLM_PROXY_URL".to_string(),
            "http://litellm:4000".to_string(),
        ),
        (
            "COMPOSE_OLLAMA_BASE_URL".to_string(),
            "http://ollama:11434/v1".to_string(),
        ),
        (
            "LITELLM_OLLAMA_BASE_URL".to_string(),
            "http://ollama:11434".to_string(),
        ),
    ])
}

fn compose_env_with_port(base: &BTreeMap<String, String>, port: u16) -> BTreeMap<String, String> {
    let mut env = base.clone();
    env.insert("PORT".to_string(), port.to_string());
    env
}

fn resolve_launch_port(config: &mut RepoAiConfig, repo_root: &Path) -> Result<()> {
    if port_is_available(config.port) {
        return Ok(());
    }

    let mut candidate = config.port.saturating_add(PORT_FALLBACK_OFFSET);
    for _ in 0..PORT_FALLBACK_ATTEMPTS {
        if candidate > 0 && port_is_available(candidate) {
            write_info(&format!(
                "Port {} is in use by another local service. Using port {} for this launcher run.",
                config.port, candidate
            ));
            config.set_port(candidate);
            return Ok(());
        }
        candidate = candidate.saturating_add(1);
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

fn port_is_available(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

fn wait_for_port_release(port: u16, timeout: Duration) {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if port_is_available(port) {
            return;
        }
        thread::sleep(Duration::from_millis(500));
    }
}

fn get_app_container_id(repo_root: &Path, compose_env: &BTreeMap<String, String>) -> Result<String> {
    let capture = docker_compose(repo_root)
        .with_args(["ps", "-q", "app"])
        .with_envs(compose_env.clone())
        .capture()?;
    Ok(capture.stdout.trim().to_string())
}

fn wait_for_container_healthy(container_id: &str, timeout: Duration) -> Result<bool> {
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

fn wait_for_http_ready(uri: &str, timeout: Duration, expected_content: Option<&str>) -> Result<bool> {
    let client = Client::builder().timeout(Duration::from_secs(5)).build()?;
    let deadline = Instant::now() + timeout;

    while Instant::now() < deadline {
        if let Ok(response) = client.get(uri).send() {
            if response.status().is_success() {
                let body = response.text().unwrap_or_default();
                if expected_content.map(|needle| body.contains(needle)).unwrap_or(true) {
                    return Ok(true);
                }
            }
        }

        thread::sleep(Duration::from_secs(1));
    }

    Ok(false)
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

fn show_app_preflight(config: &RepoAiConfig) -> Result<()> {
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
        println!("{}", serde_json::to_string_pretty(&issue).unwrap_or_else(|_| issue.to_string()));
        println!();
    }

    Ok(())
}

fn open_browser(url: &str) -> Result<()> {
    #[cfg(windows)]
    {
        ProcessInvocation::new("cmd")
            .with_args(["/C", "start", "", url])
            .run_checked()?;
        return Ok(());
    }

    #[cfg(not(windows))]
    {
        ProcessInvocation::new("xdg-open").with_args([url]).run_checked()?;
        Ok(())
    }
}

fn combine_capture_output(capture: &ProcessCapture) -> String {
    [capture.stdout.trim(), capture.stderr.trim()]
        .into_iter()
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use crate::env::RepoEnv;

    use super::{compose_env_with_port, compose_env_overrides, port_is_available};
    use crate::config::resolve_repo_ai_config;

    #[test]
    fn provider_resolution_defaults_to_litellm_gpu_path() {
        let repo_env = RepoEnv {
            path: ".env".into(),
            exists: false,
            values: BTreeMap::new(),
        };

        let config = resolve_repo_ai_config(&repo_env, true);
        assert_eq!(config.provider, "litellm");
        assert_eq!(config.profile, "local-gpu-small");
        assert_eq!(config.port, 3000);
    }

    #[test]
    fn compose_env_includes_launcher_overrides() {
        let repo_env = RepoEnv {
            path: ".env".into(),
            exists: false,
            values: BTreeMap::new(),
        };
        let config = resolve_repo_ai_config(&repo_env, true);
        let env = compose_env_overrides(&config);
        assert_eq!(env.get("COMPOSE_AI_PROVIDER"), Some(&"litellm".to_string()));
        assert_eq!(env.get("AI_PROFILE"), Some(&"local-gpu-small".to_string()));
    }

    #[test]
    fn port_override_is_added_to_compose_env() {
        let env = compose_env_with_port(&BTreeMap::new(), 3110);
        assert_eq!(env.get("PORT"), Some(&"3110".to_string()));
    }

    #[test]
    fn loopback_test_port_is_available_after_probe_listener_drops() {
        let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).expect("bind ephemeral port");
        let port = listener.local_addr().expect("listener addr").port();
        assert!(!port_is_available(port));
        drop(listener);
        assert!(port_is_available(port));
    }
}

fn resolve_provider_config(repo_env: &crate::env::RepoEnv) -> RepoAiConfig {
    let mut config = resolve_repo_ai_config(repo_env, true);
    if config.profile != "local-gpu-small" && config.profile != "local-gpu-large" {
        config.profile = "local-gpu-small".to_string();
    }
    config.provider = "litellm".to_string();
    config
}
