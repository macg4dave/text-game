import type { SetupStatus } from "./contracts.js";

export interface RecoveryActionHandlers {
  setupStatus: SetupStatus | null;
  runSetupCheck: () => Promise<void>;
  copyText: (text: string) => Promise<void>;
  setStatus: (text: string, tone?: string) => void;
  addEntry: (label: string, text: string, tone?: string) => void;
}

export async function runRecoveryAction(actionId: string, handlers: RecoveryActionHandlers): Promise<void> {
  switch (actionId) {
    case "retry-setup-check":
      await handlers.runSetupCheck();
      return;
    case "copy-launcher-command": {
      const launcher = handlers.setupStatus?.supported_path?.launcher;
      if (!launcher) {
        handlers.setStatus("Launcher command unavailable", "error");
        return;
      }

      await copyRecoveryText(launcher, "Launcher command copied", handlers);
      return;
    }
    case "copy-smaller-profile-guidance": {
      const guidance = [
        "Use the conservative supported profile for the next launcher run:",
        "AI_PROFILE=local-gpu-small",
        "cargo run --manifest-path launcher/Cargo.toml -- start-dev --rebuild"
      ].join("\n");

      await copyRecoveryText(guidance, "Smaller-profile guidance copied", handlers);
      return;
    }
    case "copy-gpu-repair-checklist": {
      const checklist = [
        "GPU-backed repair checklist:",
        "1. Start Docker Desktop and wait for the Linux engine.",
        "2. Confirm nvidia-smi works in a normal terminal.",
        "3. Re-run the supported launcher path.",
        "4. Retry the setup check without clearing the saved browser session.",
        handlers.setupStatus?.supported_path?.launcher || "cargo run --manifest-path launcher/Cargo.toml -- start-dev"
      ].join("\n");

      await copyRecoveryText(checklist, "GPU repair checklist copied", handlers);
      return;
    }
    default:
      return;
  }
}

async function copyRecoveryText(
  text: string,
  successStatus: string,
  handlers: Pick<RecoveryActionHandlers, "copyText" | "setStatus" | "addEntry">
): Promise<void> {
  try {
    await handlers.copyText(text);
    handlers.addEntry("System", successStatus, "system");
    handlers.setStatus(successStatus, "ok");
  } catch {
    handlers.setStatus("Copy failed", "error");
    handlers.addEntry("System", "Copy failed. Open the advanced setup details and copy the text manually.", "system");
  }
}
