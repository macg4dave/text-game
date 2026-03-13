import assert from "node:assert/strict";
import test from "node:test";
import { buildRecoveryActions } from "./setup-recovery-policy.js";

test("buildRecoveryActions adds launcher, smaller-profile, and GPU guidance for setup blockers", () => {
  const actions = buildRecoveryActions(
    [
      {
        code: "docker_not_running",
        severity: "blocker",
        area: "host",
        title: "Docker Desktop",
        message: "Docker is not running.",
        recovery: ["Start Docker Desktop."],
        recommended_fix: "Start Docker Desktop.",
        env_vars: []
      },
      {
        code: "profile_overrides_active",
        severity: "info",
        area: "config",
        title: "Advanced overrides are active",
        message: "One or more explicit env vars override the profile.",
        recovery: ["Clear the override env vars."],
        recommended_fix: "Clear the override env vars.",
        env_vars: ["AI_CHAT_MODEL"]
      }
    ],
    {
      canRetry: true,
      launcher: "cargo run --manifest-path launcher/Cargo.toml -- start-dev",
      currentProfileId: "custom",
      localGpuRequested: true,
      hasProfileOverrides: true
    }
  );

  assert.deepEqual(actions.map((action) => action.id), [
    "retry-setup-check",
    "copy-docker-desktop-checklist",
    "copy-launcher-command",
    "copy-smaller-profile-guidance",
    "copy-gpu-repair-checklist"
  ]);
});