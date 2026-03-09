import assert from "node:assert/strict";
import test from "node:test";
import { createPreflightIssueViewModel, createPreflightPanelViewModel, createSetupWizardViewModel } from "./setup-view.js";

function createPreflightIssue(overrides: Partial<Parameters<typeof createPreflightIssueViewModel>[0]> = {}) {
  return {
    code: "docker_not_running",
    severity: "blocker" as const,
    area: "host" as const,
    title: "Docker Desktop",
    message: "Docker is not running.",
    recovery: ["Start Docker Desktop."],
    recommended_fix: "Start Docker Desktop.",
    env_vars: [],
    ...overrides
  };
}

function createPreflight(status: "ready" | "action-required" | "checking", summary: string, issues = [createPreflightIssue()]) {
  return {
    ok: status === "ready",
    status,
    summary,
    issues,
    counts: {
      blocker: issues.filter((issue) => issue.severity === "blocker").length,
      warning: issues.filter((issue) => issue.severity === "warning").length,
      info: issues.filter((issue) => issue.severity === "info").length
    },
    checked_at: "2026-03-08T00:00:00.000Z"
  };
}

test("createSetupWizardViewModel returns loading copy before setup is known", () => {
  const viewModel = createSetupWizardViewModel({
    setupStatus: null,
    setupError: null,
    pending: true,
    fatalBlocked: false
  });

  assert.equal(viewModel.title, "Checking the supported AI path");
  assert.equal(viewModel.buttonText, "Run Connection Test");
  assert.match(viewModel.summary, /checking docker/i);
  assert.deepEqual(viewModel.guidance, ["You can start or resume after the setup check finishes."]);
});

test("createSetupWizardViewModel surfaces setup issues as guidance", () => {
  const viewModel = createSetupWizardViewModel({
    setupStatus: {
      status: "action-required",
      summary: "Docker is not ready.",
      checked_at: "2026-03-08T00:00:00.000Z",
      can_retry: true,
      current_profile: {
        id: "custom",
        label: "Custom overrides",
        provider: "litellm",
        chat_model: "game-chat",
        embedding_model: "game-embedding"
      },
      supported_path: {
        provider: "litellm",
        title: "Supported MVP AI path",
        summary: "Use the launcher.",
        launcher: "cargo run --manifest-path launcher/Cargo.toml -- start-dev",
        services: ["Docker Desktop"]
      },
      config_diagnostics: {
        profile_overrides: [{ field: "ai.chat_model", source: "env", env_var: "AI_CHAT_MODEL" }]
      },
      local_gpu: {
        requested: true,
        requested_profile: "local-gpu-large",
        status: "detected",
        selection_source: "detected-profile",
        profile_id: "local-gpu-large",
        profile_label: "12 GB tier",
        verification_status: "ready",
        detected_vram_gb: 12,
        manual_vram_gb: null,
        chat_model: "game-chat",
        embedding_mode: "local",
        embedding_model: "game-embedding",
        message: "12 GB GPU detected.",
        notes: []
      },
      preflight: createPreflight("action-required", "Docker is not ready.")
    },
    setupError: null,
    pending: false,
    fatalBlocked: false
  });

  assert.equal(viewModel.title, "Setup needs attention");
  assert.equal(viewModel.buttonText, "Retry Setup Check");
  assert.deepEqual(viewModel.guidance, ["Docker Desktop: Start Docker Desktop."]);
  assert.deepEqual(viewModel.actions.map((action) => action.id), [
    "retry-setup-check",
    "copy-launcher-command",
    "copy-smaller-profile-guidance",
    "copy-gpu-repair-checklist"
  ]);
  assert.match(viewModel.advancedJson || "", /profile_overrides/);
  assert.match(viewModel.advancedJson || "", /12 GB tier/);
});

test("createPreflightIssueViewModel preserves advanced details payloads", () => {
  const item = createPreflightIssueViewModel(
    createPreflightIssue({
      code: "litellm_alias_lookup_failed",
      severity: "warning",
      area: "ai",
      title: "LiteLLM",
      message: "Alias lookup failed.",
      recommended_fix: "Retry the setup check.",
      env_vars: ["LITELLM_PROXY_URL"],
      details: { probe_target: "health" }
    })
  );

  assert.match(item.text, /recommended next step/i);
  assert.deepEqual(item.advancedIssue, {
    code: "litellm_alias_lookup_failed",
    area: "ai",
    title: "LiteLLM",
    severity: "warning",
    env_vars: ["LITELLM_PROXY_URL"],
    details: { probe_target: "health" }
  });
  assert.equal(item.recommendedFix, "Retry the setup check.");
  assert.ok(item.actions.some((action) => action.id === "retry-setup-check"));
});

test("createPreflightPanelViewModel hides the panel when setup is clear", () => {
  const viewModel = createPreflightPanelViewModel({
    preflight: createPreflight("ready", "All set.", []),
    diagnostics: null,
    profile: null,
    setupStatus: null,
    localGpu: null
  });

  assert.equal(viewModel.hidden, true);
  assert.equal(viewModel.advancedJson, null);
});

test("createPreflightPanelViewModel formats profile and advanced diagnostics", () => {
  const viewModel = createPreflightPanelViewModel({
    preflight: createPreflight("action-required", "Setup blocked.", [createPreflightIssue({ details: { notes: ["stopped"] } })]),
    diagnostics: { profile_overrides: [{ field: "chat_model" }] },
    profile: { label: "Local GPU Small" },
    setupStatus: null,
    localGpu: { requested: true, profile_label: "8 GB tier", selection_source: "detected-profile", detected_vram_gb: 8 }
  });

  assert.equal(viewModel.hidden, false);
  assert.match(viewModel.profileText, /advanced override/i);
  assert.match(viewModel.profileText, /8 GB detected/i);
  assert.equal(viewModel.issueItems.length, 1);
  assert.match(viewModel.advancedJson || "", /Docker Desktop/);
  assert.match(viewModel.advancedJson || "", /profile_overrides/);
  assert.ok(viewModel.issueItems[0]?.actions.some((action) => action.id === "copy-launcher-command"));
});
