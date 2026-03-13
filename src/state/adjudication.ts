import type {
  AcceptedTurnConsequences,
  DirectorSpec,
  DirectorState,
  Player,
  QuestSpec,
  StateUpdateProposal,
  TurnAdjudicationResult,
  TurnOutputPayload
} from "../core/types.js";
import { applyDirectorRules } from "../story/director.js";
import { resolveSimulationStateUpdates } from "./simulation.js";

const MAX_ADMITTED_MEMORY_UPDATES = 8;

export interface AdjudicateTurnOutputParams {
  player: Player;
  turnOutput: TurnOutputPayload;
  directorSpec: DirectorSpec;
  questSpec: QuestSpec;
}

export interface ResolveDirectorStateFromAcceptedConsequencesParams {
  player: Player;
  directorSpec: DirectorSpec;
  acceptedConsequences: AcceptedTurnConsequences;
}

export function adjudicateTurnOutput({
  player,
  turnOutput,
  directorSpec,
  questSpec
}: AdjudicateTurnOutputParams): TurnAdjudicationResult {
  const acceptedStateUpdates = adjudicateStateUpdates(player, turnOutput.state_updates, questSpec);
  const hasAcceptedStateChange = hasEffectiveStateChange(player, acceptedStateUpdates);
  const resolvedDirectorStateWithoutProgress = resolveDirectorStateFromAcceptedConsequences({
    player,
    directorSpec,
    acceptedConsequences: {
      state_updates: acceptedStateUpdates,
      director_updates: null,
      memory_updates: []
    }
  });
  const hasDirectorChange = Boolean(resolvedDirectorStateWithoutProgress);

  const acceptedDirectorUpdates = hasAcceptedStateChange || hasDirectorChange
    ? {
        end_goal_progress: turnOutput.director_updates.end_goal_progress
      }
    : null;

  const resolvedDirectorState = resolveDirectorStateFromAcceptedConsequences({
    player,
    directorSpec,
    acceptedConsequences: {
      state_updates: hasAcceptedStateChange ? acceptedStateUpdates : null,
      director_updates: acceptedDirectorUpdates,
      memory_updates: []
    }
  });

  const admittedMemoryUpdates = admitMemoryUpdates({
    player,
    proposedMemoryUpdates: turnOutput.memory_updates,
    hasAcceptedStateChange,
    hasDirectorChange
  });

  return {
    acceptedConsequences: {
      state_updates: hasAcceptedStateChange ? acceptedStateUpdates : null,
      director_updates: acceptedDirectorUpdates,
      memory_updates: admittedMemoryUpdates
    },
    resolvedDirectorState
  };
}

export function resolveDirectorStateFromAcceptedConsequences({
  player,
  directorSpec,
  acceptedConsequences
}: ResolveDirectorStateFromAcceptedConsequencesParams): DirectorState | undefined {
  const stateUpdates = acceptedConsequences.state_updates;
  const proposedDirectorUpdates = acceptedConsequences.director_updates;

  if (!stateUpdates && !proposedDirectorUpdates) {
    return undefined;
  }

  const normalizedStateUpdates = stateUpdates ?? createNoOpStateUpdates(player.location);
  const nextFlags = applyAcceptedFlags(player, normalizedStateUpdates);
  const nextDirectorState = applyDirectorRules({
    spec: directorSpec,
    directorState: player.director_state,
    stateUpdates: normalizedStateUpdates,
    flags: nextFlags
  });

  const progress = proposedDirectorUpdates?.end_goal_progress ?? player.director_state.end_goal_progress;
  const resolvedDirectorState = {
    ...nextDirectorState,
    end_goal_progress: progress
  };

  if (directorStatesEqual(player.director_state, resolvedDirectorState)) {
    return undefined;
  }

  return resolvedDirectorState;
}

function adjudicateStateUpdates(
  player: Player,
  proposed: TurnOutputPayload["state_updates"],
  questSpec: QuestSpec
): StateUpdateProposal {
  return resolveSimulationStateUpdates({
    player,
    proposed,
    questSpec
  });
}

function applyAcceptedFlags(player: Player, stateUpdates: StateUpdateProposal): string[] {
  const nextFlags = new Set(player.flags);
  stateUpdates.flags_add.forEach((flag) => nextFlags.add(flag));
  stateUpdates.flags_remove.forEach((flag) => nextFlags.delete(flag));
  return Array.from(nextFlags);
}

function admitMemoryUpdates({
  player,
  proposedMemoryUpdates,
  hasAcceptedStateChange,
  hasDirectorChange
}: {
  player: Player;
  proposedMemoryUpdates: string[];
  hasAcceptedStateChange: boolean;
  hasDirectorChange: boolean;
}): string[] {
  if (!hasAcceptedStateChange && !hasDirectorChange) {
    return [];
  }

  const existingSummaryLines = new Set(player.summary.split("\n").map((line) => line.trim()).filter(Boolean));
  const admitted: string[] = [];

  for (const memory of uniqueStrings(proposedMemoryUpdates)) {
    if (existingSummaryLines.has(memory)) {
      continue;
    }

    admitted.push(memory);
    if (admitted.length >= MAX_ADMITTED_MEMORY_UPDATES) {
      break;
    }
  }

  return admitted;
}

function hasEffectiveStateChange(player: Player, stateUpdates: StateUpdateProposal): boolean {
  return (
    stateUpdates.location !== player.location ||
    stateUpdates.inventory_add.length > 0 ||
    stateUpdates.inventory_remove.length > 0 ||
    stateUpdates.flags_add.length > 0 ||
    stateUpdates.flags_remove.length > 0 ||
    stateUpdates.quests.length > 0
  );
}

function createNoOpStateUpdates(location: string): StateUpdateProposal {
  return {
    location,
    inventory_add: [],
    inventory_remove: [],
    flags_add: [],
    flags_remove: [],
    quests: []
  };
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    unique.push(trimmed);
  }

  return unique;
}

function directorStatesEqual(left: DirectorState, right: DirectorState): boolean {
  return (
    left.end_goal === right.end_goal &&
    left.current_act_id === right.current_act_id &&
    left.current_act === right.current_act &&
    left.current_beat_id === right.current_beat_id &&
    left.current_beat_label === right.current_beat_label &&
    left.story_beats_remaining === right.story_beats_remaining &&
    left.end_goal_progress === right.end_goal_progress &&
    left.completed_beats.length === right.completed_beats.length &&
    left.completed_beats.every((beatId, index) => beatId === right.completed_beats[index])
  );
}