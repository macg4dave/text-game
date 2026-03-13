use std::path::{Path, PathBuf};

use crate::error::SunrayError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SunrayCommand {
    StartDev,
    TestLocalAiWorkflow,
    TestSetupBrowserSmoke,
    ValidateLocalGpuProfileMatrix,
    ValidateLitellmDefaultConfig,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CommandContract {
    pub name: &'static str,
    pub summary: &'static str,
    pub legacy_script: &'static str,
    pub backlog_task: &'static str,
}

pub const COMMAND_CONTRACTS: [CommandContract; 5] = [
	CommandContract {
		name: "start-dev",
		summary: "Launcher and Docker preflight entrypoint replacing scripts/start-dev.ps1.",
		legacy_script: "scripts/start-dev.ps1",
		backlog_task: "T65b",
	},
	CommandContract {
		name: "test-local-ai-workflow",
		summary: "Local AI workflow harness replacing scripts/test-local-ai-workflow.ps1.",
		legacy_script: "scripts/test-local-ai-workflow.ps1",
		backlog_task: "T65c",
	},
	CommandContract {
		name: "test-setup-browser-smoke",
		summary: "Setup browser smoke harness replacing scripts/test-setup-browser-smoke.ps1.",
		legacy_script: "scripts/test-setup-browser-smoke.ps1",
		backlog_task: "T65e",
	},
	CommandContract {
		name: "validate-local-gpu-profile-matrix",
		summary: "Local GPU matrix validator replacing scripts/validate-local-gpu-profile-matrix.ps1.",
		legacy_script: "scripts/validate-local-gpu-profile-matrix.ps1",
		backlog_task: "T65d",
	},
	CommandContract {
		name: "validate-litellm-default-config",
		summary: "LiteLLM default-config validator replacing scripts/validate-litellm-default-config.ps1.",
		legacy_script: "scripts/validate-litellm-default-config.ps1",
		backlog_task: "T65d",
	},
];

impl SunrayCommand {
    pub fn contract(self) -> &'static CommandContract {
        match self {
            SunrayCommand::StartDev => &COMMAND_CONTRACTS[0],
            SunrayCommand::TestLocalAiWorkflow => &COMMAND_CONTRACTS[1],
            SunrayCommand::TestSetupBrowserSmoke => &COMMAND_CONTRACTS[2],
            SunrayCommand::ValidateLocalGpuProfileMatrix => &COMMAND_CONTRACTS[3],
            SunrayCommand::ValidateLitellmDefaultConfig => &COMMAND_CONTRACTS[4],
        }
    }
}

pub fn command_contracts() -> &'static [CommandContract] {
    &COMMAND_CONTRACTS
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RepoAiConfig {
    pub has_dot_env: bool,
    pub profile: String,
    pub provider: String,
    pub base_url: String,
    pub api_key: String,
    pub chat_model: String,
    pub embedding_model: String,
    pub port: u16,
    pub app_url: String,
}

impl RepoAiConfig {
    pub fn ready_url(&self) -> String {
        format!(
            "http://127.0.0.1:{}/api/state?name=LauncherCheck",
            self.port
        )
    }

    pub fn set_port(&mut self, port: u16) {
        self.port = port;
        self.app_url = format!("http://127.0.0.1:{port}/");
    }
}

pub fn resolve_repo_ai_config(repo_env: &crate::env::RepoEnv, include_port: bool) -> RepoAiConfig {
    let mut profile = resolve_config_value(repo_env, &["AI_PROFILE"], "local-gpu-small")
        .trim()
        .to_lowercase();
    if !matches!(
        profile.as_str(),
        "local-gpu-small" | "local-gpu-large" | "custom"
    ) {
        profile = "local-gpu-small".to_string();
    }

    let has_ai_provider = has_any_config_value(repo_env, &["AI_PROVIDER"]);
    let mut provider = resolve_config_value(repo_env, &["AI_PROVIDER"], "");
    if provider.is_empty() && profile != "custom" && !has_ai_provider {
        provider = "litellm".to_string();
    }
    if provider.is_empty() {
        if has_any_config_value(
            repo_env,
            &[
                "LITELLM_PROXY_URL",
                "LITELLM_API_KEY",
                "LITELLM_CHAT_MODEL",
                "LITELLM_EMBEDDING_MODEL",
            ],
        ) {
            provider = "litellm".to_string();
        } else if has_any_config_value(
            repo_env,
            &[
                "OLLAMA_BASE_URL",
                "OLLAMA_API_KEY",
                "OLLAMA_CHAT_MODEL",
                "OLLAMA_EMBEDDING_MODEL",
            ],
        ) {
            provider = "ollama".to_string();
        } else if has_any_config_value(
            repo_env,
            &[
                "AI_API_KEY",
                "AI_BASE_URL",
                "OPENAI_API_KEY",
                "OPENAI_BASE_URL",
                "OPENAI_MODEL",
                "OPENAI_EMBEDDING_MODEL",
            ],
        ) {
            provider = "openai-compatible".to_string();
        } else {
            provider = "litellm".to_string();
        }
    }
    provider = provider.trim().to_lowercase();

    let (base_url, api_key, chat_model, embedding_model) = match provider.as_str() {
        "litellm" => (
            resolve_config_value(
                repo_env,
                &["LITELLM_PROXY_URL", "AI_BASE_URL", "OPENAI_BASE_URL"],
                "http://127.0.0.1:4000",
            ),
            resolve_config_value(
                repo_env,
                &["LITELLM_API_KEY", "AI_API_KEY", "OPENAI_API_KEY"],
                "anything",
            ),
            resolve_config_value(
                repo_env,
                &["LITELLM_CHAT_MODEL", "AI_CHAT_MODEL", "OPENAI_MODEL"],
                "game-chat",
            ),
            resolve_config_value(
                repo_env,
                &[
                    "LITELLM_EMBEDDING_MODEL",
                    "AI_EMBEDDING_MODEL",
                    "OPENAI_EMBEDDING_MODEL",
                ],
                "game-embedding",
            ),
        ),
        "ollama" => (
            resolve_config_value(
                repo_env,
                &["OLLAMA_BASE_URL", "AI_BASE_URL", "OPENAI_BASE_URL"],
                "http://127.0.0.1:11434/v1",
            ),
            resolve_config_value(
                repo_env,
                &["OLLAMA_API_KEY", "AI_API_KEY", "OPENAI_API_KEY"],
                "ollama",
            ),
            resolve_config_value(
                repo_env,
                &["OLLAMA_CHAT_MODEL", "AI_CHAT_MODEL", "OPENAI_MODEL"],
                "gemma3:4b",
            ),
            resolve_config_value(
                repo_env,
                &[
                    "OLLAMA_EMBEDDING_MODEL",
                    "AI_EMBEDDING_MODEL",
                    "OPENAI_EMBEDDING_MODEL",
                ],
                "embeddinggemma",
            ),
        ),
        _ => (
            resolve_config_value(repo_env, &["AI_BASE_URL", "OPENAI_BASE_URL"], ""),
            resolve_config_value(repo_env, &["AI_API_KEY", "OPENAI_API_KEY"], ""),
            resolve_config_value(repo_env, &["AI_CHAT_MODEL", "OPENAI_MODEL"], "gpt-4o-mini"),
            resolve_config_value(
                repo_env,
                &["AI_EMBEDDING_MODEL", "OPENAI_EMBEDDING_MODEL"],
                "text-embedding-3-small",
            ),
        ),
    };

    let port = if include_port {
        parse_port(&resolve_config_value(repo_env, &["PORT"], "3000"))
    } else {
        3000
    };

    RepoAiConfig {
        has_dot_env: repo_env.exists,
        profile,
        provider,
        base_url: base_url.trim_end_matches('/').to_string(),
        api_key,
        chat_model,
        embedding_model,
        port,
        app_url: format!("http://127.0.0.1:{port}/"),
    }
}

fn resolve_config_value(repo_env: &crate::env::RepoEnv, keys: &[&str], default: &str) -> String {
    for key in keys {
        if let Ok(value) = std::env::var(key) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }

        if let Some(value) = repo_env.values.get(*key) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }

    default.to_string()
}

fn has_any_config_value(repo_env: &crate::env::RepoEnv, keys: &[&str]) -> bool {
    keys.iter().any(|key| {
        std::env::var(key)
            .ok()
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false)
            || repo_env
                .values
                .get(*key)
                .map(|value| !value.trim().is_empty())
                .unwrap_or(false)
    })
}

fn parse_port(value: &str) -> u16 {
    value
        .trim()
        .parse::<u16>()
        .ok()
        .filter(|port| *port > 0)
        .unwrap_or(3000)
}

pub fn resolve_workspace_root() -> Result<PathBuf, SunrayError> {
    let mut search_roots = Vec::new();
    if let Ok(current_dir) = std::env::current_dir() {
        search_roots.push(current_dir);
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            let exe_dir = exe_dir.to_path_buf();
            if !search_roots.contains(&exe_dir) {
                search_roots.push(exe_dir);
            }
        }
    }

    resolve_workspace_root_from_candidates(search_roots)
}

pub fn resolve_workspace_root_from(start_dir: &Path) -> Result<PathBuf, SunrayError> {
    resolve_workspace_root_from_candidates([start_dir.to_path_buf()])
}

fn resolve_workspace_root_from_candidates<I>(start_dirs: I) -> Result<PathBuf, SunrayError>
where
    I: IntoIterator<Item = PathBuf>,
{
    let mut attempted = Vec::new();

    for start_dir in start_dirs {
        attempted.push(start_dir.clone());
        for candidate in start_dir.ancestors() {
            if is_workspace_root(candidate) {
                return Ok(candidate.to_path_buf());
            }
        }
    }

    Err(SunrayError::WorkspaceRootNotFound {
        start_dirs: attempted,
    })
}

pub fn launcher_assets_dir(repo_root: &Path) -> PathBuf {
    repo_root.join("launcher").join("assets")
}

pub fn local_gpu_profile_matrix_path(repo_root: &Path) -> PathBuf {
    launcher_assets_dir(repo_root).join("local-gpu-profile-matrix.json")
}

fn is_workspace_root(candidate: &Path) -> bool {
    candidate.join("package.json").exists()
        && candidate.join("BACKLOG.md").exists()
        && candidate.join("launcher").join("Cargo.toml").exists()
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;
    use std::path::Path;

    use crate::env::RepoEnv;

    use super::{
        command_contracts, local_gpu_profile_matrix_path, resolve_repo_ai_config,
        resolve_workspace_root_from,
    };

    #[test]
    fn command_contracts_keep_unique_names_and_scripts() {
        let contracts = command_contracts();
        let names = contracts
            .iter()
            .map(|contract| contract.name)
            .collect::<BTreeSet<_>>();
        let scripts = contracts
            .iter()
            .map(|contract| contract.legacy_script)
            .collect::<BTreeSet<_>>();

        assert_eq!(contracts.len(), names.len());
        assert_eq!(contracts.len(), scripts.len());
    }

    #[test]
    fn workspace_root_resolves_from_launcher_src() {
        let root = resolve_workspace_root_from(
            Path::new(env!("CARGO_MANIFEST_DIR")).join("src").as_path(),
        )
        .expect("workspace root should resolve from launcher/src");

        assert!(root.join("package.json").exists());
        assert!(root.join("BACKLOG.md").exists());
        assert!(local_gpu_profile_matrix_path(&root).ends_with(
            Path::new("launcher")
                .join("assets")
                .join("local-gpu-profile-matrix.json")
        ));
    }

    #[test]
    fn workspace_root_resolves_from_release_exe_directory_shape() {
        let root = resolve_workspace_root_from(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("target")
                .join("release")
                .as_path(),
        )
        .expect("workspace root should resolve from launcher/target/release");

        assert!(root.join("package.json").exists());
        assert!(root.join("BACKLOG.md").exists());
    }

    #[test]
    fn repo_ai_config_reads_dotenv_values_when_session_is_empty() {
        let repo_env = RepoEnv {
            path: ".env".into(),
            exists: true,
            values: [
                ("AI_PROFILE".to_string(), "local-gpu-large".to_string()),
                ("PORT".to_string(), "3105".to_string()),
            ]
            .into_iter()
            .collect(),
        };

        let config = resolve_repo_ai_config(&repo_env, true);
        assert_eq!(config.profile, "local-gpu-large");
        assert_eq!(config.port, 3105);
    }
}
