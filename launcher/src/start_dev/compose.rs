use std::collections::BTreeMap;
use std::path::Path;

use crate::config::RepoAiConfig;
use crate::process::ProcessInvocation;

pub fn docker_compose(repo_root: &Path) -> ProcessInvocation {
    let compose_file = repo_root
        .join("docker-compose.yml")
        .to_string_lossy()
        .into_owned();
    let compose_gpu_file = repo_root
        .join("docker-compose.gpu.yml")
        .to_string_lossy()
        .into_owned();

    ProcessInvocation::new("docker")
        .with_args([
            "compose".to_string(),
            "-f".to_string(),
            compose_file,
            "-f".to_string(),
            compose_gpu_file,
        ])
        .in_dir(repo_root)
}

pub fn compose_env_overrides(config: &RepoAiConfig) -> BTreeMap<String, String> {
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

pub fn compose_env_with_port(
    base: &BTreeMap<String, String>,
    port: u16,
) -> BTreeMap<String, String> {
    let mut env = base.clone();
    env.insert("PORT".to_string(), port.to_string());
    env
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;
    use std::path::Path;

    use crate::config::RepoAiConfig;

    use super::{compose_env_overrides, compose_env_with_port, docker_compose};

    fn sample_config() -> RepoAiConfig {
        RepoAiConfig {
            has_dot_env: false,
            profile: "local-gpu-small".to_string(),
            provider: "litellm".to_string(),
            base_url: "http://127.0.0.1:4000".to_string(),
            api_key: "anything".to_string(),
            chat_model: "game-chat".to_string(),
            embedding_model: "game-embedding".to_string(),
            port: 3000,
            app_url: "http://127.0.0.1:3000/".to_string(),
        }
    }

    #[test]
    fn compose_env_includes_launcher_overrides() {
        let env = compose_env_overrides(&sample_config());
        assert_eq!(env.get("COMPOSE_AI_PROVIDER"), Some(&"litellm".to_string()));
        assert_eq!(env.get("AI_PROFILE"), Some(&"local-gpu-small".to_string()));
    }

    #[test]
    fn port_override_is_added_to_compose_env() {
        let env = compose_env_with_port(&BTreeMap::new(), 3110);
        assert_eq!(env.get("PORT"), Some(&"3110".to_string()));
    }

    #[test]
    fn docker_compose_targets_both_supported_compose_files() {
        let repo_root = Path::new("repo-root");
        let invocation = docker_compose(repo_root);

        assert_eq!(
            invocation.args,
            vec![
                "compose".to_string(),
                "-f".to_string(),
                repo_root
                    .join("docker-compose.yml")
                    .to_string_lossy()
                    .into_owned(),
                "-f".to_string(),
                repo_root
                    .join("docker-compose.gpu.yml")
                    .to_string_lossy()
                    .into_owned(),
            ]
        );
    }
}
