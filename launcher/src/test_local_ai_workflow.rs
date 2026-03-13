use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::{anyhow, Result};
use clap::ValueEnum;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::config::{
    local_ai_walkthrough_matrix_path, local_gpu_profile_matrix_path, resolve_repo_ai_config,
    resolve_workspace_root, RepoAiConfig,
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

    fn record_scenario(&mut self, scenario_id: &str, result: Result<String>) {
        match result {
            Ok(summary) => {
                self.pass(format!("{scenario_id} passed."));
                self.scenarios.push(HarnessScenarioResult {
                    scenario_id: scenario_id.to_string(),
                    status: "passed".to_string(),
                    summary,
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

#[derive(Debug, Clone, Deserialize)]
struct LocalAiWalkthroughMatrix {
    fixture_id: String,
    history_window: usize,
    memory_window: usize,
    scenarios: Vec<LocalAiWalkthroughScenario>,
}

#[derive(Debug, Clone, Deserialize)]
struct LocalAiWalkthroughScenario {
    id: String,
    label: String,
    summary: String,
    start_turn: usize,
    turn_count: usize,
}

#[derive(Debug, Clone, Deserialize)]
struct StorySampleWalkthroughFixture {
    fixture_id: String,
    player: WalkthroughPlayerState,
    turns: Vec<WalkthroughFixtureTurn>,
}

#[derive(Debug, Clone, Deserialize)]
struct WalkthroughFixtureTurn {
    input: String,
    outcome_summary: String,
    committed: WalkthroughCommittedOutcome,
}

#[derive(Debug, Clone, Deserialize)]
struct WalkthroughCommittedOutcome {
    state_updates: WalkthroughCommittedStateUpdates,
    director_updates: WalkthroughCommittedDirectorUpdates,
    #[serde(default)]
    memory_updates: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct WalkthroughCommittedStateUpdates {
    location: String,
    #[serde(default)]
    inventory_add: Vec<String>,
    #[serde(default)]
    inventory_remove: Vec<String>,
    #[serde(default)]
    flags_add: Vec<String>,
    #[serde(default)]
    flags_remove: Vec<String>,
    #[serde(default)]
    quests: Vec<WalkthroughQuest>,
}

#[derive(Debug, Clone, Deserialize)]
struct WalkthroughCommittedDirectorUpdates {
    end_goal_progress: String,
}

#[derive(Debug, Clone, Deserialize)]
struct WalkthroughPlayerState {
    id: String,
    name: String,
    location: String,
    summary: String,
    #[serde(default)]
    inventory: Vec<String>,
    #[serde(default)]
    flags: Vec<String>,
    #[serde(default)]
    quests: Vec<WalkthroughQuest>,
    director_state: WalkthroughDirectorState,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct WalkthroughQuest {
    id: String,
    status: String,
    summary: String,
}

#[derive(Debug, Clone, Deserialize)]
struct WalkthroughDirectorState {
    #[serde(default)]
    end_goal: Option<String>,
    end_goal_progress: String,
}

#[derive(Debug, Clone)]
struct WalkthroughScenarioContext {
    player: WalkthroughPlayerState,
    recent_turns: Vec<WalkthroughHistoryTurn>,
    recalled_memories: Vec<String>,
}

#[derive(Debug, Clone)]
struct WalkthroughHistoryTurn {
    input: String,
    outcome_summary: String,
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
    let walkthrough_matrix_contracts =
        test_walkthrough_matrix_contracts(&repo_root, &mut report);
    report.record_scenario(
        "walkthrough-matrix-contracts",
        walkthrough_matrix_contracts,
    );

    if options.selection_only {
        return report.finish(&options, None);
    }

    let persona_selection = resolve_test_player_persona_selection(&options)?;

    let walkthrough_matrix = load_local_ai_walkthrough_matrix(&repo_root)?;
    let walkthrough_fixture = load_story_sample_walkthrough_fixture(&repo_root)?;

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

    for scenario in &walkthrough_matrix.scenarios {
        let scenario_id = scenario.id.clone();
        let walkthrough_result = test_story_sample_walkthrough_scenario(
            &client,
            &config,
            persona_selection.persona,
            &walkthrough_matrix,
            &walkthrough_fixture,
            scenario,
            &mut report,
        );
        report.record_scenario(&scenario_id, walkthrough_result);
    }

    report.finish(&options, Some(persona_selection))
}

fn ensure_equal<T>(name: &str, actual: T, expected: T) -> Result<()>
where
    T: PartialEq + std::fmt::Display,
{
    if actual != expected {
        Err(anyhow!("{name} expected '{expected}' but got '{actual}'."))
    } else {
        Ok(())
    }
}

fn ensure_array_length_at_most(name: &str, value: &[Value], max: usize) -> Result<()> {
    if value.len() > max {
        Err(anyhow!("{name} exceeds max length {max}."))
    } else {
        Ok(())
    }
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

fn test_local_gpu_profile_selection(
    repo_root: &Path,
    report: &mut HarnessReport,
) -> Result<String> {
    let matrix_path = local_gpu_profile_matrix_path(repo_root);
    let matrix = load_local_gpu_profile_matrix(&matrix_path)?;

    let auto_small =
        resolve_local_gpu_profile_selection(&matrix, "local-gpu-small", None, None, Some(10.0));
    ensure_equal("autoSmall.status", auto_small.status.as_str(), "selected")?;
    ensure_equal(
        "autoSmall.profileId",
        auto_small.profile_id.as_deref().unwrap_or(""),
        "local-gpu-8gb",
    )?;
    ensure_equal(
        "autoSmall.selectionSource",
        auto_small.selection_source.as_str(),
        "detected-vram",
    )?;

    let auto_large =
        resolve_local_gpu_profile_selection(&matrix, "local-gpu-large", None, None, Some(12.0));
    ensure_equal("autoLarge.status", auto_large.status.as_str(), "selected")?;
    ensure_equal(
        "autoLarge.profileId",
        auto_large.profile_id.as_deref().unwrap_or(""),
        "local-gpu-12gb",
    )?;
    ensure_equal(
        "autoLarge.selectionSource",
        auto_large.selection_source.as_str(),
        "detected-vram",
    )?;

    let manual_profile = resolve_local_gpu_profile_selection(
        &matrix,
        "local-gpu-small",
        Some("local-gpu-20gb-plus"),
        None,
        Some(8.0),
    );
    ensure_equal("manualProfile.status", manual_profile.status.as_str(), "selected")?;
    ensure_equal(
        "manualProfile.profileId",
        manual_profile.profile_id.as_deref().unwrap_or(""),
        "local-gpu-20gb-plus",
    )?;
    ensure_equal(
        "manualProfile.selectionSource",
        manual_profile.selection_source.as_str(),
        "manual-profile",
    )?;

    let manual_vram =
        resolve_local_gpu_profile_selection(&matrix, "local-gpu-small", None, Some(21.0), None);
    ensure_equal("manualVram.status", manual_vram.status.as_str(), "selected")?;
    ensure_equal(
        "manualVram.profileId",
        manual_vram.profile_id.as_deref().unwrap_or(""),
        "local-gpu-20gb-plus",
    )?;
    ensure_equal(
        "manualVram.selectionSource",
        manual_vram.selection_source.as_str(),
        "manual-vram",
    )?;

    let unsupported =
        resolve_local_gpu_profile_selection(&matrix, "local-gpu-small", None, None, Some(6.0));
    ensure_equal(
        "unsupported.status",
        unsupported.status.as_str(),
        "manual-selection-required",
    )?;
    ensure_equal(
        "unsupported.selectionSource",
        unsupported.selection_source.as_str(),
        "unsupported-vram",
    )?;
    ensure_equal(
        "unsupported.profileId",
        unsupported.profile_id.as_deref().unwrap_or(""),
        "",
    )?;

    let unknown = resolve_local_gpu_profile_selection(&matrix, "local-gpu-large", None, None, None);
    ensure_equal(
        "unknown.status",
        unknown.status.as_str(),
        "manual-selection-required",
    )?;
    ensure_equal(
        "unknown.selectionSource",
        unknown.selection_source.as_str(),
        "detection-unavailable",
    )?;
    ensure_equal(
        "unknown.profileId",
        unknown.profile_id.as_deref().unwrap_or(""),
        "",
    )?;

    report.pass("Local GPU profile selection contract stayed stable.");
    Ok("Local GPU profile selection contract stayed stable.".to_string())
}

fn test_turn_schema_guardrails(repo_root: &Path, report: &mut HarnessReport) -> Result<String> {
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
    Ok("TypeScript turn-schema guardrail test passed.".to_string())
}

fn test_walkthrough_matrix_contracts(
    repo_root: &Path,
    report: &mut HarnessReport,
) -> Result<String> {
    let matrix = load_local_ai_walkthrough_matrix(repo_root)?;
    let fixture = load_story_sample_walkthrough_fixture(repo_root)?;

    validate_walkthrough_matrix_contract(&matrix, &fixture)?;
    report.pass(format!(
        "Walkthrough matrix contract loaded {} scripted scenarios from {}.",
        matrix.scenarios.len(),
        fixture.fixture_id
    ));

    Ok(format!(
        "Validated {} scripted walkthrough scenarios against {}.",
        matrix.scenarios.len(),
        fixture.fixture_id
    ))
}

fn test_embeddings(
    client: &Client,
    config: &RepoAiConfig,
    report: &mut HarnessReport,
) -> Result<String> {
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
    Ok(format!(
        "Embeddings endpoint returned a vector of length {length}."
    ))
}

fn test_scene_schema(
    client: &Client,
    config: &RepoAiConfig,
    report: &mut HarnessReport,
) -> Result<String> {
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
    Ok("Structured scene response parsed successfully.".to_string())
}

fn test_game_turn_schema(
    client: &Client,
    config: &RepoAiConfig,
    persona: TestPlayerPersonaChoice,
    report: &mut HarnessReport,
) -> Result<String> {
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
            "temperature": 0,
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

    let parsed: Value = serde_json::from_str(&extract_message_content(&response)?)?;
    validate_game_turn_response(&parsed, report)?;

    Ok(format!(
        "Single-turn game_turn schema smoke passed with {} persona.",
        persona.cli_name()
    ))
}

fn test_story_sample_walkthrough_scenario(
    client: &Client,
    config: &RepoAiConfig,
    persona: TestPlayerPersonaChoice,
    matrix: &LocalAiWalkthroughMatrix,
    fixture: &StorySampleWalkthroughFixture,
    scenario: &LocalAiWalkthroughScenario,
    report: &mut HarnessReport,
) -> Result<String> {
    let mut context = build_walkthrough_scenario_context(matrix, fixture, scenario)?;
    let start_location = context.player.location.clone();

    for turn in fixture_turn_slice(fixture, scenario) {
        let prompt = build_walkthrough_prompt(&context, scenario, turn, persona);
        let response = invoke_api_json(
            client,
            &format!("{}/chat/completions", config.base_url),
            json!({
                "model": config.chat_model,
                "temperature": 0,
                "messages": [
                    {"role": "system", "content": "You are the Narrative Engine for a text-based adventure game. Return structured JSON only."},
                    {"role": "user", "content": prompt}
                ],
                "response_format": game_turn_response_format()
            }),
            &config.api_key,
        )?;

        let parsed: Value = serde_json::from_str(&extract_message_content(&response)?)?;
        validate_game_turn_response(&parsed, report)?;
        report.pass(format!(
            "Walkthrough scenario {} accepted cue: {}",
            scenario.id, turn.input
        ));
        apply_fixture_turn_to_context(&mut context, matrix, turn);
    }

    Ok(format!(
        "{} validated {} turns from {} to {} with {} persona.",
        scenario.label,
        scenario.turn_count,
        start_location,
        context.player.location,
        persona.cli_name()
    ))
}

fn validate_game_turn_response(parsed: &Value, report: &mut HarnessReport) -> Result<()> {
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
    ensure_array_length_at_most("player_options", &player_options, 6)?;

    let memory_updates = parsed
        .get("memory_updates")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    ensure_array_length_at_most("memory_updates", &memory_updates, 8)?;

    report.pass("Full game_turn response parsed successfully.");
    Ok(())
}

fn game_turn_response_format() -> Value {
    json!({
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
    })
}

fn load_local_ai_walkthrough_matrix(repo_root: &Path) -> Result<LocalAiWalkthroughMatrix> {
    let path = local_ai_walkthrough_matrix_path(repo_root);
    Ok(serde_json::from_str(&fs::read_to_string(path)?)?)
}

fn load_story_sample_walkthrough_fixture(repo_root: &Path) -> Result<StorySampleWalkthroughFixture> {
    let path = repo_root.join("data").join("story_sample_walkthrough.json");
    Ok(serde_json::from_str(&fs::read_to_string(path)?)?)
}

fn validate_walkthrough_matrix_contract(
    matrix: &LocalAiWalkthroughMatrix,
    fixture: &StorySampleWalkthroughFixture,
) -> Result<()> {
    if matrix.fixture_id != fixture.fixture_id {
        return Err(anyhow!(
            "Walkthrough matrix fixture_id '{}' did not match story fixture '{}'.",
            matrix.fixture_id,
            fixture.fixture_id
        ));
    }

    if matrix.scenarios.len() < 2 {
        return Err(anyhow!(
            "Walkthrough matrix must define at least two scripted scenarios."
        ));
    }

    if matrix.history_window == 0 || matrix.memory_window == 0 {
        return Err(anyhow!(
            "Walkthrough matrix history and memory windows must both be greater than zero."
        ));
    }

    let mut ids = BTreeSet::new();
    let mut next_turn_index = 0_usize;
    for scenario in &matrix.scenarios {
        if scenario.id.trim().is_empty() || scenario.label.trim().is_empty() {
            return Err(anyhow!("Walkthrough scenarios need non-empty ids and labels."));
        }
        if !ids.insert(scenario.id.as_str()) {
            return Err(anyhow!(
                "Walkthrough scenario id '{}' is duplicated.",
                scenario.id
            ));
        }
        if scenario.turn_count == 0 {
            return Err(anyhow!(
                "Walkthrough scenario '{}' must cover at least one turn.",
                scenario.id
            ));
        }
        if scenario.start_turn != next_turn_index {
            return Err(anyhow!(
                "Walkthrough scenario '{}' expected to start at turn {} but starts at {}.",
                scenario.id,
                next_turn_index,
                scenario.start_turn
            ));
        }
        let scenario_end = scenario.start_turn + scenario.turn_count;
        if scenario_end > fixture.turns.len() {
            return Err(anyhow!(
                "Walkthrough scenario '{}' exceeds the {}-turn story fixture.",
                scenario.id,
                fixture.turns.len()
            ));
        }
        next_turn_index = scenario_end;
    }

    if next_turn_index != fixture.turns.len() {
        return Err(anyhow!(
            "Walkthrough matrix covered {} turns but the fixture contains {}.",
            next_turn_index,
            fixture.turns.len()
        ));
    }

    Ok(())
}

fn fixture_turn_slice<'a>(
    fixture: &'a StorySampleWalkthroughFixture,
    scenario: &LocalAiWalkthroughScenario,
) -> &'a [WalkthroughFixtureTurn] {
    &fixture.turns[scenario.start_turn..scenario.start_turn + scenario.turn_count]
}

fn build_walkthrough_scenario_context(
    matrix: &LocalAiWalkthroughMatrix,
    fixture: &StorySampleWalkthroughFixture,
    scenario: &LocalAiWalkthroughScenario,
) -> Result<WalkthroughScenarioContext> {
    validate_walkthrough_matrix_contract(matrix, fixture)?;

    let mut context = WalkthroughScenarioContext {
        player: fixture.player.clone(),
        recent_turns: Vec::new(),
        recalled_memories: Vec::new(),
    };

    for prior_turn in &fixture.turns[..scenario.start_turn] {
        apply_fixture_turn_to_context(&mut context, matrix, prior_turn);
    }

    Ok(context)
}

fn apply_fixture_turn_to_context(
    context: &mut WalkthroughScenarioContext,
    matrix: &LocalAiWalkthroughMatrix,
    turn: &WalkthroughFixtureTurn,
) {
    context.player.location = turn.committed.state_updates.location.clone();

    for item in &turn.committed.state_updates.inventory_add {
        if !context.player.inventory.contains(item) {
            context.player.inventory.push(item.clone());
        }
    }
    context
        .player
        .inventory
        .retain(|item| !turn.committed.state_updates.inventory_remove.contains(item));

    for flag in &turn.committed.state_updates.flags_add {
        if !context.player.flags.contains(flag) {
            context.player.flags.push(flag.clone());
        }
    }
    context
        .player
        .flags
        .retain(|flag| !turn.committed.state_updates.flags_remove.contains(flag));

    if !turn.committed.state_updates.quests.is_empty() {
        context.player.quests = turn.committed.state_updates.quests.clone();
    }

    context.player.director_state.end_goal_progress =
        turn.committed.director_updates.end_goal_progress.clone();

    context.recent_turns.push(WalkthroughHistoryTurn {
        input: turn.input.clone(),
        outcome_summary: turn.outcome_summary.clone(),
    });
    if context.recent_turns.len() > matrix.history_window {
        let overflow = context.recent_turns.len() - matrix.history_window;
        context.recent_turns.drain(0..overflow);
    }

    for memory in &turn.committed.memory_updates {
        if !memory.trim().is_empty() && !context.recalled_memories.contains(memory) {
            context.recalled_memories.push(memory.clone());
        }
    }
    if context.recalled_memories.len() > matrix.memory_window {
        let overflow = context.recalled_memories.len() - matrix.memory_window;
        context.recalled_memories.drain(0..overflow);
    }
}

fn build_walkthrough_prompt(
    context: &WalkthroughScenarioContext,
    scenario: &LocalAiWalkthroughScenario,
    turn: &WalkthroughFixtureTurn,
    persona: TestPlayerPersonaChoice,
) -> String {
    let state_pack = json!({
        "player": {
            "id": context.player.id,
            "name": context.player.name,
            "location": context.player.location,
            "inventory": context.player.inventory,
            "flags": context.player.flags,
            "quests": context.player.quests,
        },
        "summary": context.player.summary,
        "director": {
            "end_goal_progress": context.player.director_state.end_goal_progress,
        },
        "director_spec": {
            "end_goal": context
                .player
                .director_state
                .end_goal
                .clone()
                .unwrap_or_else(|| "Keep the Ghostlight Relay from panicking the district.".to_string()),
            "current_beat": {
                "id": scenario.id,
                "label": scenario.label,
            },
            "rules": [
                "Keep the story moving.",
                "Treat any consequences as proposals rather than committed truth."
            ]
        },
        "quest_spec": {
            "quests": context.player.quests,
        }
    });

    let short_history = if context.recent_turns.is_empty() {
        "PLAYER: (start of walkthrough scenario)".to_string()
    } else {
        context
            .recent_turns
            .iter()
            .map(|entry| format!("PLAYER: {}\nNARRATOR: {}", entry.input, entry.outcome_summary))
            .collect::<Vec<_>>()
            .join("\n")
    };

    let memories = if context.recalled_memories.is_empty() {
        "(no recalled memories yet)".to_string()
    } else {
        context.recalled_memories.join("\n")
    };

    format!(
        "TEST_PLAYER_PERSONA\nname: {}\nguidance: {}\n\nWALKTHROUGH_SCENARIO\nid: {}\nlabel: {}\nsummary: {}\nfixture_outcome_target: {}\n\nSTATE_PACK\n{}\n\nSHORT_HISTORY\n{}\n\nMEMORIES\n{}\n\nPLAYER_INPUT\n{}",
        persona.display_name(),
        persona.guidance(),
        scenario.id,
        scenario.label,
        scenario.summary,
        turn.outcome_summary,
        state_pack,
        short_history,
        memories,
        turn.input
    )
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
    let mut last_transport_error = None;

    for attempt in 1..=3 {
        match client.post(uri).bearer_auth(api_key).json(&body).send() {
            Ok(response) => {
                let status = response.status();
                let payload = response.text()?;
                if !status.is_success() {
                    return Err(anyhow!("{status}: {payload}"));
                }

                return Ok(serde_json::from_str(&payload)?);
            }
            Err(error) => {
                last_transport_error = Some(error);
                if attempt < 3 {
                    thread::sleep(Duration::from_millis(500));
                }
            }
        }
    }

    Err(anyhow!(
        "error sending request for url ({uri}) after 3 attempts: {}",
        last_transport_error
            .map(|error| error.to_string())
            .unwrap_or_else(|| "unknown transport error".to_string())
    ))
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
        apply_fixture_turn_to_context, build_walkthrough_scenario_context, fixture_turn_slice,
        command_preview, find_profile_for_vram, resolve_local_gpu_profile_selection,
        resolve_test_player_persona_selection, select_test_player_persona_from_seed,
        validate_walkthrough_matrix_contract, HarnessManifest, HarnessReport,
        HarnessScenarioResult, LocalAiWalkthroughMatrix, LocalAiWalkthroughScenario,
        LocalGpuProfile, LocalGpuProfileMatrix, StorySampleWalkthroughFixture,
        TestLocalAiWorkflowOptions, TestPlayerPersonaChoice, TestPlayerPersonaSelection,
        TEST_PLAYER_PERSONAS,
    };

    fn sample_story_fixture() -> StorySampleWalkthroughFixture {
        serde_json::from_value(serde_json::json!({
            "fixture_id": "story_sample_ghostlight_relay_v1",
            "description": "sample",
            "player": {
                "id": "player-1",
                "name": "Avery",
                "location": "Rooftop Market",
                "summary": "",
                "inventory": [],
                "flags": [],
                "quests": [{"id": "ghostlight_relay", "status": "active", "summary": "Inspect the sparking market beacon"}],
                "director_state": {
                    "end_goal": "Stop the Ghostlight Relay.",
                    "end_goal_progress": "Just beginning.",
                    "completed_beats": []
                }
            },
            "turns": [
                {
                    "input": "inspect beacon",
                    "outcome_summary": "You confirm the fake orders.",
                    "committed": {
                        "state_updates": {
                            "location": "Rooftop Market",
                            "inventory_add": [],
                            "inventory_remove": [],
                            "flags_add": ["beacon_inspected"],
                            "flags_remove": [],
                            "quests": [{"id": "ghostlight_relay", "status": "active", "summary": "Question Nila"}]
                        },
                        "director_updates": {"end_goal_progress": "You confirm the threat."},
                        "memory_updates": ["The beacon is compromised."]
                    }
                },
                {
                    "input": "question Nila",
                    "outcome_summary": "Nila points you to the stacks.",
                    "committed": {
                        "state_updates": {
                            "location": "Rooftop Market",
                            "inventory_add": [],
                            "inventory_remove": [],
                            "flags_add": ["nila_guidance"],
                            "flags_remove": [],
                            "quests": [{"id": "ghostlight_relay", "status": "active", "summary": "Head to Closed Stacks"}]
                        },
                        "director_updates": {"end_goal_progress": "You know where to go next."},
                        "memory_updates": ["Nila told you about the stacks."]
                    }
                },
                {
                    "input": "head to stacks",
                    "outcome_summary": "You reach the Closed Stacks.",
                    "committed": {
                        "state_updates": {
                            "location": "Closed Stacks",
                            "inventory_add": [],
                            "inventory_remove": [],
                            "flags_add": [],
                            "flags_remove": [],
                            "quests": []
                        },
                        "director_updates": {"end_goal_progress": "The route is open."},
                        "memory_updates": []
                    }
                }
            ]
        }))
        .expect("sample fixture")
    }

    fn sample_walkthrough_matrix() -> LocalAiWalkthroughMatrix {
        LocalAiWalkthroughMatrix {
            fixture_id: "story_sample_ghostlight_relay_v1".to_string(),
            history_window: 2,
            memory_window: 2,
            scenarios: vec![
                LocalAiWalkthroughScenario {
                    id: "story-sample-opening".to_string(),
                    label: "Opening".to_string(),
                    summary: "First half.".to_string(),
                    start_turn: 0,
                    turn_count: 2,
                },
                LocalAiWalkthroughScenario {
                    id: "story-sample-pivot".to_string(),
                    label: "Pivot".to_string(),
                    summary: "Second half.".to_string(),
                    start_turn: 2,
                    turn_count: 1,
                },
            ],
        }
    }

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

    #[test]
    fn walkthrough_matrix_contract_requires_full_ordered_coverage() {
        let fixture = sample_story_fixture();
        let matrix = sample_walkthrough_matrix();

        validate_walkthrough_matrix_contract(&matrix, &fixture)
            .expect("walkthrough matrix contract should be valid");
        assert_eq!(fixture_turn_slice(&fixture, &matrix.scenarios[0]).len(), 2);
        assert_eq!(fixture_turn_slice(&fixture, &matrix.scenarios[1]).len(), 1);
    }

    #[test]
    fn walkthrough_context_replays_prior_committed_turns_before_scenario_start() {
        let fixture = sample_story_fixture();
        let matrix = sample_walkthrough_matrix();

        let context = build_walkthrough_scenario_context(&matrix, &fixture, &matrix.scenarios[1])
            .expect("scenario context");

        assert_eq!(context.player.location, "Rooftop Market");
        assert!(context.player.flags.contains(&"beacon_inspected".to_string()));
        assert!(context.player.flags.contains(&"nila_guidance".to_string()));
        assert_eq!(context.recent_turns.len(), 2);
        assert_eq!(context.recalled_memories.len(), 2);
    }

    #[test]
    fn applying_fixture_turn_caps_history_and_memory_windows() {
        let fixture = sample_story_fixture();
        let matrix = sample_walkthrough_matrix();
        let mut context = build_walkthrough_scenario_context(&matrix, &fixture, &matrix.scenarios[0])
            .expect("scenario context");

        apply_fixture_turn_to_context(&mut context, &matrix, &fixture.turns[0]);
        apply_fixture_turn_to_context(&mut context, &matrix, &fixture.turns[1]);
        apply_fixture_turn_to_context(&mut context, &matrix, &fixture.turns[2]);

        assert_eq!(context.recent_turns.len(), 2);
        assert_eq!(context.recalled_memories.len(), 2);
        assert_eq!(context.player.location, "Closed Stacks");
    }
}
