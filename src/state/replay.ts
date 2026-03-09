import type {
  CanonicalEventPayload,
  CanonicalPlayerCreatedEventPayload,
  Player
} from "../core/types.js";
import { reduceCommittedPlayerState } from "./reducer.js";

export interface ReplayCommittedTurnEventsParams {
  events: CanonicalEventPayload[];
}

export function replayCommittedTurnEvents({ events }: ReplayCommittedTurnEventsParams): Player {
  const initialPlayer = getInitialPlayerFromEvents(events);
  let player = clonePlayer(initialPlayer);

  for (const event of events) {
    if (event.event_kind !== "turn-resolution" || event.outcome.status !== "accepted") {
      continue;
    }

    player = reduceCommittedPlayerState({
      player,
      acceptedConsequences: event.committed
    }).player;
  }

  return player;
}

function getInitialPlayerFromEvents(events: CanonicalEventPayload[]): Player {
  const playerCreatedEvent = events.find((event): event is CanonicalPlayerCreatedEventPayload => event.event_kind === "player-created");
  if (!playerCreatedEvent) {
    throw new Error("Replay requires a canonical player-created event before turn-resolution events.");
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
