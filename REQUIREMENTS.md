# Requirements

## Brief
A portable, text-based adventure game powered by the OpenAI API. Players can attempt anything, while a director layer nudges the story toward a defined end goal. The system uses compact state, summaries, and selective memory retrieval to minimize token usage. A local, lightweight spellcheck/autocomplete helper improves text entry without consuming OpenAI tokens.

## Goals
- Maximize player freedom while guiding toward an end goal.
- Keep OpenAI token usage low via compact state + memory.
- Provide a portable web-based UI.
- Maintain a simple, reliable backend with clear state ownership.

## Non-Goals
- Full 3D graphics or real-time gameplay.
- Multiplayer in the initial scope.
- Full offline story generation (main story remains OpenAI-powered).

## Functional Requirements
- Game state persistence (player, location, inventory, flags, quests).
- Event logging for player and narrator turns.
- Director layer to track end goal, act, and remaining beats.
- AI responses must be structured JSON with narrative + updates.
- Memory system with summaries and embedding-based retrieval.
- Web UI with log, input, and suggestion chips.
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
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (default: `gpt-4o-mini`)
- `OPENAI_EMBEDDING_MODEL` (default: `text-embedding-3-small`)
- `PORT`

## Update Process
- Keep this file current when features or priorities change.
- Roadmap changes should be reflected here when requirements shift.
