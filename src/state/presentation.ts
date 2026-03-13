import type { AcceptedTurnConsequences, Player, TurnOutputPayload } from "../core/types.js";

export const DRIFT_RECONCILED_PLAYER_OPTIONS = [
  "Look around",
  "Check your gear",
  "Consider the next move"
] as const;

export interface ReconcileTurnPresentationParams {
  player: Player;
  proposedTurnOutput: TurnOutputPayload;
  acceptedConsequences: AcceptedTurnConsequences;
  nextPlayer: Player;
}

export function reconcileTurnPresentation({
  player,
  proposedTurnOutput,
  acceptedConsequences,
  nextPlayer
}: ReconcileTurnPresentationParams): TurnOutputPayload {
  if (!hasPresentationDrift(player, proposedTurnOutput, acceptedConsequences)) {
    return proposedTurnOutput;
  }

  return {
    ...proposedTurnOutput,
    narrative: buildCommittedNarrative(player, nextPlayer, acceptedConsequences),
    player_options: [...DRIFT_RECONCILED_PLAYER_OPTIONS]
  };
}

function hasPresentationDrift(
  player: Player,
  proposedTurnOutput: TurnOutputPayload,
  acceptedConsequences: AcceptedTurnConsequences
): boolean {
  return (
    hasStatePresentationDrift(player, proposedTurnOutput, acceptedConsequences) ||
    hasDirectorPresentationDrift(player, proposedTurnOutput, acceptedConsequences)
  );
}

function hasStatePresentationDrift(
  player: Player,
  proposedTurnOutput: TurnOutputPayload,
  acceptedConsequences: AcceptedTurnConsequences
): boolean {
  const acceptedStateUpdates = acceptedConsequences.state_updates;
  const proposedStateUpdates = proposedTurnOutput.state_updates;

  if (!acceptedStateUpdates) {
    return hasEffectiveProposedStateChange(player, proposedStateUpdates);
  }

  return !stateUpdatesEqual(proposedStateUpdates, acceptedStateUpdates);
}

function hasDirectorPresentationDrift(
  player: Player,
  proposedTurnOutput: TurnOutputPayload,
  acceptedConsequences: AcceptedTurnConsequences
): boolean {
  const acceptedDirectorUpdates = acceptedConsequences.director_updates;
  const proposedProgress = proposedTurnOutput.director_updates.end_goal_progress;

  if (!acceptedDirectorUpdates) {
    return proposedProgress !== player.director_state.end_goal_progress;
  }

  return acceptedDirectorUpdates.end_goal_progress !== proposedProgress;
}

function hasEffectiveProposedStateChange(player: Player, proposedStateUpdates: TurnOutputPayload["state_updates"]): boolean {
  return (
    proposedStateUpdates.location !== player.location ||
    proposedStateUpdates.inventory_add.length > 0 ||
    proposedStateUpdates.inventory_remove.length > 0 ||
    proposedStateUpdates.flags_add.length > 0 ||
    proposedStateUpdates.flags_remove.length > 0 ||
    proposedStateUpdates.quests.length > 0
  );
}

function stateUpdatesEqual(
  left: TurnOutputPayload["state_updates"],
  right: NonNullable<AcceptedTurnConsequences["state_updates"]>
): boolean {
  return (
    left.location === right.location &&
    arraysEqual(left.inventory_add, right.inventory_add) &&
    arraysEqual(left.inventory_remove, right.inventory_remove) &&
    arraysEqual(left.flags_add, right.flags_add) &&
    arraysEqual(left.flags_remove, right.flags_remove) &&
    questsEqual(left.quests, right.quests)
  );
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function questsEqual(
  left: TurnOutputPayload["state_updates"]["quests"],
  right: NonNullable<AcceptedTurnConsequences["state_updates"]>["quests"]
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (quest, index) =>
        quest.id === right[index]?.id &&
        quest.status === right[index]?.status &&
        quest.summary === right[index]?.summary
    )
  );
}

function buildCommittedNarrative(
  player: Player,
  _nextPlayer: Player,
  acceptedConsequences: AcceptedTurnConsequences
): string {
  const sentences: string[] = [];
  const acceptedStateUpdates = acceptedConsequences.state_updates;

  if (acceptedStateUpdates?.location && acceptedStateUpdates.location !== player.location) {
    sentences.push(`You make it to ${acceptedStateUpdates.location}.`);
  }

  if (acceptedStateUpdates?.inventory_add.length) {
    sentences.push(`You gain ${formatList(acceptedStateUpdates.inventory_add)}.`);
  }

  if (acceptedStateUpdates?.inventory_remove.length) {
    sentences.push(`You lose ${formatList(acceptedStateUpdates.inventory_remove)}.`);
  }

  if (acceptedConsequences.director_updates?.end_goal_progress) {
    sentences.push(acceptedConsequences.director_updates.end_goal_progress);
  }

  if (!sentences.length && acceptedConsequences.memory_updates.length) {
    sentences.push("The moment leaves a clear impression.");
  }

  if (!sentences.length) {
    return buildNoCommitNarrative(player);
  }

  return sentences.join(" ");
}

function buildNoCommitNarrative(player: Player): string {
  const lead = getCurrentLead(player);
  if (lead) {
    return `You pause in ${player.location} and take stock. The clearest lead is still to ${lead}.`;
  }

  return `You pause in ${player.location} and take stock, but nothing else changes yet.`;
}

function getCurrentLead(player: Player): string | null {
  const beatLabel = player.director_state.current_beat_label?.trim();
  if (beatLabel) {
    return lowerCaseFirstCharacter(beatLabel.replace(/[.]+$/, ""));
  }

  const questSummary = player.quests[0]?.summary?.trim();
  if (questSummary) {
    return lowerCaseFirstCharacter(questSummary.replace(/[.]+$/, ""));
  }

  return null;
}

function formatList(values: string[]): string {
  if (values.length === 1) {
    return values[0] ?? "";
  }

  if (values.length === 2) {
    return `${values[0] ?? ""} and ${values[1] ?? ""}`;
  }

  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1) ?? ""}`;
}

function lowerCaseFirstCharacter(value: string): string {
  if (!value) {
    return value;
  }

  return value.charAt(0).toLowerCase() + value.slice(1);
}
