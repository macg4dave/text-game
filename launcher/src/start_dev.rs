mod compose;
mod issues;
mod output;
mod preflight;
mod probes;
mod runtime;

use anyhow::Result;
use clap::Args;

use crate::config::{resolve_repo_ai_config, resolve_workspace_root_from, RepoAiConfig};
use crate::env::load_repo_env;
use crate::process::ProcessInvocation;

use self::compose::compose_env_overrides;
use self::output::{write_info, write_step};

#[derive(Args, Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct StartDevOptions {
    /// Skip opening the browser after the app becomes ready.
    #[arg(long)]
    pub no_browser: bool,
    /// Rebuild the app image without cache before launch.
    #[arg(long)]
    pub rebuild: bool,
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

    preflight::confirm_docker_tooling(&repo_root)?;
    preflight::confirm_host_path_prerequisites(&repo_root)?;
    preflight::confirm_local_gpu_support()?;
    preflight::confirm_provider_ready(&config)?;

    let compose_env = compose_env_overrides(&config);
    runtime::start_app_container(&repo_root, &mut config, &compose_env, options.rebuild)?;
    runtime::show_app_preflight(&config)?;

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
        ProcessInvocation::new("xdg-open")
            .with_args([url])
            .run_checked()?;
        Ok(())
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

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use crate::env::RepoEnv;

    use super::{resolve_provider_config, StartDevOptions};

    #[test]
    fn start_dev_options_default_to_browser_open_and_cached_builds() {
        assert_eq!(
            StartDevOptions::default(),
            StartDevOptions {
                no_browser: false,
                rebuild: false,
            }
        );
    }

    #[test]
    fn provider_resolution_defaults_to_litellm_gpu_path() {
        let repo_env = RepoEnv {
            path: ".env".into(),
            exists: false,
            values: BTreeMap::new(),
        };

        let config = resolve_provider_config(&repo_env);
        assert_eq!(config.provider, "litellm");
        assert_eq!(config.profile, "local-gpu-small");
        assert_eq!(config.port, 3000);
    }

    #[test]
    fn provider_resolution_clamps_custom_profile_back_to_supported_launcher_default() {
        let repo_env = RepoEnv {
            path: ".env".into(),
            exists: true,
            values: [
                ("AI_PROFILE".to_string(), "custom".to_string()),
                ("AI_PROVIDER".to_string(), "openai-compatible".to_string()),
            ]
            .into_iter()
            .collect(),
        };

        let config = resolve_provider_config(&repo_env);
        assert_eq!(config.profile, "local-gpu-small");
        assert_eq!(config.provider, "litellm");
    }
}
