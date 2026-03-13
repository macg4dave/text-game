import {
  MEMORY_SUMMARY_ARTIFACT_SCHEMA_VERSION,
  type CanonicalEventPayload,
  type CanonicalTurnEventPayload,
  type DirectorSpec,
  type MemoryInsert,
  type MemorySummaryArtifact,
  type Player
} from "../core/types.js";
import { loadDirectorSpec } from "../story/director.js";
import { resolveDirectorStateFromAcceptedConsequences } from "./adjudication.js";
import { reduceCommittedPlayerState } from "./reducer.js";

export function createMemorySummaryArtifactInsert(artifact: MemorySummaryArtifact): MemoryInsert {
  return {
    kind: "memory-summary-artifact",
    content: JSON.stringify(artifact)
  };
}

export function buildSceneSummaryArtifact({
  player,
  nextPlayer,
  event
}: {
  player: Player;
  nextPlayer: Player;
  event: CanonicalTurnEventPayload;
}): MemorySummaryArtifact {
  const detailLines = buildDetailLines(event, player, nextPlayer);

  return {
    schema_version: MEMORY_SUMMARY_ARTIFACT_SCHEMA_VERSION,
    artifact_kind: "scene-summary",
    source_kind: "committed-events",
    source_event_ids: [event.event_id],
    generated_at: event.occurred_at,
    player_id: player.id,
    beat_id: player.director_state.current_beat_id,
    beat_label: player.director_state.current_beat_label,
    location: nextPlayer.location,
    summary: buildSceneSummaryText(event, detailLines),
    detail_lines: detailLines
  };
}

export function buildBeatRecapArtifact({
  player,
  sceneArtifacts,
  generatedAt
}: {
  player: Player;
  sceneArtifacts: MemorySummaryArtifact[];
  generatedAt: string;
}): MemorySummaryArtifact {
  const sourceEventIds = uniqueStrings(sceneArtifacts.flatMap((artifact) => artifact.source_event_ids));
  const detailLines = uniqueStrings(sceneArtifacts.flatMap((artifact) => artifact.detail_lines)).slice(0, 4);
  const location = sceneArtifacts.at(-1)?.location ?? player.location;
  const beatLabel = player.director_state.current_beat_label;
  const summaryTail = detailLines.length > 0
    ? detailLines.join(" ")
    : sceneArtifacts.map((artifact) => artifact.summary).join(" ");

  return {
    schema_version: MEMORY_SUMMARY_ARTIFACT_SCHEMA_VERSION,
    artifact_kind: "beat-recap",
    source_kind: "committed-events",
    source_event_ids: sourceEventIds,
    generated_at: generatedAt,
    player_id: player.id,
    beat_id: player.director_state.current_beat_id,
    beat_label: beatLabel,
    location,
    summary: `Beat recap: ${beatLabel}. ${summaryTail}`.trim(),
    detail_lines: detailLines
  };
}

export function shouldCreateBeatRecap(previousPlayer: Player, nextPlayer: Player): boolean {
  return (
    previousPlayer.director_state.current_beat_id !== nextPlayer.director_state.current_beat_id ||
    previousPlayer.director_state.completed_beats.length !== nextPlayer.director_state.completed_beats.length
  );
}

export function buildMemorySummaryArtifactsFromCommittedEvents({
  events,
  directorSpec = loadDirectorSpec()
}: {
  events: CanonicalEventPayload[];
  directorSpec?: DirectorSpec;
}): MemorySummaryArtifact[] {
  const initialPlayer = getInitialPlayerFromEvents(events);
  let player = clonePlayer(initialPlayer);
  const artifacts: MemorySummaryArtifact[] = [];
  const sceneArtifactsByBeat = new Map<string, MemorySummaryArtifact[]>();

  for (const event of events) {
    if (event.event_kind !== "turn-resolution" || event.outcome.status !== "accepted") {
      continue;
    }

    const resolvedDirectorState = resolveDirectorStateFromAcceptedConsequences({
      player,
      directorSpec,
      acceptedConsequences: event.committed
    });

    const nextPlayer = reduceCommittedPlayerState({
      player,
      acceptedConsequences: event.committed,
      resolvedDirectorState
    }).player;

    const sceneArtifact = buildSceneSummaryArtifact({ player, nextPlayer, event });
    artifacts.push(sceneArtifact);

    const beatId = sceneArtifact.beat_id ?? "__no-beat__";
    const existing = sceneArtifactsByBeat.get(beatId) ?? [];
    const updated = [...existing, sceneArtifact];
    sceneArtifactsByBeat.set(beatId, updated);

    if (shouldCreateBeatRecap(player, nextPlayer)) {
      artifacts.push(
        buildBeatRecapArtifact({
          player,
          sceneArtifacts: updated,
          generatedAt: event.occurred_at
        })
      );
    }

    player = nextPlayer;
  }

  return artifacts;
}

function buildSceneSummaryText(event: CanonicalTurnEventPayload, detailLines: string[]): string {
  if (detailLines.length > 0) {
    return detailLines.join(" ");
  }

  return event.outcome.summary;
}

function buildDetailLines(event: CanonicalTurnEventPayload, player: Player, nextPlayer: Player): string[] {
  const detailLines = uniqueStrings(
    event.committed.memory_updates
      .map((item) => item.trim())
      .filter(Boolean)
  );

  if (detailLines.length > 0) {
    return detailLines;
  }

  if (nextPlayer.location !== player.location) {
    return [`The player reached ${nextPlayer.location}.`];
  }

  const nextQuestSummary = nextPlayer.quests[0]?.summary?.trim();
  if (nextQuestSummary) {
    return [nextQuestSummary];
  }

  return [event.outcome.summary];
}

function getInitialPlayerFromEvents(events: CanonicalEventPayload[]): Player {
  const playerCreatedEvent = events.find((event) => event.event_kind === "player-created");
  if (!playerCreatedEvent || playerCreatedEvent.event_kind !== "player-created") {
    throw new Error("Summary artifact rebuild requires a canonical player-created event.");
  }

  const { schema_version: _schemaVersion, ...player } = playerCreatedEvent.created_player;
  return player;
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

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}