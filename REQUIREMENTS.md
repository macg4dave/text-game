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
- AI turn generation must use a structured JSON proposal contract. Model-supplied consequences are proposals only until the server validates and commits them.
- The model-facing turn schema must stay compact and transport-oriented. Prefer narrative, candidate actions, structured intents, and proposed deltas over scene-shaped world models or schema fields that encode gameplay design logic.
- Turn input, turn output, and authoritative player state must each expose an explicit schema version marker at the HTTP boundary.
- Player-facing narrative, options, quest progress, and memory facts shown after a turn must align to committed authoritative state rather than uncommitted model prose.
- Turn handling must separate freeform intent interpretation, world simulation resolution, and story pacing or framing.
- The player may attempt almost anything; implausible or failed actions should be resolved by simulation rules, not by the director acting as a hidden refusal gate.
- Director and beat controls such as `required_flags`, `unlock_flags`, and `max_beats_per_turn` must shape pacing and framing after accepted outcomes, not replace simulation or plausibility checks.
- Replayable event logging must record committed semantic outcomes and authoritative transitions, not only raw prompts, raw responses, or presentation prose.
- The default AI setup uses a LiteLLM-managed gateway that can route to local AI or hosted providers behind the same app-facing contract.
- Startup preflight must validate host prerequisites, AI readiness, writable paths, and save or migration safety before the first turn.
- Preflight issues must be classified as blocker, warning, or info; blockers must stop the first turn and present plain-language recovery steps.
- The same preflight contract must be reusable across launcher, API, browser UI, and packaged shell diagnostics.
- Each preflight issue must include one recommended next step for end users, while advanced diagnostics stay available behind an expandable details surface.
- Memory system with summaries and embedding-based retrieval.
- Memory must support explicit classes from the start, including hard canon facts, quest progression facts, relationship facts, world discoveries, and soft flavor recollections.
- Memory design has two orthogonal dimensions: semantic class defines what a fact means, while storage tier defines how hot, compressed, or durable it is.
- Retrieval policy must differ by memory class; only the classes that matter for the current turn should be retrieved, and always-on retrieval should be limited to the smallest authority-relevant set.
- Memory classes may support narration and continuity, but memory retrieval itself must not become a second authority channel that overrides committed state.
- Memory must behave as a storage hierarchy rather than one large prompt. The default live context should contain only the current scene, current goal, nearby world state, and a few high-priority recalled facts.
- Durable memory should be split into at least hard canon facts, quest or progression facts, relationship summaries, and cold history logs. Raw history should remain outside the live context unless a retrieval rule explicitly requires it.
- Per-turn live context assembly must use explicit bucket budgets, with recall ranked by relevance, recency, narrative importance, and strong boosts for voluntary player re-engagement.
- Old interactions must be compressed into rolling summaries and structured facts, with summary formats versioned so they can be recomputed later from canonical data.
- Compression passes should run after scenes, with higher-level recap merges after chapters or beats so verbose dialogue leaves hot memory quickly.
- NPC continuity must use a significance pipeline, not a raw chat-log replay. The system must distinguish transcript or event-log data, structured encounter facts, thresholded long-lived NPC memory, and short-lived scene context.
- NPC memory persistence must be tiered and significance-gated. Stable identity such as names should be cheap to persist, while richer relationship or history recall should require cumulative importance and player re-engagement.
- NPC memory, world memory, and player journal memory must remain separate stores or classes of recall, and durable canon must be stored as structured facts or summaries rather than as raw dialogue prose.
- Web UI with text log, turn input, session controls, suggestion chips, and a local debug panel.
- The setup flow must offer a small set of safe end-user profiles plus validated advanced overrides for developer-oriented configuration changes.
- The first-run setup flow must provide a safe connection test for the supported Docker-backed LiteLLM path before the first turn.
- The default launcher path must use the GPU-backed Docker Ollama service and support VRAM-tier-based model recommendations or manual tier selection when detection is unavailable.
- Recovery actions should let users retry setup and switch supported profiles without deleting saves or reopening a terminal for normal fixes.
- The setup wizard must surface copyable recovery actions for the supported launcher path, smaller-profile guidance, and GPU repair checklists when those actions are relevant.
- Local assist endpoint for spellcheck + autocomplete, with small helper tasks intended to prefer hosted providers through the default gateway path.
- Delivery budgets for latency, token usage, cost, and storage must come from a config file with sane defaults and be adjustable through the web UI.

## Quality Attributes

- Low token usage per turn.
- Fast, responsive UI on desktop and mobile.
- Clear separation of state (DB) and generation (AI).
- Fault-tolerant outputs via server-side validation.
- Strong player agency without hidden railroading from beat logic.

## Data & State

- SQLite as the source of truth for game state.
- Only server-committed state, accepted quest progression, and accepted memory facts are authoritative; prose alone cannot establish world truth.
- The canonical event log must preserve what the player attempted, what the server accepted or rejected, and which authoritative transitions were committed under the active ruleset or schema version.
- Summaries capped in size to control tokens.
- Embeddings stored for memory retrieval.
- Memory records must distinguish authority-relevant facts from flavor-only recollections so retrieval, summarization, and persistence policy can treat them differently.
- Durable NPC canon must come from committed structured encounter facts and significance-scored memory admission, while transcript text remains replay or debug material.
- Versioned summary or recap artifacts must remain derivable from canonical records rather than becoming opaque authoritative data that cannot be rebuilt.
- Director spec stored in `data/spec/director.json`.
- Quest spec stored in `data/spec/quests.json`.

## API Requirements

- `/api/state` returns or creates a player.
- `/api/state` returns a `player` envelope containing the versioned authoritative player-state payload when setup is ready.
- `/api/turn` accepts a versioned turn-input payload, runs a story turn, and returns the versioned turn-output payload plus the versioned authoritative player state.
- `/api/turn` must preserve the authority boundary: model-proposed consequences must remain distinguishable from committed truth, and player-facing narrative must not claim quest, world, or memory changes the server did not accept.
- Replay fidelity must come from committed event semantics and authoritative state transitions; preserving exact narrator prose is secondary to preserving deterministic outcomes.
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

- [BACKLOG.md](/g:/text-game/BACKLOG.md) is the execution source of truth for active work. If this file drifts from the backlog on sequencing or in-flight detail, update this file to mirror the backlog rather than treating requirements text as the tie-breaker.
- Keep this file current when features or priorities change.
- Roadmap changes should be reflected here when requirements shift.
- When a future issue changes user-visible scope, setup behavior, supported player flows, or configuration exposed to players, update this file in the same session that adds the matching backlog parent item and child tasks.
- If an issue only changes sequencing, validation policy, or internal architecture, keep this file unchanged and sync the owning planning docs instead.
