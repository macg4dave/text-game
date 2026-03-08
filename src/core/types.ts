export type SupportedAiProvider = "openai-compatible" | "litellm" | "ollama";
export type SupportedAiProfile = "local-gpu-small" | "local-gpu-large" | "custom";
export type RecommendedAiStack = "local-gpu";

export interface ConfigError {
  path: string;
  message: string;
  envVars: string[];
  code: string;
}

export interface ValidationResult<TError = string> {
  ok: boolean;
  errors: TError[];
}

export const TURN_INPUT_SCHEMA_VERSION = "turn-input/v1";
export const TURN_OUTPUT_SCHEMA_VERSION = "turn-output/v1";
export const AUTHORITATIVE_STATE_SCHEMA_VERSION = "authoritative-state/v1";
export const COMMITTED_EVENT_SCHEMA_VERSION = "committed-event/v1";

export interface TurnInputPayload {
  schema_version: typeof TURN_INPUT_SCHEMA_VERSION;
  input: string;
  player_id?: string;
  player_name?: string;
}

export interface AiConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  chatModel: string;
  embeddingModel: string;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LoggingConfig {
  level: LogLevel;
}

export interface ConfigProfile {
  id: SupportedAiProfile;
  label: string;
  description: string;
  recommendedAiStack: RecommendedAiStack | null;
}

export interface ConfigProfileSelection extends ConfigProfile {
  source: "env" | "default" | "invalid-env";
  envVar: string | null;
}

export interface PublicRuntimeValidationError {
  path: string;
  message: string;
  env_vars: string[];
}

export type RuntimePreflightSeverity = "blocker" | "warning" | "info";
export type RuntimePreflightArea = "config" | "ai" | "host" | "storage";
export type RuntimePreflightStatus = "ready" | "action-required" | "checking";

export interface RuntimePreflightIssueDetails {
  check?: string;
  provider?: string | null;
  config_path?: string | null;
  config_source?: string | null;
  probe_target?: string | null;
  http_status?: number | null;
  resolved_value?: string | number | boolean | null;
  available_models_preview?: string[];
  notes?: string[];
}

export interface RuntimePreflightIssue {
  code: string;
  severity: RuntimePreflightSeverity;
  area: RuntimePreflightArea;
  title: string;
  message: string;
  recovery: string[];
  recommended_fix: string | null;
  env_vars: string[];
  details?: RuntimePreflightIssueDetails;
}

export interface RuntimePreflightCounts {
  blocker: number;
  warning: number;
  info: number;
}

export interface RuntimePreflightReport {
  ok: boolean;
  status: RuntimePreflightStatus;
  summary: string;
  issues: RuntimePreflightIssue[];
  counts: RuntimePreflightCounts;
  checked_at: string | null;
}

export interface PublicRuntimeLocalGpuSelection {
  requested: boolean;
  requested_profile: SupportedAiProfile | "local-gpu-small" | "local-gpu-large" | null;
  status: string | null;
  selection_source: string | null;
  profile_id: string | null;
  profile_label: string | null;
  verification_status: string | null;
  detected_vram_gb: number | null;
  manual_vram_gb: number | null;
  chat_model: string | null;
  embedding_mode: string | null;
  embedding_model: string | null;
  message: string | null;
  notes: string[];
}

export interface PublicRuntimeConfig {
  port: number;
  provider: string;
  chat_model: string;
  embedding_model: string;
  base_url: string | null;
  api_key_configured: boolean;
  log_level: LogLevel;
  profile: {
    id: SupportedAiProfile;
    label: string;
    description: string;
    recommended_ai_stack: RecommendedAiStack | null;
    override_count: number;
  };
  local_gpu: PublicRuntimeLocalGpuSelection | null;
  validation: {
    ok: boolean;
    errors: PublicRuntimeValidationError[];
  };
}

export interface SetupSupportedPath {
  provider: string;
  title: string;
  summary: string;
  launcher: string;
  services: string[];
}

export interface SetupCurrentProfile {
  id: SupportedAiProfile;
  label: string;
  provider: string;
  chat_model: string;
  embedding_model: string;
}

export interface SetupStatus {
  status: RuntimePreflightStatus;
  summary: string;
  checked_at: string | null;
  can_retry: boolean;
  current_profile: SetupCurrentProfile;
  supported_path: SetupSupportedPath;
  config_diagnostics?: unknown;
  local_gpu?: PublicRuntimeLocalGpuSelection | null;
  preflight: RuntimePreflightReport;
}

export interface SetupStatusPayload {
  setup: SetupStatus;
}

export interface AppConfig {
  port: number;
  profile: ConfigProfileSelection;
  ai: AiConfig;
  logging: LoggingConfig;
  validation: ValidationResult<ConfigError>;
  runtime: PublicRuntimeConfig;
}

export type EnvSource = Record<string, string | undefined>;

export interface QuestUpdate {
  id: string;
  status: string;
  summary: string;
}

// Transitional type name retained for compatibility with the v1 wire payload.
// These fields are model proposals, not committed state.
export interface StateUpdateProposal {
  location: string;
  inventory_add: string[];
  inventory_remove: string[];
  flags_add: string[];
  flags_remove: string[];
  quests: QuestUpdate[];
}

export type StateUpdates = StateUpdateProposal;

// Transitional type name retained for compatibility with the v1 wire payload.
// These fields are model proposals, not authoritative director truth.
export interface DirectorUpdateProposal {
  end_goal_progress: string;
}

export type DirectorUpdates = DirectorUpdateProposal;

// Transitional v1 turn-output contract. The `*_updates` fields are proposal slots only.
// The contract stays compact and transport-oriented: no scene graph, world model,
// beat-state object, or other hidden gameplay schema belongs here.
// The authoritative truth returned to clients lives in the versioned `player` snapshot.
export interface TurnResult {
  narrative: string;
  player_options: string[];
  state_updates: StateUpdateProposal;
  director_updates: DirectorUpdateProposal;
  memory_updates: string[];
}

export interface TurnOutputPayload extends TurnResult {
  schema_version: typeof TURN_OUTPUT_SCHEMA_VERSION;
}

export interface DirectorBeat {
  id: string;
  label: string;
  required_flags?: string[];
  unlock_flags?: string[];
}

export interface DirectorAct {
  id: string;
  name: string;
  beats: DirectorBeat[];
}

export interface DirectorSpec {
  end_goal: string;
  acts: DirectorAct[];
  rules?: {
    max_beats_per_turn?: number;
  };
}

export interface DirectorState {
  end_goal: string;
  current_act_id: string;
  current_act: string;
  current_beat_id: string;
  current_beat_label: string;
  story_beats_remaining: number;
  end_goal_progress: string;
  completed_beats: string[];
}

export interface QuestStage {
  id: string;
  label: string;
  required_flags?: string[];
  unlock_flags?: string[];
}

export interface QuestDefinition {
  id: string;
  title: string;
  stages: QuestStage[];
}

export interface QuestSpec {
  quests: QuestDefinition[];
}

export interface Player {
  id: string;
  name: string;
  created_at: string;
  location: string;
  summary: string;
  director_state: DirectorState;
  inventory: string[];
  flags: string[];
  quests: QuestUpdate[];
}

export interface AuthoritativePlayerState extends Player {
  schema_version: typeof AUTHORITATIVE_STATE_SCHEMA_VERSION;
}

export interface StateResponsePayload {
  player: AuthoritativePlayerState;
}

export interface TurnResponsePayload extends TurnOutputPayload {
  player: AuthoritativePlayerState;
}

export type CanonicalEventKind = "turn-resolution";
export type CanonicalOutcomeStatus = "accepted" | "rejected";

export interface CanonicalEventAttempt {
  input: string;
}

export interface CanonicalEventOutcome {
  status: CanonicalOutcomeStatus;
  summary: string;
  rejection_reason: string | null;
}

export interface CanonicalEventCommittedChanges {
  state_updates: StateUpdateProposal | null;
  director_updates: DirectorUpdateProposal | null;
  memory_updates: string[];
}

export interface CanonicalEventContractVersions {
  turn_output: typeof TURN_OUTPUT_SCHEMA_VERSION;
  authoritative_state: typeof AUTHORITATIVE_STATE_SCHEMA_VERSION;
  ruleset: string;
}

export interface CanonicalEventTranscript {
  player_text: string | null;
  narrator_text: string | null;
}

export interface CanonicalEventPresentation {
  narrative: string | null;
  player_options: string[];
}

export interface CanonicalEventSupplemental {
  transcript?: CanonicalEventTranscript;
  presentation?: CanonicalEventPresentation;
  prompt?: unknown;
}

export interface CanonicalTurnEventPayload {
  schema_version: typeof COMMITTED_EVENT_SCHEMA_VERSION;
  event_kind: CanonicalEventKind;
  event_id: string;
  player_id: string;
  occurred_at: string;
  attempt: CanonicalEventAttempt;
  outcome: CanonicalEventOutcome;
  committed: CanonicalEventCommittedChanges;
  contract_versions: CanonicalEventContractVersions;
  supplemental?: CanonicalEventSupplemental;
}

export interface PlayerRow {
  id: string;
  name: string;
  created_at: string;
  location: string;
  summary: string;
  director_state: string;
  inventory: string;
  flags: string;
  quests: string;
}

export interface EventRow {
  role: string;
  content: string;
}

export interface MemoryRow {
  content: string;
  embedding: string | null;
}

export interface MemoryInsert {
  content: string;
  embedding?: number[];
}

export interface AssistCorrection {
  token: string;
  suggestions: string[];
}

export interface AssistResponse {
  corrections: AssistCorrection[];
  completions: string[];
}
