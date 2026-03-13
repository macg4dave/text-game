import fs from "node:fs";
import path from "node:path";
import type { Player, TurnResult } from "../core/types.js";

const SCENE_GROUNDING_PATH = path.resolve(process.cwd(), "data", "spec", "scene-grounding.json");

interface SceneGroundingSpec {
  locations: SceneGroundingLocation[];
}

interface SceneGroundingLocation {
  id: string;
  name: string;
  aliases?: string[];
  look_text: string;
  look_options?: string[];
  exits?: SceneGroundingExit[];
  default_focus_referent_id?: string;
  default_actor_referent_id?: string;
  anchors?: SceneGroundingReferent[];
  actors?: SceneGroundingActor[];
}

interface SceneGroundingExit {
  id: string;
  label: string;
  destination: string;
  aliases?: string[];
  hint_aliases?: string[];
  travel_text?: string;
  blocked_text?: string;
  hint_text?: string;
  player_options?: string[];
  required_flags?: string[];
}

interface SceneGroundingReferent {
  id: string;
  label: string;
  aliases?: string[];
  inspect_text: string;
  player_options?: string[];
  progress?: SceneGroundingProgress;
}

interface SceneGroundingActor extends SceneGroundingReferent {
  topics?: SceneGroundingTopic[];
}

interface SceneGroundingTopic {
  id: string;
  topic: string;
  aliases?: string[];
  response_text: string;
  blocked_text?: string;
  required_flags?: string[];
  player_options?: string[];
  progress?: SceneGroundingProgress;
}

interface SceneGroundingProgress {
  narrative: string;
  player_options?: string[];
  required_flags?: string[];
  flags_add?: string[];
  memory_updates?: string[];
  director_end_goal_progress?: string;
}

type SceneReferentMatch =
  | { kind: "scene"; location: SceneGroundingLocation }
  | { kind: "anchor"; location: SceneGroundingLocation; referent: SceneGroundingReferent }
  | { kind: "actor"; location: SceneGroundingLocation; referent: SceneGroundingActor };

interface TopicMatch {
  location: SceneGroundingLocation;
  actor: SceneGroundingActor;
  topic: SceneGroundingTopic;
}

let cachedSpec: SceneGroundingSpec | null = null;

export function loadSceneGroundingSpec(): SceneGroundingSpec {
  if (cachedSpec) {
    return cachedSpec;
  }

  const raw = fs.readFileSync(SCENE_GROUNDING_PATH, "utf-8");
  cachedSpec = JSON.parse(raw) as SceneGroundingSpec;
  return cachedSpec;
}

export function tryResolveSceneGroundingTurn({
  player,
  input,
  shortHistory
}: {
  player: Player;
  input: string;
  shortHistory: string[];
}): TurnResult | null {
  const location = findLocationForPlayer(player);
  if (!location) {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  if (matchesSceneLook(trimmed, location)) {
    return createStaticTurnResult({
      player,
      narrative: location.look_text,
      playerOptions: location.look_options ?? []
    });
  }

  if (looksLikeMovementInput(trimmed)) {
    const movementResult = buildMovementTurnResult(player, location, trimmed);
    if (movementResult) {
      return movementResult;
    }
  }

  const directQuestion = parseDirectQuestion(trimmed);
  if (directQuestion) {
    if (isReferentialPlaceholder(directQuestion.reference)) {
      const salientMatch = resolveSalientReferent({
        location,
        shortHistory,
        preferActor: directQuestion.kind === "who"
      });
      return salientMatch ? buildReferentTurnResult(player, salientMatch, { allowProgress: false }) : null;
    }

    const referentMatch = findReferentMatch(location, directQuestion.reference, { preferActor: directQuestion.kind === "who" });
    return referentMatch ? buildReferentTurnResult(player, referentMatch, { allowProgress: false }) : null;
  }

  const referentialFollowUp = parseReferentialFollowUp(trimmed);
  if (referentialFollowUp) {
    if (isReferentialPlaceholder(referentialFollowUp.reference)) {
      const salientMatch = resolveSalientReferent({
        location,
        shortHistory,
        preferActor: false
      });
      return salientMatch ? buildReferentTurnResult(player, salientMatch, { allowProgress: false }) : null;
    }

    const referentMatch = findReferentMatch(location, referentialFollowUp.reference, { preferActor: false });
    return referentMatch ? buildReferentTurnResult(player, referentMatch, { allowProgress: false }) : null;
  }

  const inspectReference = parseInspectReference(trimmed);
  if (inspectReference) {
    const referentMatch = findReferentMatch(location, inspectReference, { preferActor: false });
    return referentMatch ? buildReferentTurnResult(player, referentMatch, { allowProgress: true }) : null;
  }

  const askTopic = parseAskTopic(trimmed);
  if (askTopic) {
    const topicMatch = findTopicMatch(location, askTopic.target, askTopic.topic);
    return topicMatch ? buildTopicTurnResult(player, topicMatch) : null;
  }

  const powerQuestionTopic = parseContextualPowerQuestion(trimmed);
  if (powerQuestionTopic) {
    const inferredTarget = powerQuestionTopic.target ?? getDefaultActorLabel(location);
    const topicMatch = inferredTarget ? findTopicMatch(location, inferredTarget, powerQuestionTopic.topic) : null;
    return topicMatch ? buildTopicTurnResult(player, topicMatch) : null;
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

function parseDirectQuestion(input: string): { kind: "what" | "who"; reference: string } | null {
  const match = input.match(/^(what|who)(?:'s| is)\s+(.+?)[?.!]*$/i);
  if (!match) {
    return null;
  }

  return {
    kind: match[1]?.toLowerCase() === "who" ? "who" : "what",
    reference: match[2]?.trim() ?? ""
  };
}

function parseReferentialFollowUp(input: string): { reference: string } | null {
  const meaningMatch = input.match(/^what do you mean(?: by)?\s+(.+?)[?.!]*$/i);
  if (meaningMatch) {
    return { reference: meaningMatch[1]?.trim() ?? "" };
  }

  if (/^what do you mean[?.!]*$/i.test(input)) {
    return { reference: "that" };
  }

  const moreMatch = input.match(/^tell me more about\s+(.+?)[?.!]*$/i);
  if (moreMatch) {
    return { reference: moreMatch[1]?.trim() ?? "" };
  }

  return null;
}

function parseInspectReference(input: string): string | null {
  const match = input.match(/^(?:inspect|examine|check|study|look at)\s+(.+?)[?.!]*$/i);
  return match?.[1]?.trim() ?? null;
}

function parseAskTopic(input: string): { target: string | null; topic: string } | null {
  const targetedMatch = input.match(/^ask\s+(.+?)\s+about\s+(.+?)[?.!]*$/i);
  if (targetedMatch) {
    return {
      target: targetedMatch[1]?.trim() ?? null,
      topic: targetedMatch[2]?.trim() ?? ""
    };
  }

  const untargetedMatch = input.match(/^(?:ask about|what do you know about|tell me about)\s+(.+?)[?.!]*$/i);
  if (untargetedMatch) {
    return {
      target: null,
      topic: untargetedMatch[1]?.trim() ?? ""
    };
  }

  return null;
}

function parseContextualPowerQuestion(input: string): { target: string | null; topic: string } | null {
  const unwrappedInput = unwrapQuotedDialogue(input);
  if (/^where does (?:it|the relay) draw power(?: from)?[?.!]*$/i.test(unwrappedInput) || /^where is the relay drawing power[?.!]*$/i.test(unwrappedInput)) {
    return {
      target: null,
      topic: "Ghostlight Relay"
    };
  }

  const firstPersonAskMatch = input.match(/^i ask\s+(.+?)\s+where .*power(?:.*come.*|.*draw.*|.*from.*)[?.!]*$/i);
  if (firstPersonAskMatch) {
    return {
      target: firstPersonAskMatch[1]?.trim() ?? null,
      topic: "Ghostlight Relay"
    };
  }

  return null;
}

function getDefaultActorLabel(location: SceneGroundingLocation): string | null {
  if (location.default_actor_referent_id) {
    const defaultActor = (location.actors ?? []).find((actor) => actor.id === location.default_actor_referent_id);
    if (defaultActor) {
      return defaultActor.label;
    }
  }

  if ((location.actors ?? []).length === 1) {
    return location.actors?.[0]?.label ?? null;
  }

  return null;
}

function buildReferentTurnResult(
  player: Player,
  match: SceneReferentMatch,
  options: { allowProgress: boolean }
): TurnResult {
  if (match.kind === "scene") {
    return createStaticTurnResult({
      player,
      narrative: match.location.look_text,
      playerOptions: match.location.look_options ?? []
    });
  }

  const progress = options.allowProgress ? getAvailableProgress(player, match.referent.progress) : null;
  if (progress) {
    return createTurnResultWithProgress({
      player,
      narrative: progress.narrative,
      playerOptions: progress.player_options ?? match.referent.player_options ?? [],
      flagsAdd: progress.flags_add ?? [],
      memoryUpdates: progress.memory_updates ?? [],
      directorEndGoalProgress: progress.director_end_goal_progress ?? player.director_state.end_goal_progress
    });
  }

  return createStaticTurnResult({
    player,
    narrative: match.referent.inspect_text,
    playerOptions: match.referent.player_options ?? []
  });
}

function buildTopicTurnResult(player: Player, match: TopicMatch): TurnResult {
  const progress = getAvailableProgress(player, match.topic.progress);
  if (progress) {
    return createTurnResultWithProgress({
      player,
      narrative: progress.narrative,
      playerOptions: progress.player_options ?? match.topic.player_options ?? match.actor.player_options ?? [],
      flagsAdd: progress.flags_add ?? [],
      memoryUpdates: progress.memory_updates ?? [],
      directorEndGoalProgress: progress.director_end_goal_progress ?? player.director_state.end_goal_progress
    });
  }

  if (hasRequiredFlags(player, match.topic.required_flags)) {
    return createStaticTurnResult({
      player,
      narrative: match.topic.response_text,
      playerOptions: match.topic.player_options ?? match.actor.player_options ?? []
    });
  }

  return createStaticTurnResult({
    player,
    narrative: match.topic.blocked_text ?? match.topic.response_text,
    playerOptions: match.topic.player_options ?? match.actor.player_options ?? []
  });
}

function buildMovementTurnResult(
  player: Player,
  location: SceneGroundingLocation,
  input: string
): TurnResult | null {
  const normalizedInput = normalizeText(input);
  const exits = location.exits ?? [];
  const exitMatch = findBestExitMatch(exits, normalizedInput, "aliases", 3);
  if (exitMatch) {
    if (!hasRequiredFlags(player, exitMatch.required_flags)) {
      return createStaticTurnResult({
        player,
        narrative:
          exitMatch.blocked_text ??
          `You cannot reach ${exitMatch.label} from ${location.name} yet, but the immediate nearby route is still close at hand.`,
        playerOptions: exitMatch.player_options ?? location.look_options ?? []
      });
    }

    return createTravelTurnResult({
      player,
      destination: exitMatch.destination,
      narrative: exitMatch.travel_text ?? `You make your way to ${exitMatch.destination}.`,
      playerOptions: exitMatch.player_options ?? []
    });
  }

  const hintMatch = findBestExitMatch(exits, normalizedInput, "hint_aliases", 3);
  if (hintMatch) {
    return createStaticTurnResult({
      player,
      narrative:
        hintMatch.hint_text ??
        `From ${location.name}, ${hintMatch.label} is the clearest nearby route if that is where you mean to go.`,
      playerOptions: hintMatch.player_options ?? []
    });
  }

  return null;
}

function getAvailableProgress(player: Player, progress: SceneGroundingProgress | undefined): SceneGroundingProgress | null {
  if (!progress) {
    return null;
  }

  if (!hasRequiredFlags(player, progress.required_flags)) {
    return null;
  }

  if (!(progress.flags_add ?? []).some((flag) => !player.flags.includes(flag))) {
    return null;
  }

  return progress;
}

function findReferentMatch(
  location: SceneGroundingLocation,
  reference: string,
  options: { preferActor: boolean }
): SceneReferentMatch | null {
  const normalizedReference = normalizeText(reference);
  if (!normalizedReference) {
    return null;
  }

  const locationAliases = [location.name, ...(location.aliases ?? [])].map(normalizeText);
  if (locationAliases.some((alias) => alias === normalizedReference)) {
    return { kind: "scene", location };
  }

  const actorMatch = findBestReferentMatch(location.actors ?? [], normalizedReference);
  const anchorMatch = findBestReferentMatch(location.anchors ?? [], normalizedReference);

  if (options.preferActor) {
    return actorMatch
      ? { kind: "actor", location, referent: actorMatch }
      : anchorMatch
        ? { kind: "anchor", location, referent: anchorMatch }
        : null;
  }

  return anchorMatch
    ? { kind: "anchor", location, referent: anchorMatch }
    : actorMatch
      ? { kind: "actor", location, referent: actorMatch }
      : null;
}

function resolveSalientReferent({
  location,
  shortHistory,
  preferActor
}: {
  location: SceneGroundingLocation;
  shortHistory: string[];
  preferActor: boolean;
}): SceneReferentMatch | null {
  for (const line of [...shortHistory].reverse()) {
    const actorMatch = findBestReferentMatch(location.actors ?? [], normalizeText(line));
    const anchorMatch = findBestReferentMatch(location.anchors ?? [], normalizeText(line));

    if (preferActor) {
      if (actorMatch) {
        return { kind: "actor", location, referent: actorMatch };
      }
      if (anchorMatch) {
        return { kind: "anchor", location, referent: anchorMatch };
      }
    } else {
      if (anchorMatch) {
        return { kind: "anchor", location, referent: anchorMatch };
      }
      if (actorMatch) {
        return { kind: "actor", location, referent: actorMatch };
      }
    }
  }

  if (preferActor && location.default_actor_referent_id) {
    const actor = (location.actors ?? []).find((candidate) => candidate.id === location.default_actor_referent_id);
    if (actor) {
      return { kind: "actor", location, referent: actor };
    }
  }

  if (location.default_focus_referent_id) {
    const anchor = (location.anchors ?? []).find((candidate) => candidate.id === location.default_focus_referent_id);
    if (anchor) {
      return { kind: "anchor", location, referent: anchor };
    }
  }

  return null;
}

function findTopicMatch(location: SceneGroundingLocation, target: string | null, topic: string): TopicMatch | null {
  const normalizedTopic = normalizeText(topic);
  if (!normalizedTopic) {
    return null;
  }

  const candidateActors = target
    ? (location.actors ?? []).filter((actor) => matchesAliasSet(target, [actor.label, ...(actor.aliases ?? [])]))
    : location.actors ?? [];

  for (const actor of candidateActors) {
    for (const actorTopic of actor.topics ?? []) {
      if (matchesAliasSet(normalizedTopic, [actorTopic.topic, ...(actorTopic.aliases ?? [])], true)) {
        return {
          location,
          actor,
          topic: actorTopic
        };
      }
    }
  }

  return null;
}

function findBestReferentMatch<T extends SceneGroundingReferent>(candidates: T[], reference: string): T | null {
  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: scoreAliasMatch(reference, [candidate.label, ...(candidate.aliases ?? [])])
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  return scored[0]?.candidate ?? null;
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

function matchesAliasSet(value: string, aliases: string[], valueAlreadyNormalized = false): boolean {
  const normalizedValue = valueAlreadyNormalized ? value : normalizeText(value);
  return scoreAliasMatch(normalizedValue, aliases) > 0;
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

function hasRequiredFlags(player: Player, requiredFlags: string[] | undefined): boolean {
  return (requiredFlags ?? []).every((flag) => player.flags.includes(flag));
}

function isReferentialPlaceholder(reference: string): boolean {
  return ["that", "it", "this", "her", "him", "them"].includes(normalizeText(reference));
}

function unwrapQuotedDialogue(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/^["“](.+)["”][?.!]*$/u);
  return match?.[1]?.trim() ?? trimmed;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/["'“”‘’.,!?]/g, " ")
    .replace(/\b(?:the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createStaticTurnResult({
  player,
  narrative,
  playerOptions
}: {
  player: Player;
  narrative: string;
  playerOptions: string[];
}): TurnResult {
  return {
    narrative,
    player_options: playerOptions,
    state_updates: {
      location: player.location,
      inventory_add: [],
      inventory_remove: [],
      flags_add: [],
      flags_remove: [],
      quests: []
    },
    director_updates: {
      end_goal_progress: player.director_state.end_goal_progress
    },
    memory_updates: []
  };
}

function createTurnResultWithProgress({
  player,
  narrative,
  playerOptions,
  flagsAdd,
  memoryUpdates,
  directorEndGoalProgress
}: {
  player: Player;
  narrative: string;
  playerOptions: string[];
  flagsAdd: string[];
  memoryUpdates: string[];
  directorEndGoalProgress: string;
}): TurnResult {
  return {
    narrative,
    player_options: playerOptions,
    state_updates: {
      location: player.location,
      inventory_add: [],
      inventory_remove: [],
      flags_add: flagsAdd,
      flags_remove: [],
      quests: []
    },
    director_updates: {
      end_goal_progress: directorEndGoalProgress
    },
    memory_updates: memoryUpdates
  };
}

function createTravelTurnResult({
  player,
  destination,
  narrative,
  playerOptions
}: {
  player: Player;
  destination: string;
  narrative: string;
  playerOptions: string[];
}): TurnResult {
  return {
    narrative,
    player_options: playerOptions,
    state_updates: {
      location: destination,
      inventory_add: [],
      inventory_remove: [],
      flags_add: [],
      flags_remove: [],
      quests: []
    },
    director_updates: {
      end_goal_progress: player.director_state.end_goal_progress
    },
    memory_updates: []
  };
}
