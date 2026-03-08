# Requirements

## Brief

A portable, text-based adventure game powered by a provider-neutral AI adapter with a LiteLLM-managed gateway as the default AI control plane. Players can attempt anything, while a director layer nudges the story toward a defined end goal. The system uses compact state, summaries, and selective memory retrieval to minimize token usage. A lightweight spellcheck/autocomplete helper should prefer hosted providers through the gateway so it does not depend on a local large-model runtime.

## Goals

- Maximize player freedom while guiding toward an end goal.
- Keep OpenAI token usage low via compact state + memory.
- Provide a portable web-based UI.
- Maintain a simple, reliable backend with clear state ownership.

## Non-Goals

- Full 3D graphics or real-time gameplay.
- Multiplayer in the initial scope.
- Full offline story generation as the main supported runtime path. A Windows-only local model setup may be used for development smoke tests.

## Functional Requirements

- Game state persistence (player, location, inventory, flags, quests).
- Event logging for player and narrator turns.
- Director layer to track end goal, act, and remaining beats.
- AI responses must be structured JSON with narrative + updates.
- Turn input, turn output, and authoritative player state must each expose an explicit schema version marker at the HTTP boundary.
- The default AI setup uses a LiteLLM-managed gateway that can route to local AI or hosted providers behind the same app-facing contract.
- Startup preflight must validate host prerequisites, AI readiness, writable paths, and save or migration safety before the first turn.
- Preflight issues must be classified as blocker, warning, or info; blockers must stop the first turn and present plain-language recovery steps.
- The same preflight contract must be reusable across launcher, API, browser UI, and packaged shell diagnostics.
- Each preflight issue must include one recommended next step for end users, while advanced diagnostics stay available behind an expandable details surface.
- Memory system with summaries and embedding-based retrieval.
- Web UI with text log, turn input, session controls, suggestion chips, and a local debug panel.
- The setup flow must offer a small set of safe end-user profiles plus validated advanced overrides for developer-oriented configuration changes.
- The default launcher path must use the GPU-backed Docker Ollama service and support VRAM-tier-based model recommendations or manual tier selection when detection is unavailable.
- Recovery actions should let users retry setup and switch supported profiles without deleting saves or reopening a terminal for normal fixes.
- Local assist endpoint for spellcheck + autocomplete, with small helper tasks intended to prefer hosted providers through the default gateway path.
- Delivery budgets for latency, token usage, cost, and storage must come from a config file with sane defaults and be adjustable through the web UI.

## Quality Attributes

- Low token usage per turn.
- Fast, responsive UI on desktop and mobile.
- Clear separation of state (DB) and generation (AI).
- Fault-tolerant outputs via server-side validation.

## Data & State

- SQLite as the source of truth for game state.
- Summaries capped in size to control tokens.
- Embeddings stored for memory retrieval.
- Director spec stored in `data/spec/director.json`.
- Quest spec stored in `data/spec/quests.json`.

## API Requirements

- `/api/state` returns or creates a player.
- `/api/state` returns a `player` envelope containing the versioned authoritative player-state payload when setup is ready.
- `/api/turn` accepts a versioned turn-input payload, runs a story turn, and returns the full versioned turn-output payload, including `memory_updates`, plus the versioned authoritative player state.
- `/api/assist` provides local text assistance.

## Configuration

- `AI_PROFILE` (optional; default `local-gpu-small`; supported values: `local-gpu-small`, `local-gpu-large`, `custom`)
- `AI_PROVIDER` (optional; default `litellm`)
- `AI_API_KEY` (primary key in generic provider mode)
- `AI_BASE_URL` (optional; for OpenAI-compatible providers)
- `AI_CHAT_MODEL` (default: `gpt-4o-mini`)
- `AI_EMBEDDING_MODEL` (default: `text-embedding-3-small`)
- `LITELLM_PROXY_URL` (used when `AI_PROVIDER=litellm`)
- `LITELLM_API_KEY` (used when `AI_PROVIDER=litellm`)
- `LITELLM_CHAT_MODEL` (default: `game-chat` in LiteLLM mode)
- `LITELLM_EMBEDDING_MODEL` (default: `game-embedding` in LiteLLM mode)
- `OLLAMA_BASE_URL` (used when `AI_PROVIDER=ollama`; default `http://127.0.0.1:11434/v1`)
- `OLLAMA_API_KEY` (optional placeholder key in Ollama mode)
- `OLLAMA_CHAT_MODEL` (default: `gemma3:4b` in Ollama mode)
- `OLLAMA_EMBEDDING_MODEL` (default: `embeddinggemma` in Ollama mode)
- Transitional backward-compatible support for legacy `OPENAI_*` env vars
- `PORT`

## Update Process

- Keep this file current when features or priorities change.
- Roadmap changes should be reflected here when requirements shift.
