use std::fs;
use std::path::Path;

use anyhow::Result;
use serde_json::{json, Value};

use crate::config::RepoAiConfig;
use crate::process::{ProcessCapture, ProcessInvocation};

use super::compose::docker_compose;
use super::issues::{fail_issue, PreflightIssue};
use super::output::{write_info, write_step};

pub fn confirm_docker_tooling(repo_root: &Path) -> Result<()> {
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

pub fn confirm_host_path_prerequisites(repo_root: &Path) -> Result<()> {
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
            .with_recovery([
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

pub fn confirm_local_gpu_support() -> Result<()> {
    write_step("Checking NVIDIA GPU prerequisites");

    let gpu_info = ProcessInvocation::new("nvidia-smi")
        .with_args([
            "--query-gpu=name,memory.total",
            "--format=csv,noheader,nounits",
        ])
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

    for line in gpu_info
        .stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
    {
        write_info(&format!("gpu: {line}"));
    }

    let runtimes = ProcessInvocation::new("docker")
        .with_args(["info", "--format", "{{json .Runtimes}}"])
        .capture()?;
    let runtimes_json =
        serde_json::from_str::<Value>(runtimes.stdout.trim()).unwrap_or(Value::Null);
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

pub fn confirm_provider_ready(config: &RepoAiConfig) -> Result<()> {
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

fn combine_capture_output(capture: &ProcessCapture) -> String {
    [capture.stdout.trim(), capture.stderr.trim()]
        .into_iter()
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::confirm_provider_ready;
    use crate::config::RepoAiConfig;

    fn sample_config(provider: &str) -> RepoAiConfig {
        RepoAiConfig {
            has_dot_env: false,
            profile: "local-gpu-small".to_string(),
            provider: provider.to_string(),
            base_url: "http://127.0.0.1:4000".to_string(),
            api_key: "anything".to_string(),
            chat_model: "game-chat".to_string(),
            embedding_model: "game-embedding".to_string(),
            port: 3000,
            app_url: "http://127.0.0.1:3000/".to_string(),
        }
    }

    #[test]
    fn provider_preflight_accepts_litellm() {
        confirm_provider_ready(&sample_config("litellm")).expect("litellm should be accepted");
    }

    #[test]
    fn provider_preflight_rejects_non_litellm_modes() {
        let error =
            confirm_provider_ready(&sample_config("ollama")).expect_err("non-litellm should fail");
        let message = error.to_string();

        assert!(message.contains("Use LiteLLM mode for the GPU-backed launcher"));
        assert!(message.contains("Env vars: AI_PROVIDER"));
    }
}
