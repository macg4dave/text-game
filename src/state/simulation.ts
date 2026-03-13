import type { Player, QuestSpec, StateUpdateProposal, TurnOutputPayload } from "../core/types.js";
import { requirementsMet } from "../story/director.js";
import {
  collectQuestStageUnlockRules,
  listReachableQuestLocations,
  resolveQuestUpdates
} from "../story/quest.js";

export interface ResolveSimulationStateUpdatesParams {
  player: Player;
  proposed: TurnOutputPayload["state_updates"];
  questSpec: QuestSpec;
}

export function resolveSimulationStateUpdates({
  player,
  proposed,
  questSpec
}: ResolveSimulationStateUpdatesParams): StateUpdateProposal {
  const proposedInventoryAdd = uniqueStrings(proposed.inventory_add);
  const proposedInventoryRemove = uniqueStrings(proposed.inventory_remove);
  const proposedFlagsAdd = uniqueStrings(proposed.flags_add);
  const proposedFlagsRemove = uniqueStrings(proposed.flags_remove);
  const questUnlockRules = collectQuestStageUnlockRules(questSpec);
  const protectedQuestFlags = new Set(questUnlockRules.keys());

  const acceptedInventoryAdd = proposedInventoryAdd.filter(
    (item) => !player.inventory.includes(item) && !proposedInventoryRemove.includes(item)
  );
  const acceptedInventoryRemove = proposedInventoryRemove.filter(
    (item) => player.inventory.includes(item) && !acceptedInventoryAdd.includes(item)
  );

  const acceptedGeneralFlagsAdd = proposedFlagsAdd.filter(
    (flag) => !protectedQuestFlags.has(flag) && !player.flags.includes(flag) && !proposedFlagsRemove.includes(flag)
  );
  const acceptedFlagsRemove = proposedFlagsRemove.filter(
    (flag) => player.flags.includes(flag) && !acceptedGeneralFlagsAdd.includes(flag) && !protectedQuestFlags.has(flag)
  );

  const baseFlags = applyAcceptedFlags(player.flags, acceptedGeneralFlagsAdd, acceptedFlagsRemove);
  const acceptedLocation = resolveAcceptedLocation({
    currentLocation: player.location,
    proposedLocation: proposed.location,
    questSpec,
    flags: baseFlags
  });

  const acceptedProgressionFlagsAdd = proposedFlagsAdd.filter((flag) => {
    const rule = questUnlockRules.get(flag);
    if (!rule) {
      return false;
    }

    if (player.flags.includes(flag) || proposedFlagsRemove.includes(flag)) {
      return false;
    }

    if (!requirementsMet(rule.required_flags, baseFlags)) {
      return false;
    }

    return isStageLocationSatisfied(rule.location_hint, player.location, acceptedLocation);
  });

  const acceptedFlagsAdd = [...acceptedGeneralFlagsAdd, ...acceptedProgressionFlagsAdd];
  const nextFlags = applyAcceptedFlags(player.flags, acceptedFlagsAdd, acceptedFlagsRemove);
  const resolvedQuestSnapshot = resolveQuestUpdates({
    questSpec,
    existingQuests: player.quests,
    flags: nextFlags
  });
  const acceptedQuestUpdates = resolvedQuestSnapshot.filter((quest) => {
    const existing = player.quests.find((item) => item.id === quest.id);
    return !existing || existing.status !== quest.status || existing.summary !== quest.summary;
  });

  return {
    location: acceptedLocation,
    inventory_add: acceptedInventoryAdd,
    inventory_remove: acceptedInventoryRemove,
    flags_add: acceptedFlagsAdd,
    flags_remove: acceptedFlagsRemove,
    quests: acceptedQuestUpdates
  };
}

function resolveAcceptedLocation({
  currentLocation,
  proposedLocation,
  questSpec,
  flags
}: {
  currentLocation: string;
  proposedLocation: string;
  questSpec: QuestSpec;
  flags: string[];
}): string {
  const trimmedLocation = proposedLocation.trim();
  if (!trimmedLocation || trimmedLocation === currentLocation) {
    return currentLocation;
  }

  const reachableLocations = listReachableQuestLocations(questSpec, flags);
  if (!reachableLocations.length) {
    return trimmedLocation;
  }

  return reachableLocations.includes(trimmedLocation) ? trimmedLocation : currentLocation;
}

function isStageLocationSatisfied(locationHint: string | null, currentLocation: string, acceptedLocation: string): boolean {
  if (!locationHint) {
    return true;
  }

  return locationHint === currentLocation || locationHint === acceptedLocation;
}

function applyAcceptedFlags(existingFlags: string[], flagsAdd: string[], flagsRemove: string[]): string[] {
  const nextFlags = new Set(existingFlags);
  flagsAdd.forEach((flag) => nextFlags.add(flag));
  flagsRemove.forEach((flag) => nextFlags.delete(flag));
  return Array.from(nextFlags);
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
