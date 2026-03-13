import {
  AUTHORITATIVE_STATE_SCHEMA_VERSION,
  type DeterministicStateReducerInput,
  type DeterministicStateReducerResult,
  type DirectorState,
  type Player,
  type QuestUpdate
} from "../core/types.js";

export function reduceCommittedPlayerState({
  player,
  acceptedConsequences,
  resolvedDirectorState
}: DeterministicStateReducerInput): DeterministicStateReducerResult {
  const reducedPlayer = clonePlayer(player);

  if (acceptedConsequences.state_updates) {
    reducedPlayer.location = acceptedConsequences.state_updates.location || reducedPlayer.location;
    reducedPlayer.inventory = mergeList(
      reducedPlayer.inventory,
      acceptedConsequences.state_updates.inventory_add,
      acceptedConsequences.state_updates.inventory_remove
    );
    reducedPlayer.flags = mergeList(
      reducedPlayer.flags,
      acceptedConsequences.state_updates.flags_add,
      acceptedConsequences.state_updates.flags_remove
    );
    reducedPlayer.quests = mergeQuests(reducedPlayer.quests, acceptedConsequences.state_updates.quests);
  }

  if (resolvedDirectorState) {
    reducedPlayer.director_state = cloneDirectorState(resolvedDirectorState);
  } else if (acceptedConsequences.director_updates) {
    reducedPlayer.director_state = {
      ...cloneDirectorState(reducedPlayer.director_state),
      end_goal_progress: acceptedConsequences.director_updates.end_goal_progress
    };
  }

  if (acceptedConsequences.memory_updates.length) {
    const summaryLines = reducedPlayer.summary ? reducedPlayer.summary.split("\n").filter(Boolean) : [];
    const summaryUpdates = selectSummaryUpdates(acceptedConsequences);
    if (summaryUpdates.length) {
      reducedPlayer.summary = [...summaryLines, ...summaryUpdates].slice(-30).join("\n");
    }
  }

  return {
    player: reducedPlayer,
    authoritativePlayer: {
      schema_version: AUTHORITATIVE_STATE_SCHEMA_VERSION,
      ...reducedPlayer
    },
    changed: hasAcceptedConsequences(acceptedConsequences) || Boolean(resolvedDirectorState)
  };
}

function hasAcceptedConsequences(input: DeterministicStateReducerInput["acceptedConsequences"]): boolean {
  return Boolean(input.state_updates || input.director_updates || input.memory_updates.length);
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
    director_state: cloneDirectorState(player.director_state)
  };
}

function cloneDirectorState(directorState: DirectorState): DirectorState {
  return {
    ...directorState,
    completed_beats: [...directorState.completed_beats]
  };
}

function selectSummaryUpdates(acceptedConsequences: DeterministicStateReducerInput["acceptedConsequences"]): string[] {
  const hasConcreteStateChange = Boolean(
    acceptedConsequences.state_updates &&
    (
      acceptedConsequences.state_updates.location ||
      acceptedConsequences.state_updates.inventory_add.length ||
      acceptedConsequences.state_updates.inventory_remove.length ||
      acceptedConsequences.state_updates.flags_add.length ||
      acceptedConsequences.state_updates.flags_remove.length ||
      acceptedConsequences.state_updates.quests.length
    )
  );

  return acceptedConsequences.memory_updates.filter((memory) => shouldPromoteMemoryToSummary(memory, hasConcreteStateChange));
}

function shouldPromoteMemoryToSummary(memory: string, hasConcreteStateChange: boolean): boolean {
  const trimmed = memory.trim();
  if (!trimmed) {
    return false;
  }

  if (!hasConcreteStateChange) {
    return true;
  }

  return !/^(?:the player|you)\b/i.test(trimmed);
}
