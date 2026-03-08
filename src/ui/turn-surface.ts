import type {
  PlayerState,
  RuntimeConfigDiagnostics,
  RuntimeConfigProfile,
  RuntimeLocalGpuSelection,
  RuntimePreflightPayload,
  SessionDebugPayload,
  SetupStatus,
  TurnDebugPayload
} from "./contracts.js";
import { formatLocalGpuSummary } from "./session-data.js";

export interface SessionSummaryElements {
  runtimeSummaryEl: HTMLElement;
  sessionSummaryEl: HTMLElement;
  profileSummaryEl: HTMLElement;
}

export interface SessionSummaryRenderState {
  player: PlayerState | null;
  sessionDebug: SessionDebugPayload | null;
  lastTurnDebug: TurnDebugPayload | null;
  setupStatus: SetupStatus | null;
  profile: RuntimeConfigProfile | null;
  localGpu: RuntimeLocalGpuSelection | null;
  diagnostics: RuntimeConfigDiagnostics | null;
  preflight: RuntimePreflightPayload | null;
  hasEnteredFlow: boolean;
  hasSavedSession: boolean;
}

export interface SessionSummaryViewModel {
  runtimeText: string;
  profileText: string;
  sessionText: string;
}

export interface TurnLogEntry {
  label: string;
  text: string;
  tone?: string;
}

export interface TurnOptionsRenderState {
  options?: string[];
  disabled: boolean;
  onSelect: (option: string) => void;
}

export interface AssistCorrection {
  token: string;
  suggestions: string[];
}

export interface AssistChipViewModel {
  kind: "correction" | "completion";
  text: string;
  token?: string;
  suggestion?: string;
  completion?: string;
}

export interface AssistSectionViewModel {
  label: string;
  chips: AssistChipViewModel[];
}

export interface AssistViewModel {
  placeholder: string | null;
  sections: AssistSectionViewModel[];
}

export interface AssistRenderState {
  corrections?: AssistCorrection[];
  completions?: string[];
  onCorrectionSelect: (token: string, suggestion: string) => void;
  onCompletionSelect: (completion: string) => void;
}

export function renderSessionSummary(elements: SessionSummaryElements, state: SessionSummaryRenderState): void {
  const viewModel = createSessionSummaryViewModel(state);

  elements.runtimeSummaryEl.textContent = viewModel.runtimeText;
  elements.profileSummaryEl.textContent = viewModel.profileText;
  elements.sessionSummaryEl.textContent = viewModel.sessionText;
}

export function createSessionSummaryViewModel(state: SessionSummaryRenderState): SessionSummaryViewModel {
  const runtime = state.sessionDebug?.runtime || state.lastTurnDebug?.runtime;
  const session = state.sessionDebug?.session || state.lastTurnDebug?.session;
  const setupProfile = state.setupStatus?.current_profile;
  const beat = state.player?.director_state?.current_beat_label;
  const localGpuSummary = formatLocalGpuSummary(state.localGpu);
  const overrideCount = state.diagnostics?.profile_overrides?.length || 0;

  const runtimeParts: string[] = [];
  if (typeof runtime?.provider === "string") runtimeParts.push(runtime.provider);
  if (typeof runtime?.chat_model === "string") runtimeParts.push(runtime.chat_model);
  if (!runtime && setupProfile?.provider) runtimeParts.push(setupProfile.provider);
  if (!runtime && setupProfile?.chat_model) runtimeParts.push(setupProfile.chat_model);
  if (state.localGpu?.profile_label) runtimeParts.push(state.localGpu.profile_label);
  if (state.preflight?.status === "action-required") runtimeParts.push("setup required");
  if (state.preflight?.status === "checking") runtimeParts.push("checking AI");

  const sessionPlayerId = typeof session?.player_id === "string" ? session.player_id : null;
  if (sessionPlayerId) {
    runtimeParts.push(`player ${sessionPlayerId.slice(0, 8)}`);
  }

  const runtimeText = runtimeParts.length
    ? runtimeParts.join(" / ")
    : state.hasSavedSession
      ? "Saved game ready to resume"
      : "Choose a start option";

  const profileText = state.profile
    ? `${state.profile.label || state.profile.id || "Setup profile"}${overrideCount ? ` | ${overrideCount} override${overrideCount === 1 ? "" : "s"}` : ""}${localGpuSummary ? ` | ${localGpuSummary}` : ""}`
    : setupProfile
      ? `${setupProfile.label || setupProfile.id || "Setup profile"}${localGpuSummary ? ` | ${localGpuSummary}` : ""}`
      : localGpuSummary || (state.hasEnteredFlow ? "Setup profile loading..." : "No session loaded yet.");

  if (!state.player) {
    return {
      runtimeText,
      profileText,
      sessionText: state.hasEnteredFlow
        ? "Waiting for the opening scene."
        : state.hasSavedSession
          ? "Resume the last game saved in this browser or start over with a new run."
          : "Choose a name and start when you're ready."
    };
  }

  const details = [`${state.player.name} in ${state.player.location}`];
  if (beat) {
    details.push(`beat: ${beat}`);
  }

  return {
    runtimeText,
    profileText,
    sessionText: details.join(" | ")
  };
}

export function appendLogEntry(logEl: HTMLElement, entry: TurnLogEntry): void {
  const article = document.createElement("article");
  article.className = `entry ${entry.tone || "neutral"}`;

  const title = document.createElement("strong");
  title.textContent = entry.label;

  const body = document.createElement("div");
  body.textContent = entry.text;

  article.appendChild(title);
  article.appendChild(body);
  logEl.appendChild(article);
  logEl.scrollTop = logEl.scrollHeight;
}

export function renderTurnOptions(optionsEl: HTMLElement, state: TurnOptionsRenderState): void {
  optionsEl.innerHTML = "";

  (state.options || []).forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = option;
    button.disabled = state.disabled;
    button.addEventListener("click", () => {
      state.onSelect(option);
    });
    optionsEl.appendChild(button);
  });
}

export function createAssistViewModel(
  corrections: AssistCorrection[] = [],
  completions: string[] = []
): AssistViewModel {
  const sections: AssistSectionViewModel[] = [];
  const correctionChips = corrections.reduce<AssistChipViewModel[]>((chips, item) => {
      const suggestion = item.suggestions[0];
      if (!suggestion) {
        return chips;
      }

      chips.push({
        kind: "correction" as const,
        text: `${item.token} -> ${suggestion}`,
        token: item.token,
        suggestion
      });

      return chips;
    }, []);

  if (correctionChips.length) {
    sections.push({
      label: "Spelling",
      chips: correctionChips
    });
  }

  const completionChips = completions.map((completion) => ({
    kind: "completion" as const,
    text: completion,
    completion
  }));

  if (completionChips.length) {
    sections.push({
      label: "Complete",
      chips: completionChips
    });
  }

  return {
    placeholder: sections.length ? null : "Local assist suggestions appear here.",
    sections
  };
}

export function renderAssistChips(assistEl: HTMLElement, state: AssistRenderState): void {
  assistEl.innerHTML = "";
  const viewModel = createAssistViewModel(state.corrections || [], state.completions || []);

  if (viewModel.placeholder) {
    const placeholder = document.createElement("span");
    placeholder.className = "assist-placeholder";
    placeholder.textContent = viewModel.placeholder;
    assistEl.appendChild(placeholder);
    return;
  }

  viewModel.sections.forEach((section) => {
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = section.label;
    assistEl.appendChild(label);

    section.chips.forEach((chipModel) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = chipModel.text;
      chip.addEventListener("click", () => {
        if (chipModel.kind === "correction" && chipModel.token && chipModel.suggestion) {
          state.onCorrectionSelect(chipModel.token, chipModel.suggestion);
          return;
        }

        if (chipModel.kind === "completion" && chipModel.completion) {
          state.onCompletionSelect(chipModel.completion);
        }
      });
      assistEl.appendChild(chip);
    });
  });
}