import type { AcceptedTurnConsequences, Player, TurnOutputPayload } from "../core/types.js";
import { buildExploratoryFallbackPresentation } from "./exploratory-fallback.js";

export const DRIFT_RECONCILED_PLAYER_OPTIONS = [
  "Look around",
  "Check your gear",
  "Consider the next move"
] as const;

export interface ReconcileTurnPresentationParams {
  player: Player;
  input: string;
  proposedTurnOutput: TurnOutputPayload;
  acceptedConsequences: AcceptedTurnConsequences;
  nextPlayer: Player;
}

export function reconcileTurnPresentation({
  player,
  input,
  proposedTurnOutput,
  acceptedConsequences,
  nextPlayer
}: ReconcileTurnPresentationParams): TurnOutputPayload {
  const exploratoryFallback = buildExploratoryFallbackPresentation({
    player,
    input
  });

  if (shouldUseExploratoryFallback(proposedTurnOutput, acceptedConsequences, exploratoryFallback)) {
    return {
      ...proposedTurnOutput,
      narrative: exploratoryFallback.narrative,
      player_options: exploratoryFallback.playerOptions
    };
  }

  if (!hasPresentationDrift(player, proposedTurnOutput, acceptedConsequences, nextPlayer)) {
    return proposedTurnOutput;
  }

  return {
    ...proposedTurnOutput,
    narrative: buildCommittedNarrative(player, nextPlayer, acceptedConsequences),
    player_options: [...DRIFT_RECONCILED_PLAYER_OPTIONS]
  };
}

function shouldUseExploratoryFallback(
  proposedTurnOutput: TurnOutputPayload,
  acceptedConsequences: AcceptedTurnConsequences,
  exploratoryFallback: ReturnType<typeof buildExploratoryFallbackPresentation>
): exploratoryFallback is NonNullable<ReturnType<typeof buildExploratoryFallbackPresentation>> {
  if (!exploratoryFallback) {
    return false;
  }

  if (acceptedConsequences.state_updates || acceptedConsequences.director_updates || acceptedConsequences.memory_updates.length) {
    return false;
  }

  const narrative = proposedTurnOutput.narrative.trim();
  if (!narrative) {
    return true;
  }

  return /^you pause in\b/i.test(narrative) || /nothing else changes yet/i.test(narrative);
}

function hasPresentationDrift(
  player: Player,
  proposedTurnOutput: TurnOutputPayload,
  acceptedConsequences: AcceptedTurnConsequences,
  nextPlayer: Player
): boolean {
  return (
    hasStatePresentationDrift(player, proposedTurnOutput, acceptedConsequences) ||
    hasDirectorPresentationDrift(player, proposedTurnOutput, acceptedConsequences) ||
    hasWeakAcceptedNarrative(proposedTurnOutput, acceptedConsequences, nextPlayer)
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
  nextPlayer: Player,
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

  if (!sentences.length && hasStructuralStateChange(acceptedStateUpdates) && acceptedConsequences.memory_updates.length) {
    sentences.push(acceptedConsequences.memory_updates[0] ?? "");
  }

  const progressSentence = buildCommittedProgressSentence(nextPlayer, acceptedConsequences);
  if (progressSentence) {
    sentences.push(progressSentence);
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

function hasWeakAcceptedNarrative(
  proposedTurnOutput: TurnOutputPayload,
  acceptedConsequences: AcceptedTurnConsequences,
  nextPlayer: Player
): boolean {
  const narrative = proposedTurnOutput.narrative.trim();
  if (!narrative) {
    return false;
  }

  const hasAcceptedChanges = Boolean(
    acceptedConsequences.state_updates || acceptedConsequences.director_updates || acceptedConsequences.memory_updates.length
  );
  if (!hasAcceptedChanges) {
    return false;
  }

  if (/^next step:/i.test(narrative)) {
    return true;
  }

  const proposedProgress = proposedTurnOutput.director_updates.end_goal_progress.trim();
  if (proposedProgress && narrative === proposedProgress) {
    return true;
  }

  const derivedProgress = buildCommittedProgressSentence(nextPlayer, acceptedConsequences);
  return Boolean(derivedProgress && /^next step:/i.test(proposedProgress) && proposedProgress !== derivedProgress);
}

function hasStructuralStateChange(stateUpdates: AcceptedTurnConsequences["state_updates"]): boolean {
  return Boolean(
    stateUpdates &&
    (stateUpdates.flags_add.length ||
      stateUpdates.flags_remove.length ||
      stateUpdates.quests.length)
  );
}

function buildCommittedProgressSentence(
  nextPlayer: Player,
  acceptedConsequences: AcceptedTurnConsequences
): string | null {
  if (acceptedConsequences.state_updates?.quests.length) {
    const nextQuestSummary = nextPlayer.quests[0]?.summary?.trim();
    if (nextQuestSummary) {
      return normalizeNextStep(nextQuestSummary);
    }
  }

  const acceptedProgress = acceptedConsequences.director_updates?.end_goal_progress?.trim();
  if (acceptedProgress) {
    return acceptedProgress;
  }

  return null;
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

function normalizeNextStep(value: string): string {
  const trimmed = value.trim().replace(/[.]+$/u, "");
  if (!trimmed) {
    return "";
  }

  if (/^next step:/i.test(trimmed)) {
    return `${trimmed}.`;
  }

  return `Next step: ${trimmed}.`;
}
