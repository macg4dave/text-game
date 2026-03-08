import type { CanonicalTurnEventPayload, Player, QuestUpdate, StateUpdateProposal } from "../core/types.js";

export interface ReplayCommittedTurnEventsParams {
  initialPlayer: Player;
  events: CanonicalTurnEventPayload[];
}

export function replayCommittedTurnEvents({ initialPlayer, events }: ReplayCommittedTurnEventsParams): Player {
  let player = clonePlayer(initialPlayer);

  for (const event of events) {
    if (event.event_kind !== "turn-resolution" || event.outcome.status !== "accepted") {
      continue;
    }

    if (event.committed.state_updates) {
      player = applyStateUpdates(player, event.committed.state_updates);
    }

    if (event.committed.director_updates) {
      player = {
        ...player,
        director_state: {
          ...player.director_state,
          end_goal_progress: event.committed.director_updates.end_goal_progress
        }
      };
    }

    if (event.committed.memory_updates.length) {
      const summaryLines = player.summary ? player.summary.split("\n").filter(Boolean) : [];
      player = {
        ...player,
        summary: [...summaryLines, ...event.committed.memory_updates].slice(-30).join("\n")
      };
    }
  }

  return player;
}

function applyStateUpdates(player: Player, updates: StateUpdateProposal): Player {
  return {
    ...player,
    location: updates.location || player.location,
    inventory: mergeList(player.inventory, updates.inventory_add, updates.inventory_remove),
    flags: mergeList(player.flags, updates.flags_add, updates.flags_remove),
    quests: mergeQuests(player.quests, updates.quests)
  };
}

function mergeList(existing: string[], addList: string[] = [], removeList: string[] = []): string[] {
  const set = new Set(existing);
  addList.forEach((item) => set.add(item));
  removeList.forEach((item) => set.delete(item));
  return Array.from(set);
}

function mergeQuests(existing: QuestUpdate[], updates: QuestUpdate[] = []): QuestUpdate[] {
  const byId = new Map(existing.map((quest) => [quest.id, quest]));
  updates.forEach((quest) => {
    byId.set(quest.id, quest);
  });
  return Array.from(byId.values());
}

function clonePlayer(player: Player): Player {
  return {
    ...player,
    inventory: [...player.inventory],
    flags: [...player.flags],
    quests: player.quests.map((quest) => ({ ...quest })),
    director_state: {
      ...player.director_state,
      completed_beats: [...player.director_state.completed_beats]
    }
  };
}
