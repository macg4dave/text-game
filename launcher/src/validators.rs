use std::collections::{BTreeMap, BTreeSet};
use std::fs;

use anyhow::{anyhow, Result};
use serde::Deserialize;

use crate::config::{local_gpu_profile_matrix_path, resolve_workspace_root};

#[derive(Debug, Default)]
struct ValidationReport {
    failures: Vec<String>,
}

impl ValidationReport {
    fn pass(&self, message: impl AsRef<str>) {
        println!("PASS: {}", message.as_ref());
    }

    fn fail(&mut self, message: impl Into<String>) {
        let message = message.into();
        println!("FAIL: {message}");
        self.failures.push(message);
    }

    fn require_string(&mut self, name: &str, value: Option<&str>) -> bool {
        if value
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .is_some()
        {
            true
        } else {
            self.fail(format!("{name} must be a non-empty string."));
            false
        }
    }

    fn finish(self, success_message: &str, failure_message: &str) -> Result<()> {
        if self.failures.is_empty() {
            println!();
            println!("{success_message}");
            Ok(())
        } else {
            println!();
            println!("{failure_message}");
            Err(anyhow!(failure_message.to_string()))
        }
    }
}

#[derive(Debug, Deserialize)]
struct LocalGpuProfileMatrix {
    version: i64,
    #[serde(rename = "defaultProfileId")]
    default_profile_id: Option<String>,
    profiles: Vec<LocalGpuProfile>,
}

#[derive(Debug, Deserialize)]
struct LocalGpuProfile {
    id: Option<String>,
    #[serde(rename = "displayName")]
    display_name: Option<String>,
    #[serde(rename = "minVramGb")]
    min_vram_gb: Option<f64>,
    #[serde(rename = "maxVramGb")]
    max_vram_gb: Option<f64>,
    #[serde(rename = "recommendedChatModel")]
    recommended_chat_model: Option<String>,
    #[serde(rename = "recommendedEmbeddingRoute")]
    recommended_embedding_route: Option<EmbeddingRoute>,
    #[serde(rename = "ollamaPullModels")]
    ollama_pull_models: Option<Vec<String>>,
    #[serde(rename = "fallbackProfileId")]
    fallback_profile_id: Option<String>,
    #[serde(rename = "skuExamples")]
    sku_examples: Option<Vec<String>>,
    #[serde(rename = "verificationStatus")]
    verification_status: Option<String>,
    notes: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct EmbeddingRoute {
    mode: Option<String>,
    model: Option<String>,
    #[serde(rename = "aliasTarget")]
    alias_target: Option<String>,
}

pub fn run_validate_local_gpu_profile_matrix() -> Result<()> {
    let repo_root = resolve_workspace_root()?;
    let matrix_path = local_gpu_profile_matrix_path(&repo_root);
    let litellm_config_path = repo_root.join("litellm.local-gpu.config.yaml");
    let docker_compose_path = repo_root.join("docker-compose.yml");

    let matrix: LocalGpuProfileMatrix = serde_json::from_str(&fs::read_to_string(&matrix_path)?)?;
    let litellm_config_text = fs::read_to_string(&litellm_config_path)?;
    let docker_compose_text = fs::read_to_string(&docker_compose_path)?;
    let mut report = ValidationReport::default();

    if matrix.version != 1 {
        report.fail("version must be 1.");
    } else {
        report.pass("Matrix version is 1.");
    }

    let default_profile_id =
        if report.require_string("defaultProfileId", matrix.default_profile_id.as_deref()) {
            matrix.default_profile_id.as_deref()
        } else {
            None
        };

    if matrix.profiles.is_empty() {
        report.fail("profiles must contain at least one profile.");
    }

    let mut ids = BTreeSet::new();
    let mut min_vrams = Vec::new();
    let mut profile_ids = BTreeSet::new();

    for (index, profile) in matrix.profiles.iter().enumerate() {
        let path_prefix = format!("profiles[{index}]");
        let id_ok = report.require_string(&format!("{path_prefix}.id"), profile.id.as_deref());
        report.require_string(
            &format!("{path_prefix}.displayName"),
            profile.display_name.as_deref(),
        );
        report.require_string(
            &format!("{path_prefix}.recommendedChatModel"),
            profile.recommended_chat_model.as_deref(),
        );
        let status_ok = report.require_string(
            &format!("{path_prefix}.verificationStatus"),
            profile.verification_status.as_deref(),
        );

        if id_ok {
            let id = profile.id.as_deref().unwrap();
            if !ids.insert(id.to_string()) {
                report.fail(format!("Duplicate profile id found: {id}"));
            } else {
                profile_ids.insert(id.to_string());
            }
        }

        if status_ok {
            match profile.verification_status.as_deref().unwrap() {
                "verified" | "heuristic" => {}
                _ => report.fail(format!(
                    "{path_prefix}.verificationStatus must be verified or heuristic."
                )),
            }
        }

        match profile.min_vram_gb {
            Some(min) => min_vrams.push(min),
            None => report.fail(format!("{path_prefix}.minVramGb must not be null.")),
        }

        if let (Some(min), Some(max)) = (profile.min_vram_gb, profile.max_vram_gb) {
            if min > max {
                report.fail(format!(
                    "{path_prefix}.maxVramGb must be greater than or equal to minVramGb."
                ));
            }
        }

        match &profile.recommended_embedding_route {
            Some(route) => {
                let mode_ok = report.require_string(
                    &format!("{path_prefix}.recommendedEmbeddingRoute.mode"),
                    route.mode.as_deref(),
                );
                if mode_ok {
                    match route.mode.as_deref().unwrap() {
                        "hosted" | "local" => {}
                        _ => report.fail(format!(
                            "{path_prefix}.recommendedEmbeddingRoute.mode must be hosted or local."
                        )),
                    }
                }
                report.require_string(
                    &format!("{path_prefix}.recommendedEmbeddingRoute.model"),
                    route.model.as_deref(),
                );
                report.require_string(
                    &format!("{path_prefix}.recommendedEmbeddingRoute.aliasTarget"),
                    route.alias_target.as_deref(),
                );
            }
            None => report.fail(format!(
                "{path_prefix}.recommendedEmbeddingRoute must be an object."
            )),
        }

        if profile
            .ollama_pull_models
            .as_ref()
            .map(|values| !values.is_empty())
            .unwrap_or(false)
        {
        } else {
            report.fail(format!(
                "{path_prefix}.ollamaPullModels must be a non-empty array."
            ));
        }

        if profile
            .sku_examples
            .as_ref()
            .map(|values| !values.is_empty())
            .unwrap_or(false)
        {
        } else {
            report.fail(format!(
                "{path_prefix}.skuExamples must be a non-empty array."
            ));
        }

        if profile
            .notes
            .as_ref()
            .map(|values| !values.is_empty())
            .unwrap_or(false)
        {
        } else {
            report.fail(format!("{path_prefix}.notes must be a non-empty array."));
        }
    }

    for index in 1..min_vrams.len() {
        if min_vrams[index] <= min_vrams[index - 1] {
            report.fail("profiles must be ordered by ascending minVramGb.");
            break;
        }
    }

    if !matrix.profiles.is_empty() {
        for profile in matrix
            .profiles
            .iter()
            .take(matrix.profiles.len().saturating_sub(1))
        {
            if profile.max_vram_gb.is_none() {
                report.fail("Only the last profile may use a null maxVramGb.");
                break;
            }
        }

        if matrix
            .profiles
            .last()
            .and_then(|profile| profile.max_vram_gb)
            .is_some()
        {
            report.fail("The last profile must use a null maxVramGb for the open-ended top tier.");
        }
    }

    if let Some(default_profile_id) = default_profile_id {
        if profile_ids.contains(default_profile_id) {
            report.pass("defaultProfileId resolves to an existing profile.");
        } else {
            report.fail("defaultProfileId does not match any profile id.");
        }
    }

    for profile in &matrix.profiles {
        if let Some(fallback_profile_id) = profile.fallback_profile_id.as_deref() {
            if fallback_profile_id.trim().is_empty() {
                report.fail("fallbackProfileId must be null or a non-empty string.");
            } else if !profile_ids.contains(fallback_profile_id) {
                report.fail(format!(
                    "fallbackProfileId '{}' for profile '{}' does not exist.",
                    fallback_profile_id,
                    profile.id.as_deref().unwrap_or("<unknown>")
                ));
            }
        }
    }

    let active_profile_id = find_comment_value(&litellm_config_text, "active_profile_id");
    match active_profile_id {
        Some(active_profile_id) => {
            if let Some(default_profile_id) = default_profile_id {
                if active_profile_id == default_profile_id {
                    report.pass(format!(
                        "LiteLLM config active profile matches defaultProfileId: {active_profile_id}"
                    ));
                } else {
                    report.fail(format!(
                        "Active LiteLLM profile '{}' does not match defaultProfileId '{}'.",
                        active_profile_id, default_profile_id
                    ));
                }
            }
        }
        None => report.fail(
            "litellm.local-gpu.config.yaml must declare '# active_profile_id: <profile-id>'.",
        ),
    }

    if let Some(default_profile_id) = default_profile_id {
        if let Some(default_profile) = matrix
            .profiles
            .iter()
            .find(|profile| profile.id.as_deref() == Some(default_profile_id))
        {
            expect_litellm_alias_target(
                &mut report,
                &litellm_config_text,
                "game-chat",
                &[
                    "model: os.environ/LITELLM_LOCAL_GPU_CHAT_TARGET",
                    "api_base: os.environ/LITELLM_LOCAL_GPU_CHAT_API_BASE",
                ],
            );
            expect_litellm_alias_target(
                &mut report,
                &litellm_config_text,
                "game-embedding",
                &[
                    "model: os.environ/LITELLM_LOCAL_GPU_EMBEDDING_TARGET",
                    "api_key: os.environ/LITELLM_LOCAL_GPU_EMBEDDING_API_KEY",
                    "api_base: os.environ/LITELLM_LOCAL_GPU_EMBEDDING_API_BASE",
                ],
            );

            let mut expected_defaults = BTreeMap::from([
                (
                    "LITELLM_LOCAL_GPU_PROFILE_ID".to_string(),
                    default_profile_id.to_string(),
                ),
                (
                    "LITELLM_LOCAL_GPU_CHAT_TARGET".to_string(),
                    format!(
                        "ollama_chat/{}",
                        default_profile
                            .recommended_chat_model
                            .as_deref()
                            .unwrap_or_default()
                    ),
                ),
                (
                    "LITELLM_LOCAL_GPU_CHAT_API_BASE".to_string(),
                    "http://ollama:11434".to_string(),
                ),
            ]);

            let route = default_profile
                .recommended_embedding_route
                .as_ref()
                .unwrap();
            if route.mode.as_deref() == Some("hosted") {
                expected_defaults.insert(
                    "LITELLM_LOCAL_GPU_EMBEDDING_TARGET".to_string(),
                    format!("openai/{}", route.model.as_deref().unwrap_or_default()),
                );
                expected_defaults.insert(
                    "LITELLM_LOCAL_GPU_EMBEDDING_API_KEY".to_string(),
                    "sk-placeholder".to_string(),
                );
                expected_defaults.insert(
                    "LITELLM_LOCAL_GPU_EMBEDDING_API_BASE".to_string(),
                    "".to_string(),
                );
            } else {
                expected_defaults.insert(
                    "LITELLM_LOCAL_GPU_EMBEDDING_TARGET".to_string(),
                    format!(
                        "ollama_embeddings/{}",
                        route.model.as_deref().unwrap_or_default()
                    ),
                );
                expected_defaults.insert(
                    "LITELLM_LOCAL_GPU_EMBEDDING_API_KEY".to_string(),
                    "".to_string(),
                );
                expected_defaults.insert(
                    "LITELLM_LOCAL_GPU_EMBEDDING_API_BASE".to_string(),
                    "http://ollama:11434".to_string(),
                );
            }

            for (variable_name, expected_value) in expected_defaults {
                match get_compose_env_default(&docker_compose_text, &variable_name) {
                    Some(actual_value) if actual_value == expected_value => report.pass(format!(
                        "docker-compose.yml default for {} matches the active default profile.",
                        variable_name
                    )),
                    Some(actual_value) => report.fail(format!(
                        "docker-compose.yml default for {} must be '{}' but was '{}'.",
                        variable_name, expected_value, actual_value
                    )),
                    None => report.fail(format!(
                        "docker-compose.yml is missing a default env value for {}.",
                        variable_name
                    )),
                }
            }
        }
    }

    for profile in &matrix.profiles {
        if let Some(id) = profile.id.as_deref() {
            let marker = format!("# profile_id: {id}");
            if litellm_config_text.contains(&marker) {
                report.pass(format!("LiteLLM config keeps marker '{}'.", marker));
            } else {
                report.fail(format!(
                    "litellm.local-gpu.config.yaml is missing the marker '{}'.",
                    marker
                ));
            }
        }
    }

    report.finish(
        "Local GPU profile matrix validation passed.",
        "Local GPU profile matrix validation failed.",
    )
}

pub fn run_validate_litellm_default_config() -> Result<()> {
    let repo_root = resolve_workspace_root()?;
    let config_text = fs::read_to_string(repo_root.join("litellm.config.yaml"))?;
    let mut report = ValidationReport::default();

    if config_text.contains("model: ollama_chat/gemma3:4b") {
        report.pass("Default chat alias routes to Docker Ollama gemma3:4b.");
    } else {
        report.fail("Default chat alias must route to ollama_chat/gemma3:4b.");
    }

    if config_text.contains("model: ollama/embeddinggemma") {
        report.pass("Default embedding alias routes to Docker Ollama embeddinggemma.");
    } else {
        report.fail("Default embedding alias must route to ollama/embeddinggemma.");
    }

    if config_text.contains("api_base: os.environ/OLLAMA_BASE_URL") {
        report.pass("Default LiteLLM config uses OLLAMA_BASE_URL for Ollama routing.");
    } else {
        report.fail("Default LiteLLM config must use api_base: os.environ/OLLAMA_BASE_URL.");
    }

    report.finish(
        "LiteLLM default config validation passed.",
        "LiteLLM default config validation failed.",
    )
}

fn find_comment_value(text: &str, key: &str) -> Option<String> {
    let prefix = format!("# {key}:");
    text.lines()
        .map(str::trim)
        .find_map(|line| {
            line.strip_prefix(&prefix)
                .map(|value| value.trim().to_string())
        })
        .filter(|value| !value.is_empty())
}

fn get_compose_env_default(text: &str, variable_name: &str) -> Option<String> {
    let prefix = format!("{variable_name}: \"${{{variable_name}:-");
    for line in text.lines().map(str::trim) {
        if let Some(rest) = line.strip_prefix(&prefix) {
            if let Some(value) = rest.strip_suffix("}\"") {
                return Some(value.to_string());
            }
        }
    }
    None
}

fn expect_litellm_alias_target(
    report: &mut ValidationReport,
    config_text: &str,
    model_name: &str,
    expected_lines: &[&str],
) {
    let block = find_model_block(config_text, model_name);
    match block {
        Some(block) => {
            for expected_line in expected_lines {
                if block.contains(expected_line) {
                    report.pass(format!(
                        "Active LiteLLM config {} alias uses '{}'.",
                        model_name, expected_line
                    ));
                } else {
                    report.fail(format!(
                        "Active LiteLLM config {} alias must include '{}'.",
                        model_name, expected_line
                    ));
                }
            }
        }
        None => report.fail(format!(
            "Active LiteLLM config must declare an uncommented {} alias block.",
            model_name
        )),
    }
}

fn find_model_block<'a>(text: &'a str, model_name: &str) -> Option<String> {
    let lines: Vec<&str> = text.lines().collect();
    let marker = format!("- model_name: {model_name}");
    for (index, line) in lines.iter().enumerate() {
        if line.trim() == marker {
            let mut block = vec![line.trim().to_string()];
            for next in lines.iter().skip(index + 1) {
                let trimmed = next.trim();
                if trimmed.starts_with("- model_name:") {
                    break;
                }
                if trimmed.is_empty() {
                    continue;
                }
                block.push(trimmed.to_string());
            }
            return Some(block.join("\n"));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::{find_comment_value, find_model_block, get_compose_env_default};

    #[test]
    fn compose_env_default_parser_reads_default_values() {
        let text = r#"
LITELLM_LOCAL_GPU_PROFILE_ID: "${LITELLM_LOCAL_GPU_PROFILE_ID:-local-gpu-8gb}"
LITELLM_LOCAL_GPU_EMBEDDING_API_BASE: "${LITELLM_LOCAL_GPU_EMBEDDING_API_BASE:-}"
"#;

        assert_eq!(
            get_compose_env_default(text, "LITELLM_LOCAL_GPU_PROFILE_ID").as_deref(),
            Some("local-gpu-8gb")
        );
        assert_eq!(
            get_compose_env_default(text, "LITELLM_LOCAL_GPU_EMBEDDING_API_BASE").as_deref(),
            Some("")
        );
    }

    #[test]
    fn comment_value_parser_reads_active_profile() {
        let text = "# active_profile_id: local-gpu-8gb\n";
        assert_eq!(
            find_comment_value(text, "active_profile_id").as_deref(),
            Some("local-gpu-8gb")
        );
    }

    #[test]
    fn model_block_parser_extracts_requested_alias() {
        let text = r#"
model_list:
  - model_name: game-chat
    litellm_params:
      model: os.environ/LITELLM_LOCAL_GPU_CHAT_TARGET

  - model_name: game-embedding
    litellm_params:
      model: os.environ/LITELLM_LOCAL_GPU_EMBEDDING_TARGET
"#;

        let block = find_model_block(text, "game-chat").expect("game-chat block");
        assert!(block.contains("model: os.environ/LITELLM_LOCAL_GPU_CHAT_TARGET"));
        assert!(!block.contains("game-embedding"));
    }
}
