export type SupportedAiProvider = "openai-compatible" | "litellm" | "ollama";
export type SupportedAiProfile = "hosted-default" | "local-gpu-small" | "local-gpu-large" | "custom";
export type RecommendedAiStack = "hosted" | "local-gpu";

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

export interface StateUpdates {
  location: string;
  inventory_add: string[];
  inventory_remove: string[];
  flags_add: string[];
  flags_remove: string[];
  quests: QuestUpdate[];
}

export interface DirectorUpdates {
  end_goal_progress: string;
}

export interface TurnResult {
  narrative: string;
  player_options: string[];
  state_updates: StateUpdates;
  director_updates: DirectorUpdates;
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
