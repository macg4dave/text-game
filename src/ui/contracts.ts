import type { SetupStatus as SharedSetupStatus, SetupStatusPayload as SharedSetupStatusPayload } from "../core/types.js";

export interface PlayerState {
  id: string;
  name: string;
  location: string;
  director_state?: {
    current_beat_label?: string;
  };
  [key: string]: unknown;
}

export interface SessionDebugPayload {
  runtime?: Record<string, unknown> | null;
  session?: Record<string, unknown> | null;
}

export interface RuntimePreflightIssue {
  severity?: string;
  title?: string;
  message?: string;
  recovery?: string[];
  recommended_fix?: string | null;
  env_vars?: string[];
  details?: Record<string, unknown> | null;
}

export interface RuntimePreflightPayload {
  ok?: boolean;
  status?: string;
  summary?: string;
  issues?: RuntimePreflightIssue[];
  checked_at?: string | null;
  counts?: {
    blocker?: number;
    warning?: number;
    info?: number;
  };
}

export interface RuntimeConfigProfile {
  id?: string;
  label?: string;
  description?: string;
  recommended_ai_stack?: string | null;
  override_count?: number;
}

export type SetupStatus = SharedSetupStatus;

export interface SetupStatusPayload extends SharedSetupStatusPayload {
  error?: string;
  detail?: string | string[];
}

export interface RuntimeLocalGpuSelection {
  requested?: boolean;
  requested_profile?: string | null;
  status?: string | null;
  selection_source?: string | null;
  profile_id?: string | null;
  profile_label?: string | null;
  verification_status?: string | null;
  detected_vram_gb?: number | null;
  manual_vram_gb?: number | null;
  chat_model?: string | null;
  embedding_mode?: string | null;
  embedding_model?: string | null;
  message?: string | null;
  notes?: string[];
}

export interface RuntimeConfigDiagnosticsProfile {
  value?: string;
  label?: string;
  description?: string;
  recommended_ai_stack?: string | null;
  source?: string;
  env_var?: string | null;
}

export interface RuntimeConfigDiagnosticsOverride {
  field?: string;
  source?: string;
  env_var?: string | null;
}

export interface RuntimeConfigDiagnostics {
  profile?: RuntimeConfigDiagnosticsProfile;
  profile_overrides?: RuntimeConfigDiagnosticsOverride[];
}

export interface TurnDebugPayload extends SessionDebugPayload {
  request_id?: string | null;
  turn?: Record<string, unknown> | null;
}

export interface StateApiResponse {
  player?: PlayerState | null;
  debug?: SessionDebugPayload;
  error?: string;
  detail?: string | string[];
}

export interface AssistApiResponse {
  corrections?: Array<{ token: string; suggestions: string[] }>;
  completions?: string[];
}

export interface TurnApiResponse extends StateApiResponse {
  narrative?: string;
  player_options?: string[];
  state_updates?: Record<string, unknown>;
  director_updates?: Record<string, unknown>;
  debug?: TurnDebugPayload;
}
