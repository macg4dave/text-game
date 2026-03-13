import type { Player } from "../core/types.js";
import { loadSceneGroundingSpec } from "./scene-grounding.js";

export interface ExploratoryFallbackPresentation {
  narrative: string;
  playerOptions: string[];
}

type SceneGroundingLocation = ReturnType<typeof loadSceneGroundingSpec>["locations"][number];
type SceneGroundingExit = NonNullable<SceneGroundingLocation["exits"]>[number];

export function buildExploratoryFallbackPresentation({
  player,
  input
}: {
  player: Player;
  input: string;
}): ExploratoryFallbackPresentation | null {
  const location = findLocationForPlayer(player);
  if (!location) {
    return null;
  }

  const trimmedInput = input.trim();
  if (!trimmedInput) {
    return null;
  }

  if (matchesSceneLook(trimmedInput, location)) {
    return {
      narrative: location.look_text,
      playerOptions: location.look_options ?? []
    };
  }

  if (!looksLikeMovementInput(trimmedInput)) {
    return null;
  }

  return buildMovementFallback(player, location, trimmedInput);
}

function buildMovementFallback(
  player: Player,
  location: SceneGroundingLocation,
  input: string
): ExploratoryFallbackPresentation | null {
  const normalizedInput = normalizeText(input);
  const exits = location.exits ?? [];
  const exitMatch = findBestExitMatch(exits, normalizedInput, "aliases", 3);
  if (exitMatch) {
    if (!hasRequiredFlags(player, exitMatch.required_flags)) {
      return {
        narrative:
          exitMatch.blocked_text ??
          `From ${location.name}, ${exitMatch.label} is not reachable yet. The immediate route still in reach is nearby.`,
        playerOptions: exitMatch.player_options ?? location.look_options ?? []
      };
    }

    return {
      narrative:
        exitMatch.hint_text ??
        `From ${location.name}, ${exitMatch.label} is a nearby route you can follow next.`,
      playerOptions: exitMatch.player_options ?? location.look_options ?? []
    };
  }

  const hintMatch = findBestExitMatch(exits, normalizedInput, "hint_aliases", 3);
  if (hintMatch) {
    return {
      narrative:
        hintMatch.hint_text ??
        `From ${location.name}, ${hintMatch.label} is the clearest nearby route if that is where you mean to go.`,
      playerOptions: hintMatch.player_options ?? location.look_options ?? []
    };
  }

  return null;
}

function findLocationForPlayer(player: Player): SceneGroundingLocation | null {
  const normalizedLocation = normalizeText(player.location);
  return (
    loadSceneGroundingSpec().locations.find((location) => {
      const aliases = [location.name, ...(location.aliases ?? [])];
      return aliases.some((alias) => normalizeText(alias) === normalizedLocation);
    }) ?? null
  );
}

function matchesSceneLook(input: string, location: SceneGroundingLocation): boolean {
  const normalizedInput = normalizeText(input);
  if (["look", "look around", "look about", "survey", "scan"].includes(normalizedInput)) {
    return true;
  }

  if (/^(tell me more about|describe)\b/i.test(input)) {
    const topic = normalizeText(input.replace(/^(tell me more about|describe)\b/i, ""));
    const locationAliases = [location.name, ...(location.aliases ?? [])].map(normalizeText);
    return locationAliases.some((alias) => alias === topic || topic.includes(alias));
  }

  return false;
}

function looksLikeMovementInput(input: string): boolean {
  if (/\b(?:ask|tell|explain|inspect|search|use|talk|say)\b/i.test(input)) {
    return false;
  }

  if (/\b(?:and|before|after|while|then|because)\b/i.test(input)) {
    return false;
  }

  return /^(?:go|head|walk|move|travel|return|take|step|climb|leave)\b/i.test(input) ||
    ["down", "go down", "head down", "stairs", "stairwell"].includes(normalizeText(input));
}

function findBestExitMatch(
  exits: SceneGroundingExit[],
  input: string,
  aliasKey: "aliases" | "hint_aliases",
  minimumScore: number
): SceneGroundingExit | null {
  const scored = exits
    .map((exit) => ({
      exit,
      score: scoreAliasMatch(input, exit[aliasKey] ?? [])
    }))
    .filter((entry) => entry.score >= minimumScore)
    .sort((left, right) => right.score - left.score);

  return scored[0]?.exit ?? null;
}

function scoreAliasMatch(reference: string, aliases: string[]): number {
  const normalizedReference = normalizeText(reference);
  let bestScore = 0;

  for (const alias of aliases) {
    const normalizedAlias = normalizeText(alias);
    if (!normalizedAlias) {
      continue;
    }

    if (normalizedReference === normalizedAlias) {
      bestScore = Math.max(bestScore, 4);
      continue;
    }

    if (normalizedReference.includes(normalizedAlias)) {
      bestScore = Math.max(bestScore, 3);
      continue;
    }

    if (normalizedAlias.includes(normalizedReference)) {
      bestScore = Math.max(bestScore, 2);
    }
  }

  return bestScore;
}

function hasRequiredFlags(player: Player, requiredFlags: string[] | undefined): boolean {
  return (requiredFlags ?? []).every((flag) => player.flags.includes(flag));
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/["'“”‘’.,!?]/g, " ")
    .replace(/\b(?:the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}