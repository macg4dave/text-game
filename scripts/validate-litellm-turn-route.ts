import "dotenv/config";
import process from "node:process";
import { getAiRouteSummary, loadConfig } from "../src/core/config.js";
import { TURN_INPUT_SCHEMA_VERSION } from "../src/core/types.js";

interface StateResponseLike {
  player?: {
    id?: string;
    name?: string;
  } | null;
}

interface TurnResponseLike {
  narrative?: string;
  player?: {
    id?: string;
  };
  error?: string;
  detail?: unknown;
}

const loaded = loadConfig(process.env);
const route = getAiRouteSummary(loaded);
const serverBaseUrl = readArg("--server") || `http://127.0.0.1:${loaded.port}`;
const playerName = readArg("--name") || "LiteLLMRouteCheck";
const input = readArg("--input") || "inspect the current situation";

if (route.provider !== "litellm") {
  throw new Error(
    `Expected AI_PROVIDER=litellm for this validation path, but found ${route.provider}. Route summary: ${JSON.stringify(route)}`
  );
}

const stateResponse = await fetch(`${serverBaseUrl}/api/state?name=${encodeURIComponent(playerName)}`);
const stateBody = (await stateResponse.json()) as StateResponseLike;
const playerId = stateBody.player?.id;

if (!stateResponse.ok || !playerId) {
  throw new Error(`State bootstrap failed: ${stateResponse.status} ${JSON.stringify(stateBody)}`);
}

const turnResponse = await fetch(`${serverBaseUrl}/api/turn`, {
  method: "POST",
  headers: {
    "content-type": "application/json"
  },
  body: JSON.stringify({
    schema_version: TURN_INPUT_SCHEMA_VERSION,
    input,
    player_id: playerId,
    player_name: playerName
  })
});
const turnBody = (await turnResponse.json()) as TurnResponseLike;

if (!turnResponse.ok) {
  throw new Error(`Turn submission failed: ${turnResponse.status} ${JSON.stringify(turnBody)}`);
}

console.log(
  JSON.stringify(
    {
      server_base_url: serverBaseUrl,
      route,
      player_id: playerId,
      request_id: turnResponse.headers.get("x-request-id"),
      input,
      response_player_id: turnBody.player?.id || null,
      narrative_preview: truncate(turnBody.narrative || "", 200)
    },
    null,
    2
  )
);

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return null;
  }

  const value = process.argv[index + 1];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}