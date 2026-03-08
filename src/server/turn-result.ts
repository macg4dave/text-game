import type { Player, QuestUpdate, StateUpdates, TurnResult } from "../core/types.js";

export function sanitizeTurnResult(result: unknown, player: Player): TurnResult {
  const candidate = (result && typeof result === "object" ? result : {}) as Partial<TurnResult> & {
    state_updates?: Partial<StateUpdates>;
    director_updates?: Partial<TurnResult["director_updates"]>;
  };

  return {
    narrative: ensureString(candidate.narrative, "The world holds its breath."),
    player_options: ensureStringArray(candidate.player_options, 6),
    state_updates: {
      location: ensureString(candidate.state_updates?.location, player.location),
      inventory_add: ensureStringArray(candidate.state_updates?.inventory_add),
      inventory_remove: ensureStringArray(candidate.state_updates?.inventory_remove),
      flags_add: ensureStringArray(candidate.state_updates?.flags_add),
      flags_remove: ensureStringArray(candidate.state_updates?.flags_remove),
      quests: ensureQuestArray(candidate.state_updates?.quests)
    },
    director_updates: {
      end_goal_progress: ensureString(
        candidate.director_updates?.end_goal_progress,
        player.director_state.end_goal_progress
      )
    },
    memory_updates: ensureStringArray(candidate.memory_updates, 8)
  };
}

function ensureString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function ensureStringArray(value: unknown, max = 20): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string").slice(0, max);
}

function ensureQuestArray(value: unknown): QuestUpdate[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is { id: string; status?: string; summary?: string } =>
        Boolean(item) && typeof item === "object" && "id" in item && typeof item.id === "string"
    )
    .map((item) => ({
      id: item.id,
      status: typeof item.status === "string" ? item.status : "unknown",
      summary: typeof item.summary === "string" ? item.summary : ""
    }));
}
