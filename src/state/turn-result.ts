import type { Player } from "../core/types.js";

export function sanitizeTurnResult(result: unknown, _player: Player): Record<string, unknown> {
  const candidate = (result && typeof result === "object" ? result : {}) as Record<string, unknown>;

  return {
    ...candidate,
    narrative: trimStringValue(candidate.narrative),
    player_options: sanitizeStringArrayCandidate(candidate.player_options),
    state_updates: sanitizeStateUpdatesCandidate(candidate.state_updates),
    director_updates: sanitizeDirectorUpdatesCandidate(candidate.director_updates),
    memory_updates: sanitizeStringArrayCandidate(candidate.memory_updates)
  };
}

function trimStringValue(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

function sanitizeStringArrayCandidate(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((item) => (typeof item === "string" ? item.trim() : item));
}

function sanitizeStateUpdatesCandidate(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }

  const candidate = value as Record<string, unknown>;
  return {
    ...candidate,
    location: trimStringValue(candidate.location),
    inventory_add: sanitizeStringArrayCandidate(candidate.inventory_add),
    inventory_remove: sanitizeStringArrayCandidate(candidate.inventory_remove),
    flags_add: sanitizeStringArrayCandidate(candidate.flags_add),
    flags_remove: sanitizeStringArrayCandidate(candidate.flags_remove),
    quests: sanitizeQuestUpdateArrayCandidate(candidate.quests)
  };
}

function sanitizeDirectorUpdatesCandidate(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }

  const candidate = value as Record<string, unknown>;
  return {
    ...candidate,
    end_goal_progress: trimStringValue(candidate.end_goal_progress)
  };
}

function sanitizeQuestUpdateArrayCandidate(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((item) => {
    if (!item || typeof item !== "object") {
      return item;
    }

    const candidate = item as Record<string, unknown>;
    return {
      ...candidate,
      id: trimStringValue(candidate.id),
      status: trimStringValue(candidate.status),
      summary: trimStringValue(candidate.summary)
    };
  });
}
