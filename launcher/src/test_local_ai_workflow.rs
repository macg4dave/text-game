use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::{anyhow, Result};
use clap::ValueEnum;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::config::{
    local_gpu_profile_matrix_path, resolve_repo_ai_config, resolve_workspace_root, RepoAiConfig,
};
use crate::env::load_repo_env;
use crate::process::render_command_preview;
use crate::start_dev::compose::docker_compose;
use crate::start_dev::probes::wait_for_http_ready;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TestLocalAiWorkflowOptions {
    pub selection_only: bool,
    pub persona: Option<TestPlayerPersonaChoice>,
    pub persona_seed: Option<u64>,
    pub report_json: Option<PathBuf>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
pub enum TestPlayerPersonaChoice {
    CuriousExplorer,
    CautiousSurvivor,
    EmpatheticTalker,
    PracticalFixer,
}

impl TestPlayerPersonaChoice {
    fn display_name(self) -> &'static str {
        match self {
            Self::CuriousExplorer => "curious explorer",
            Self::CautiousSurvivor => "cautious survivor",
            Self::EmpatheticTalker => "empathetic talker",
            Self::PracticalFixer => "practical fixer",
        }
    }

    fn guidance(self) -> &'static str {
        match self {
            Self::CuriousExplorer => "inspects odd details first",
            Self::CautiousSurvivor => "avoids risk unless pushed",
            Self::EmpatheticTalker => "prefers NPC dialogue before item use",
            Self::PracticalFixer => "uses tools and direct problem-solving",
        }
    }

    fn cli_name(self) -> &'static str {
        match self {
            Self::CuriousExplorer => "curious-explorer",
            Self::CautiousSurvivor => "cautious-survivor",
            Self::EmpatheticTalker => "empathetic-talker",
            Self::PracticalFixer => "practical-fixer",
        }
    }
}

const TEST_PLAYER_PERSONAS: [TestPlayerPersonaChoice; 4] = [
    TestPlayerPersonaChoice::CuriousExplorer,
    TestPlayerPersonaChoice::CautiousSurvivor,
    TestPlayerPersonaChoice::EmpatheticTalker,
    TestPlayerPersonaChoice::PracticalFixer,
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct TestPlayerPersonaSelection {
    persona: TestPlayerPersonaChoice,
    source: &'static str,
}

#[derive(Debug, Default)]
struct HarnessReport {
    failures: Vec<String>,
    scenarios: Vec<HarnessScenarioResult>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
struct HarnessScenarioResult {
    scenario_id: String,
    status: String,
    summary: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
struct HarnessManifest {
    command: String,
    selection_only: bool,
    status: String,
    summary: String,
    persona: Option<String>,
    persona_source: Option<String>,
    persona_seed: Option<u64>,
    scenarios: Vec<HarnessScenarioResult>,
}

impl HarnessReport {
    fn pass(&self, message: impl AsRef<str>) {
        println!("PASS: {}", message.as_ref());
    }

    fn fail(&mut self, message: impl Into<String>) {
        let message = message.into();
        println!("FAIL: {message}");
        self.failures.push(message);
    }

    fn assert_equal<T>(&mut self, name: &str, actual: T, expected: T)
    where
        T: PartialEq + std::fmt::Display,
    {
        if actual != expected {
            self.fail(format!("{name} expected '{expected}' but got '{actual}'."));
        } else {
            self.pass(format!("{name} matches {expected}."));
        }
    }

    fn assert_array_length_at_most(&mut self, name: &str, value: &[Value], max: usize) {
        if value.len() > max {
            self.fail(format!("{name} exceeds max length {max}."));
        } else {
            self.pass(format!("{name} length is within limit."));
        }
    }

    fn record_scenario(&mut self, scenario_id: &str, result: Result<()>) {
        match result {
            Ok(()) => {
                self.pass(format!("{scenario_id} passed."));
                self.scenarios.push(HarnessScenarioResult {
                    scenario_id: scenario_id.to_string(),
                    status: "passed".to_string(),
                    summary: "Scenario completed successfully.".to_string(),
                });
            }
            Err(error) => {
                let summary = error.to_string();
                self.fail(format!("{scenario_id} failed: {summary}"));
                self.scenarios.push(HarnessScenarioResult {
                    scenario_id: scenario_id.to_string(),
                    status: "failed".to_string(),
                    summary,
                });
            }
        }
    }

    fn build_manifest(
        &self,
        options: &TestLocalAiWorkflowOptions,
        persona_selection: Option<TestPlayerPersonaSelection>,
    ) -> HarnessManifest {
        let status = if self.failures.is_empty() {
            "passed"
        } else {
            "failed"
        };
        let summary = if self.failures.is_empty() {
            format!(
                "{} scenario(s) passed.",
                self.scenarios
                    .iter()
                    .filter(|scenario| scenario.status == "passed")
                    .count()
            )
        } else {
            self.failures.join(" | ")
        };

        HarnessManifest {
            command: command_preview(options),
            selection_only: options.selection_only,
            status: status.to_string(),
            summary,
            persona: persona_selection.map(|selection| selection.persona.cli_name().to_string()),
            persona_source: persona_selection.map(|selection| selection.source.to_string()),
            persona_seed: options.persona_seed,
            scenarios: self.scenarios.clone(),
        }
    }

    fn finish(
        self,
        options: &TestLocalAiWorkflowOptions,
        persona_selection: Option<TestPlayerPersonaSelection>,
    ) -> Result<()> {
        maybe_write_manifest(options, &self.build_manifest(options, persona_selection))?;

        if self.failures.is_empty() {
            println!();
            println!("Local AI workflow regression harness passed.");
            Ok(())
        } else {
            println!();
            println!("Local AI workflow regression harness failed.");
            for failure in &self.failures {
                println!(" - {failure}");
            }
            Err(anyhow!("Local AI workflow regression harness failed"))
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
struct LocalGpuProfileMatrix {
    profiles: Vec<LocalGpuProfile>,
}

#[derive(Debug, Clone, Deserialize)]
struct LocalGpuProfile {
    id: String,
    #[serde(rename = "minVramGb")]
    min_vram_gb: f64,
    #[serde(rename = "maxVramGb")]
    max_vram_gb: Option<f64>,
}

#[derive(Debug, Clone, PartialEq)]
struct LocalGpuSelectionResult {
    status: String,
    selection_source: String,
    profile_id: Option<String>,
}

pub fn run(options: TestLocalAiWorkflowOptions) -> Result<()> {
    let repo_root = resolve_workspace_root()?;
    let repo_env = load_repo_env(&repo_root)?;
    let config = resolve_repo_ai_config(&repo_env, false);
    let mut report = HarnessReport::default();

    println!("Running local AI workflow regression harness");
    println!("Provider: {}", config.provider);
    println!("Base URL: {}", config.base_url);
    println!("Chat model: {}", config.chat_model);
    println!("Embedding model: {}", config.embedding_model);

    let local_gpu_profile_selection = test_local_gpu_profile_selection(&repo_root, &mut report);
    report.record_scenario("local-gpu-profile-selection", local_gpu_profile_selection);
    let turn_schema_guardrails = test_turn_schema_guardrails(&repo_root, &mut report);
    report.record_scenario("turn-schema-guardrails", turn_schema_guardrails);

    let persona_selection = resolve_test_player_persona_selection(&options)?;

    if options.selection_only {
        return report.finish(&options, None);
    }

    println!(
        "Test-player persona: {} ({}) via {}.",
        persona_selection.persona.display_name(),
        persona_selection.persona.guidance(),
        persona_selection.source,
    );

    if config.base_url.trim().is_empty() {
        report.fail("This harness needs a reachable AI base URL from the current provider config.");
        return report.finish(&options, Some(persona_selection));
    }

    let probe_url = readiness_probe_url(&config);
    if !wait_for_http_ready(&probe_url, Duration::from_secs(5), None)? {
        report.fail(format!(
            "Configured AI base URL did not respond before tests started: {probe_url}"
        ));
        return report.finish(&options, Some(persona_selection));
    }

    let client = Client::builder().timeout(Duration::from_secs(30)).build()?;

    let embeddings_endpoint = test_embeddings(&client, &config, &mut report);
    report.record_scenario("embeddings-endpoint", embeddings_endpoint);
    let scene_schema = test_scene_schema(&client, &config, &mut report);
    report.record_scenario("scene-schema", scene_schema);
    let game_turn_schema =
        test_game_turn_schema(&client, &config, persona_selection.persona, &mut report);
    report.record_scenario("game-turn-schema", game_turn_schema);

    report.finish(&options, Some(persona_selection))
}

fn command_preview(options: &TestLocalAiWorkflowOptions) -> String {
    let mut args = vec!["test-local-ai-workflow".to_string()];
    if options.selection_only {
        args.push("--selection-only".to_string());
    }
    if let Some(persona) = options.persona {
        args.push("--persona".to_string());
        args.push(persona.cli_name().to_string());
    }
    if let Some(seed) = options.persona_seed {
        args.push("--persona-seed".to_string());
        args.push(seed.to_string());
    }
    if let Some(path) = &options.report_json {
        args.push("--report-json".to_string());
        args.push(path.display().to_string());
    }

    render_command_preview("SunRay", &args)
}

fn maybe_write_manifest(options: &TestLocalAiWorkflowOptions, manifest: &HarnessManifest) -> Result<()> {
    let Some(path) = &options.report_json else {
        return Ok(());
    };

    if let Some(parent) = path.parent().filter(|parent| !parent.as_os_str().is_empty()) {
        fs::create_dir_all(parent)?;
    }

    fs::write(path, serde_json::to_string_pretty(manifest)?)?;
    println!("Wrote AI validation report: {}", path.display());
    Ok(())
}

fn test_local_gpu_profile_selection(repo_root: &Path, report: &mut HarnessReport) -> Result<()> {
    let matrix_path = local_gpu_profile_matrix_path(repo_root);
    let matrix = load_local_gpu_profile_matrix(&matrix_path)?;

    let auto_small =
        resolve_local_gpu_profile_selection(&matrix, "local-gpu-small", None, None, Some(10.0));
    report.assert_equal("autoSmall.status", auto_small.status.as_str(), "selected");
    report.assert_equal(
        "autoSmall.profileId",
        auto_small.profile_id.as_deref().unwrap_or(""),
        "local-gpu-8gb",
    );
    report.assert_equal(
        "autoSmall.selectionSource",
        auto_small.selection_source.as_str(),
        "detected-vram",
    );

    let auto_large =
        resolve_local_gpu_profile_selection(&matrix, "local-gpu-large", None, None, Some(12.0));
    report.assert_equal("autoLarge.status", auto_large.status.as_str(), "selected");
    report.assert_equal(
        "autoLarge.profileId",
        auto_large.profile_id.as_deref().unwrap_or(""),
        "local-gpu-12gb",
    );
    report.assert_equal(
        "autoLarge.selectionSource",
        auto_large.selection_source.as_str(),
        "detected-vram",
    );

    let manual_profile = resolve_local_gpu_profile_selection(
        &matrix,
        "local-gpu-small",
        Some("local-gpu-20gb-plus"),
        None,
        Some(8.0),
    );
    report.assert_equal(
        "manualProfile.status",
        manual_profile.status.as_str(),
        "selected",
    );
    report.assert_equal(
        "manualProfile.profileId",
        manual_profile.profile_id.as_deref().unwrap_or(""),
        "local-gpu-20gb-plus",
    );
    report.assert_equal(
        "manualProfile.selectionSource",
        manual_profile.selection_source.as_str(),
        "manual-profile",
    );

    let manual_vram =
        resolve_local_gpu_profile_selection(&matrix, "local-gpu-small", None, Some(21.0), None);
    report.assert_equal("manualVram.status", manual_vram.status.as_str(), "selected");
    report.assert_equal(
        "manualVram.profileId",
        manual_vram.profile_id.as_deref().unwrap_or(""),
        "local-gpu-20gb-plus",
    );
    report.assert_equal(
        "manualVram.selectionSource",
        manual_vram.selection_source.as_str(),
        "manual-vram",
    );

    let unsupported =
        resolve_local_gpu_profile_selection(&matrix, "local-gpu-small", None, None, Some(6.0));
    report.assert_equal(
        "unsupported.status",
        unsupported.status.as_str(),
        "manual-selection-required",
    );
    report.assert_equal(
        "unsupported.selectionSource",
        unsupported.selection_source.as_str(),
        "unsupported-vram",
    );
    report.assert_equal(
        "unsupported.profileId",
        unsupported.profile_id.as_deref().unwrap_or(""),
        "",
    );

    let unknown = resolve_local_gpu_profile_selection(&matrix, "local-gpu-large", None, None, None);
    report.assert_equal(
        "unknown.status",
        unknown.status.as_str(),
        "manual-selection-required",
    );
    report.assert_equal(
        "unknown.selectionSource",
        unknown.selection_source.as_str(),
        "detection-unavailable",
    );
    report.assert_equal(
        "unknown.profileId",
        unknown.profile_id.as_deref().unwrap_or(""),
        "",
    );

    Ok(())
}

fn test_turn_schema_guardrails(repo_root: &Path, report: &mut HarnessReport) -> Result<()> {
    docker_compose(repo_root)
        .with_args([
            "run",
            "--rm",
            "--no-deps",
            "app",
            "npx",
            "tsx",
            "--test",
            "src/state/turn.test.ts",
        ])
        .in_dir(repo_root)
        .capture_checked()?;

    report.pass("Turn schema guardrail check passed.");
    Ok(())
}

fn test_embeddings(
    client: &Client,
    config: &RepoAiConfig,
    report: &mut HarnessReport,
) -> Result<()> {
    let response = invoke_api_json(
        client,
        &format!("{}/embeddings", config.base_url),
        json!({
            "model": config.embedding_model,
            "input": "lantern market rooftop at dusk",
            "encoding_format": "float"
        }),
        &config.api_key,
    )?;

    let length = response
        .get("data")
        .and_then(Value::as_array)
        .and_then(|data| data.first())
        .and_then(|entry| entry.get("embedding"))
        .and_then(Value::as_array)
        .map(Vec::len)
        .unwrap_or(0);

    if length == 0 {
        return Err(anyhow!(
            "Embeddings response did not include an embedding vector."
        ));
    }

    report.pass(format!(
        "Embeddings endpoint returned a vector of length {length}."
    ));
    Ok(())
}

fn test_scene_schema(
    client: &Client,
    config: &RepoAiConfig,
    report: &mut HarnessReport,
) -> Result<()> {
    let response = invoke_api_json(
        client,
        &format!("{}/chat/completions", config.base_url),
        json!({
            "model": config.chat_model,
            "temperature": 0,
            "messages": [
                {"role": "system", "content": "Return only valid JSON that matches the schema."},
                {"role": "user", "content": "Describe a torch-lit alley in one sentence."}
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "scene",
                    "strict": true,
                    "schema": {
                        "type": "object",
                        "additionalProperties": false,
                        "properties": {
                            "narrative": {"type": "string"}
                        },
                        "required": ["narrative"]
                    }
                }
            }
        }),
        &config.api_key,
    )?;

    let content = extract_message_content(&response)?;
    let parsed: Value = serde_json::from_str(&content)?;
    if parsed
        .get("narrative")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default()
        .is_empty()
    {
        return Err(anyhow!("Scene schema response did not include narrative."));
    }

    report.pass("Structured scene response parsed successfully.");
    Ok(())
}

fn test_game_turn_schema(
    client: &Client,
    config: &RepoAiConfig,
    persona: TestPlayerPersonaChoice,
    report: &mut HarnessReport,
) -> Result<()> {
    let state_pack_json = r#"{"player":{"id":"test-player","name":"Wanderer","location":"Rooftop Market","inventory":[],"flags":[],"quests":[]},"summary":"","director":{"end_goal_progress":"Just beginning."},"director_spec":{"end_goal":"Recover the moon shard.","current_beat":{"id":"beat_1","label":"Hear the rumor"},"rules":["Keep the story moving."]},"quest_spec":{"quests":[]}}"#;
    let prompt = format!(
        "TEST_PLAYER_PERSONA\nname: {}\nguidance: {}\n\nSTATE_PACK\n{state_pack_json}\n\nSHORT_HISTORY\nPLAYER: look around\n\nMEMORIES\n\nPLAYER_INPUT\nlook around",
        persona.display_name(),
        persona.guidance(),
    );

    let response = invoke_api_json(
        client,
        &format!("{}/chat/completions", config.base_url),
        json!({
            "model": config.chat_model,
            "temperature": 0.2,
            "messages": [
                {"role": "system", "content": "You are the Narrative Engine for a text-based adventure game. Return structured JSON only."},
                {"role": "user", "content": prompt}
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "game_turn",
                    "strict": true,
                    "schema": {
                        "type": "object",
                        "additionalProperties": false,
                        "properties": {
                            "narrative": {"type": "string"},
                            "player_options": {
                                "type": "array",
                                "items": {"type": "string"},
                                "minItems": 0,
                                "maxItems": 6
                            },
                            "state_updates": {
                                "type": "object",
                                "additionalProperties": false,
                                "properties": {
                                    "location": {"type": "string"},
                                    "inventory_add": {"type": "array", "items": {"type": "string"}},
                                    "inventory_remove": {"type": "array", "items": {"type": "string"}},
                                    "flags_add": {"type": "array", "items": {"type": "string"}},
                                    "flags_remove": {"type": "array", "items": {"type": "string"}},
                                    "quests": {
                                        "type": "array",
                                        "items": {
                                            "type": "object",
                                            "additionalProperties": false,
                                            "properties": {
                                                "id": {"type": "string"},
                                                "status": {"type": "string"},
                                                "summary": {"type": "string"}
                                            },
                                            "required": ["id", "status", "summary"]
                                        }
                                    }
                                },
                                "required": ["location", "inventory_add", "inventory_remove", "flags_add", "flags_remove", "quests"]
                            },
                            "director_updates": {
                                "type": "object",
                                "additionalProperties": false,
                                "properties": {
                                    "end_goal_progress": {"type": "string"}
                                },
                                "required": ["end_goal_progress"]
                            },
                            "memory_updates": {
                                "type": "array",
                                "items": {"type": "string"},
                                "minItems": 0,
                                "maxItems": 8
                            }
                        },
                        "required": ["narrative", "player_options", "state_updates", "director_updates", "memory_updates"]
                    }
                }
            }
        }),
        &config.api_key,
    )?;

    let content = extract_message_content(&response)?;
    let parsed: Value = serde_json::from_str(&content)?;

    if parsed
        .get("narrative")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default()
        .is_empty()
    {
        return Err(anyhow!("Game turn response did not include narrative."));
    }

    if parsed
        .get("state_updates")
        .and_then(|value| value.get("location"))
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default()
        .is_empty()
    {
        return Err(anyhow!(
            "Game turn response did not include state_updates.location."
        ));
    }

    if parsed
        .get("director_updates")
        .and_then(|value| value.get("end_goal_progress"))
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default()
        .is_empty()
    {
        return Err(anyhow!(
            "Game turn response did not include director_updates.end_goal_progress."
        ));
    }

    let player_options = parsed
        .get("player_options")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    report.assert_array_length_at_most("player_options", &player_options, 6);

    let memory_updates = parsed
        .get("memory_updates")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    report.assert_array_length_at_most("memory_updates", &memory_updates, 8);
    report.pass("Full game_turn response parsed successfully.");

    Ok(())
}

fn resolve_test_player_persona_selection(
    options: &TestLocalAiWorkflowOptions,
) -> Result<TestPlayerPersonaSelection> {
    if let Some(persona) = options.persona {
        return Ok(TestPlayerPersonaSelection {
            persona,
            source: "explicit persona override",
        });
    }

    if let Some(seed) = options.persona_seed {
        return Ok(TestPlayerPersonaSelection {
            persona: select_test_player_persona_from_seed(seed as u128),
            source: "seeded selection",
        });
    }

    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| anyhow!("System clock is before UNIX epoch: {error}"))?
        .as_nanos();

    Ok(TestPlayerPersonaSelection {
        persona: select_test_player_persona_from_seed(seed),
        source: "runtime selection",
    })
}

fn select_test_player_persona_from_seed(seed: u128) -> TestPlayerPersonaChoice {
    let index = (seed % TEST_PLAYER_PERSONAS.len() as u128) as usize;
    TEST_PLAYER_PERSONAS[index]
}

fn invoke_api_json(client: &Client, uri: &str, body: Value, api_key: &str) -> Result<Value> {
    let response = client.post(uri).bearer_auth(api_key).json(&body).send()?;
    let status = response.status();
    let payload = response.text()?;
    if !status.is_success() {
        return Err(anyhow!("{status}: {payload}"));
    }

    Ok(serde_json::from_str(&payload)?)
}

fn extract_message_content(response: &Value) -> Result<String> {
    response
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .ok_or_else(|| anyhow!("Chat completion response did not include message content."))
}

fn readiness_probe_url(config: &RepoAiConfig) -> String {
    if config.provider == "ollama" {
        "http://127.0.0.1:11434/api/version".to_string()
    } else {
        config.base_url.clone()
    }
}

fn load_local_gpu_profile_matrix(path: &Path) -> Result<LocalGpuProfileMatrix> {
    Ok(serde_json::from_str(&fs::read_to_string(path)?)?)
}

fn resolve_local_gpu_profile_selection(
    matrix: &LocalGpuProfileMatrix,
    _requested_profile: &str,
    manual_profile_id: Option<&str>,
    manual_vram_gb: Option<f64>,
    detected_vram_gb: Option<f64>,
) -> LocalGpuSelectionResult {
    if let Some(profile_id) = manual_profile_id.filter(|value| !value.trim().is_empty()) {
        if let Some(profile) = matrix
            .profiles
            .iter()
            .find(|profile| profile.id == profile_id)
        {
            return LocalGpuSelectionResult {
                status: "selected".to_string(),
                selection_source: "manual-profile".to_string(),
                profile_id: Some(profile.id.clone()),
            };
        }

        return LocalGpuSelectionResult {
            status: "manual-selection-required".to_string(),
            selection_source: "invalid-manual-profile".to_string(),
            profile_id: None,
        };
    }

    if let Some(vram) = manual_vram_gb {
        if let Some(profile) = find_profile_for_vram(matrix, vram) {
            return LocalGpuSelectionResult {
                status: "selected".to_string(),
                selection_source: "manual-vram".to_string(),
                profile_id: Some(profile.id.clone()),
            };
        }

        return LocalGpuSelectionResult {
            status: "manual-selection-required".to_string(),
            selection_source: "unsupported-vram".to_string(),
            profile_id: None,
        };
    }

    if let Some(vram) = detected_vram_gb {
        if let Some(profile) = find_profile_for_vram(matrix, vram) {
            return LocalGpuSelectionResult {
                status: "selected".to_string(),
                selection_source: "detected-vram".to_string(),
                profile_id: Some(profile.id.clone()),
            };
        }

        return LocalGpuSelectionResult {
            status: "manual-selection-required".to_string(),
            selection_source: "unsupported-vram".to_string(),
            profile_id: None,
        };
    }

    LocalGpuSelectionResult {
        status: "manual-selection-required".to_string(),
        selection_source: "detection-unavailable".to_string(),
        profile_id: None,
    }
}

fn find_profile_for_vram(matrix: &LocalGpuProfileMatrix, vram_gb: f64) -> Option<&LocalGpuProfile> {
    matrix.profiles.iter().find(|profile| {
        vram_gb >= profile.min_vram_gb
            && profile
                .max_vram_gb
                .map(|max| vram_gb <= max)
                .unwrap_or(true)
    })
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::{
        command_preview, find_profile_for_vram, resolve_local_gpu_profile_selection,
        resolve_test_player_persona_selection, select_test_player_persona_from_seed,
        HarnessManifest, HarnessReport, HarnessScenarioResult, LocalGpuProfile,
        LocalGpuProfileMatrix, TestLocalAiWorkflowOptions, TestPlayerPersonaChoice,
        TestPlayerPersonaSelection, TEST_PLAYER_PERSONAS,
    };

    fn sample_matrix() -> LocalGpuProfileMatrix {
        LocalGpuProfileMatrix {
            profiles: vec![
                LocalGpuProfile {
                    id: "local-gpu-8gb".to_string(),
                    min_vram_gb: 8.0,
                    max_vram_gb: Some(11.9),
                },
                LocalGpuProfile {
                    id: "local-gpu-12gb".to_string(),
                    min_vram_gb: 12.0,
                    max_vram_gb: Some(19.9),
                },
                LocalGpuProfile {
                    id: "local-gpu-20gb-plus".to_string(),
                    min_vram_gb: 20.0,
                    max_vram_gb: None,
                },
            ],
        }
    }

    #[test]
    fn detected_vram_selects_matching_profile() {
        let matrix = sample_matrix();
        let selection =
            resolve_local_gpu_profile_selection(&matrix, "local-gpu-small", None, None, Some(10.0));
        assert_eq!(selection.status, "selected");
        assert_eq!(selection.selection_source, "detected-vram");
        assert_eq!(selection.profile_id.as_deref(), Some("local-gpu-8gb"));
    }

    #[test]
    fn manual_profile_beats_detected_vram() {
        let matrix = sample_matrix();
        let selection = resolve_local_gpu_profile_selection(
            &matrix,
            "local-gpu-small",
            Some("local-gpu-20gb-plus"),
            None,
            Some(8.0),
        );
        assert_eq!(selection.selection_source, "manual-profile");
        assert_eq!(selection.profile_id.as_deref(), Some("local-gpu-20gb-plus"));
    }

    #[test]
    fn unsupported_detected_vram_requires_manual_selection() {
        let matrix = sample_matrix();
        let selection =
            resolve_local_gpu_profile_selection(&matrix, "local-gpu-small", None, None, Some(6.0));
        assert_eq!(selection.status, "manual-selection-required");
        assert_eq!(selection.selection_source, "unsupported-vram");
        assert_eq!(selection.profile_id, None);
    }

    #[test]
    fn find_profile_for_vram_supports_open_ended_top_tier() {
        let matrix = sample_matrix();
        let profile = find_profile_for_vram(&matrix, 24.0).expect("top tier profile");
        assert_eq!(profile.id, "local-gpu-20gb-plus");
    }

    #[test]
    fn test_player_persona_seed_cycles_through_all_supported_personas() {
        let selected = (0_u128..TEST_PLAYER_PERSONAS.len() as u128)
            .map(select_test_player_persona_from_seed)
            .map(|persona| persona.display_name())
            .collect::<Vec<_>>();

        assert_eq!(
            selected,
            vec![
                "curious explorer",
                "cautious survivor",
                "empathetic talker",
                "practical fixer",
            ]
        );
    }

    #[test]
    fn explicit_persona_override_beats_seeded_selection() {
        let selection = resolve_test_player_persona_selection(&TestLocalAiWorkflowOptions {
            selection_only: false,
            persona: Some(TestPlayerPersonaChoice::PracticalFixer),
            persona_seed: Some(0),
            report_json: None,
        })
        .expect("persona selection");

        assert_eq!(selection.persona, TestPlayerPersonaChoice::PracticalFixer);
        assert_eq!(selection.source, "explicit persona override");
    }

    #[test]
    fn seeded_persona_selection_is_repeatable() {
        let selection = resolve_test_player_persona_selection(&TestLocalAiWorkflowOptions {
            selection_only: false,
            persona: None,
            persona_seed: Some(2),
            report_json: None,
        })
        .expect("persona selection");

        assert_eq!(selection.persona, TestPlayerPersonaChoice::EmpatheticTalker);
        assert_eq!(selection.source, "seeded selection");
    }

    #[test]
    fn command_preview_includes_manifest_and_persona_flags() {
        let preview = command_preview(&TestLocalAiWorkflowOptions {
            selection_only: true,
            persona: Some(TestPlayerPersonaChoice::PracticalFixer),
            persona_seed: Some(7),
            report_json: Some(PathBuf::from("reports/ai-manifest.json")),
        });

        assert_eq!(
            preview,
            "SunRay test-local-ai-workflow --selection-only --persona practical-fixer --persona-seed 7 --report-json reports/ai-manifest.json"
        );
    }

    #[test]
    fn manifest_records_command_persona_and_scenarios() {
        let report = HarnessReport {
            failures: Vec::new(),
            scenarios: vec![HarnessScenarioResult {
                scenario_id: "turn-schema-guardrails".to_string(),
                status: "passed".to_string(),
                summary: "Scenario completed successfully.".to_string(),
            }],
        };

        let manifest = report.build_manifest(
            &TestLocalAiWorkflowOptions {
                selection_only: false,
                persona: Some(TestPlayerPersonaChoice::EmpatheticTalker),
                persona_seed: Some(11),
                report_json: Some(PathBuf::from("reports/live.json")),
            },
            Some(TestPlayerPersonaSelection {
                persona: TestPlayerPersonaChoice::EmpatheticTalker,
                source: "explicit persona override",
            }),
        );

        assert_eq!(
            manifest,
            HarnessManifest {
                command: "SunRay test-local-ai-workflow --persona empathetic-talker --persona-seed 11 --report-json reports/live.json".to_string(),
                selection_only: false,
                status: "passed".to_string(),
                summary: "1 scenario(s) passed.".to_string(),
                persona: Some("empathetic-talker".to_string()),
                persona_source: Some("explicit persona override".to_string()),
                persona_seed: Some(11),
                scenarios: vec![HarnessScenarioResult {
                    scenario_id: "turn-schema-guardrails".to_string(),
                    status: "passed".to_string(),
                    summary: "Scenario completed successfully.".to_string(),
                }],
            }
        );
    }
}
