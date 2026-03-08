import assert from "node:assert/strict";
import test from "node:test";
import { createPreflightIssueViewModel, createPreflightPanelViewModel, createSetupWizardViewModel } from "./setup-view.js";

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
      current_profile: {
        label: "Local GPU Small",
        provider: "litellm",
        chat_model: "game-chat",
        embedding_model: "game-embedding"
      },
      supported_path: {
        title: "Supported MVP AI path",
        summary: "Use the launcher.",
        launcher: "powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1",
        services: ["Docker Desktop"]
      },
      preflight: {
        status: "action-required",
        issues: [{ title: "Docker Desktop", recommended_fix: "Start Docker Desktop." }]
      }
    },
    setupError: null,
    pending: false,
    fatalBlocked: false
  });

  assert.equal(viewModel.title, "Setup needs attention");
  assert.equal(viewModel.buttonText, "Retry Setup Check");
  assert.deepEqual(viewModel.guidance, ["Docker Desktop: Start Docker Desktop."]);
});

test("createPreflightIssueViewModel preserves advanced details payloads", () => {
  const item = createPreflightIssueViewModel({
    severity: "warning",
    title: "LiteLLM",
    message: "Alias lookup failed.",
    recommended_fix: "Retry the setup check.",
    env_vars: ["LITELLM_PROXY_URL"],
    details: { probe: "health" }
  });

  assert.match(item.text, /recommended next step/i);
  assert.deepEqual(item.advancedIssue, {
    title: "LiteLLM",
    severity: "warning",
    env_vars: ["LITELLM_PROXY_URL"],
    details: { probe: "health" }
  });
});

test("createPreflightPanelViewModel hides the panel when setup is clear", () => {
  const viewModel = createPreflightPanelViewModel({
    preflight: { ok: true, issues: [] },
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
    preflight: {
      status: "action-required",
      summary: "Setup blocked.",
      ok: false,
      issues: [
        {
          severity: "blocker",
          title: "Docker Desktop",
          message: "Docker is not running.",
          recommended_fix: "Start Docker Desktop.",
          details: { status: "stopped" }
        }
      ]
    },
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
});
