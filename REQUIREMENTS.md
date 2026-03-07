# Requirements

## Brief

A portable, text-based adventure game powered by a provider-neutral AI adapter that targets OpenAI-compatible APIs first. Players can attempt anything, while a director layer nudges the story toward a defined end goal. The system uses compact state, summaries, and selective memory retrieval to minimize token usage. A local, lightweight spellcheck/autocomplete helper improves text entry without consuming main-model tokens.

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
- Memory system with summaries and embedding-based retrieval.
- Web UI with text log, turn input, session controls, suggestion chips, and a local debug panel.
- Local assist endpoint for spellcheck + autocomplete.

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
- `/api/turn` runs a story turn and updates state.
- `/api/assist` provides local text assistance.

## Configuration

- `AI_PROVIDER` (optional; default `openai-compatible`)
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
- Backward-compatible support for legacy `OPENAI_*` env vars
- `PORT`

## Update Process

- Keep this file current when features or priorities change.
- Roadmap changes should be reflected here when requirements shift.
