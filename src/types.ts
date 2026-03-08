export type SupportedAiProvider = "openai-compatible" | "litellm" | "ollama";

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

export interface AiConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  chatModel: string;
  embeddingModel: string;
}

export interface PublicRuntimeValidationError {
  path: string;
  message: string;
  env_vars: string[];
}

export interface PublicRuntimeConfig {
  port: number;
  provider: string;
  chat_model: string;
  embedding_model: string;
  base_url: string | null;
  api_key_configured: boolean;
  validation: {
    ok: boolean;
    errors: PublicRuntimeValidationError[];
  };
}

export interface AppConfig {
  port: number;
  ai: AiConfig;
  validation: ValidationResult<ConfigError>;
  runtime: PublicRuntimeConfig;
}

export type EnvSource = NodeJS.ProcessEnv | Record<string, string | undefined>;

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
