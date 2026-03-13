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
- Canonical replay events must expose their own explicit schema version marker and use a versioned `committed-event/v1` contract separate from transcript-only storage.
- In turn-output schema `v1`, transitional field names such as `state_updates`, `director_updates`, and `memory_updates` remain in the payload for compatibility, but they are proposal-only fields. The authoritative truth in `/api/turn` remains the versioned `player` snapshot until a later schema revision renames those fields.
- The turn-output proposal contract must stay compact. It may carry narrative, player options, and narrowly scoped proposed deltas, but it must not grow scene graphs, world-state objects, beat-state mirrors, or other schema fields that encode game design logic.
- Player-facing narrative, options, quest progress, and memory facts shown after a turn must align to committed authoritative state rather than uncommitted model prose.
- When a turn commits meaningful progression, the returned narrative should explain the accepted outcome before redirecting the player to the next lead; a bare stale `Next step` line is not sufficient.
- Turn handling must separate freeform intent interpretation, world simulation resolution, and story pacing or framing.
- The model-facing turn contract must treat those layers distinctly: infer what the player is trying to do first, propose plausible world consequences second, and use director guidance only to frame or pace the aftermath.
- Clarification-style questions and raw internal tokens submitted through the normal turn input must not auto-inspect, auto-use, or advance flags, quests, or director progress; they may answer in place, but committed state changes require an actual in-world attempt.
- The player may attempt almost anything; implausible or failed actions should be resolved by simulation rules, not by the director acting as a hidden refusal gate.
- Director and beat controls such as `required_flags`, `unlock_flags`, and `max_beats_per_turn` must shape pacing and framing after accepted outcomes, not replace simulation or plausibility checks.
- Current beat, `required_flags`, and `unlock_flags` must not serve as the sole permission logic for an otherwise plausible action.
- Replayable event logging must record committed semantic outcomes and authoritative transitions, not only raw prompts, raw responses, or presentation prose.
- The canonical replay-event contract must explicitly separate replay-critical fields such as player attempt, accepted or rejected outcome, committed transitions, and contract-version markers from optional transcript, prompt, or presentation data.
- Canonical replay must bootstrap authoritative state from an explicit `player-created` event in the committed event log rather than relying on an external initial player snapshot.
- The default AI setup uses a LiteLLM-managed gateway that can route to local AI or hosted providers behind the same app-facing contract.
- Startup preflight must validate host prerequisites, AI readiness, writable paths, and save or migration safety before the first turn.
- Preflight issues must be classified as blocker, warning, or info; blockers must stop the first turn and present plain-language recovery steps.
- The same preflight contract must be reusable across launcher, API, and browser UI diagnostics.
- Each preflight issue must include one recommended next step for end users, while advanced diagnostics stay available behind an expandable details surface.
- Memory system with summaries and embedding-based retrieval.
- Memory must support explicit classes from the start, including hard canon facts, quest progression facts, relationship facts, world discoveries, and soft flavor recollections.
- Hard canon and quest progression memory must be admitted only from server-accepted outcomes; relationship and world-discovery memory may also come from trusted summaries; soft flavor recollection must stay narration-only and non-authoritative.
- Memory design has two orthogonal dimensions: semantic class defines what a fact means, while storage tier defines how hot, compressed, or durable it is.
- Retrieval policy must differ by memory class; only the classes that matter for the current turn should be retrieved, and always-on retrieval should be limited to the smallest authority-relevant set.
- Memory classes may support narration and continuity, but memory retrieval itself must not become a second authority channel that overrides committed state.
- Memory must behave as a storage hierarchy rather than one large prompt. The default live context should contain only the current scene, current goal, nearby world state, and a few high-priority recalled facts.
- The hot summary sent with normal turns should stay sparse and should not absorb every generic admitted memory line immediately when structured state or durable memory already capture the same event.
- Durable memory should be split into at least hard canon facts, quest or progression facts, relationship summaries, and cold history logs. Raw history should remain outside the live context unless a retrieval rule explicitly requires it.
- Per-turn live context assembly must use explicit bucket budgets, with recall ranked by relevance, recency, narrative importance, and strong boosts for voluntary player re-engagement.
- Old interactions must be compressed into rolling summaries and structured facts, with summary formats versioned so they can be recomputed later from canonical data.
- Compression passes should run after scenes, with higher-level recap merges after chapters or beats so verbose dialogue leaves hot memory quickly.
- Versioned compression artifacts must be server-owned scene summaries and higher-level beat recaps that remain regenerable from canonical committed events when summarization logic changes.
- NPC continuity must use a significance pipeline, not a raw chat-log replay. The system must distinguish transcript or event-log data, structured encounter facts, thresholded long-lived NPC memory, and short-lived scene context.
- Structured encounter facts must be explicit server-owned records with fields for NPC identity, display name, role or location, topics, promises, clues, mood, relationship-relevant change, last-seen beat, source event id, and last-seen timestamp so later tiers can build on committed data instead of raw prose.
- NPC memory persistence must be tiered and significance-gated. Ambient encounters should remain structured encounter facts only, known NPCs should preserve cheap identity such as names and role hints, important NPCs may add concise summaries plus remembered topics or open threads, and anchor-cast NPCs may retain richer relationship or history recall after cumulative importance and player re-engagement.
- NPC memory, world memory, and player journal memory must remain separate stores or classes of recall, and durable canon must be stored as structured facts or summaries rather than as raw dialogue prose.
- The default hot turn context must be budgeted by named buckets. The current contract uses `short_history` 2, `quest_progress` 2, `relationship_summaries` 2, `world_facts` 2, and `cold_history` 0 unless an explicit retrieval rule opts raw history in.
- The player flow should provide an optional DM-guide surface for recall-oriented questions about known places, NPCs, goals, and previously discovered facts.
- DM-guide answers must be grounded in committed state, admitted memory, summaries, or replay-derived recap data; when the system cannot support an answer confidently, it must say so plainly instead of inventing details.
- DM-guide responses are advisory and read-only. They must not consume the normal story-turn path or mutate authoritative state, quest progress, director state, or durable memory.
- Web UI with text log, turn input, session controls, suggestion chips, and a local debug panel.
- The first session must include concise in-app guidance for the first few turns, covering freeform input, suggested options, save controls, and setup recovery without requiring the README.
- First-session tutorial guidance must step aside after the player becomes familiar, either through a few successful turns or an explicit dismissal, while leaving save and repair actions visible.
- The main player flow must expose named save slots so players can create, overwrite, inspect, and load checkpoints without browsing files or using a terminal.
- Save-slot errors must use plain language that distinguishes missing, incompatible, or corrupted saves well enough for non-technical players to recover.
- The setup flow must offer a small set of safe end-user profiles plus validated advanced overrides for developer-oriented configuration changes.
- The first-run setup flow must provide a safe connection test for the supported Docker-backed LiteLLM path before the first turn.
- The default launcher path must use the GPU-backed Docker Ollama service and support VRAM-tier-based model recommendations or manual tier selection when detection is unavailable.
- Recovery actions should let users retry setup and switch supported profiles without deleting saves or reopening a terminal for normal fixes.
- The setup wizard must surface copyable recovery actions for the supported launcher path, smaller-profile guidance, and GPU repair checklists when those actions are relevant.
- Local assist endpoint for spellcheck + autocomplete, with small helper tasks intended to prefer hosted providers through the default gateway path.
- Delivery budgets for latency, token usage, cost, and storage must come from a config file with sane defaults and be adjustable through the web UI.

## Baseline MVP Story Arc

- Working identifier: `story_sample`.
- Placeholder naming policy: use generic identifiers such as `story_sample_name`, `story_sample_location`, `story_sample_npc`, and `story_sample_outcome` in planning and fixture discussions until authored content work begins.
- Minimum playable path: the baseline sample must still cover investigation, dialogue with multiple named actors, gated progression toward a final scene, and one committed resolution path.
- Tutorial coverage: the sample must naturally exercise look or inspect, movement between locations, dialogue, item use, one off-path but plausible action, and one safe save or load checkpoint.
- Content boundary: one hub area, one support interior, one hazardous approach, and one final resolution scene are sufficient for MVP as long as the player can complete the sample in roughly 10 guided turns.
- Completion condition: the MVP sample is complete only when the final outcome and key downstream consequences are server-committed, player-visible, and reproducible from replay data.

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
- The canonical event log must also preserve the authoritative player-creation snapshot as a versioned bootstrap record so deterministic replay can start from canonical data alone.
- Transcript or prompt artifacts may still be retained for debugging or UX, but they must remain supplementary to the canonical replay-event contract rather than serving as replay input.
- Summaries capped in size to control tokens.
- Embeddings stored for memory retrieval.
- Memory records must distinguish authority-relevant facts from flavor-only recollections so retrieval, summarization, and persistence policy can treat them differently.
- Durable NPC canon must come from committed structured encounter facts and significance-scored memory admission, while transcript text remains replay or debug material.
- The baseline server-side significance score must remain testable and documented; the current contract promotes long-lived NPC memory at score 6 or higher after adding weighted signals for stable identity, repeated meaningful exchange, relationship change, clues, promises, quest hooks, unique role, and voluntary return.
- Versioned summary or recap artifacts must remain derivable from canonical records rather than becoming opaque authoritative data that cannot be rebuilt.
- Director spec stored in `data/spec/director.json`.
- Quest spec stored in `data/spec/quests.json`.

## API Requirements

- `/api/state` returns or creates a player.
- `/api/state` returns a `player` envelope containing the versioned authoritative player-state payload when setup is ready.
- `/api/save-slots` lists named save slots and their plain-language compatibility status.
- `/api/save-slots` accepts save requests for the current authoritative player state and can overwrite an existing slot when requested.
- `/api/save-slots/load` loads a named slot into a fresh live session instead of mutating the stored checkpoint in place.
- `/api/turn` accepts a versioned turn-input payload, runs a story turn, and returns the versioned turn-output payload plus the versioned authoritative player state.
- `/api/turn` must preserve the authority boundary: model-proposed consequences must remain distinguishable from committed truth, and player-facing narrative must not claim quest, world, or memory changes the server did not accept.
- Replay fidelity must come from committed event semantics and authoritative state transitions; preserving exact narrator prose is secondary to preserving deterministic outcomes.
- `/api/guide` accepts a player-authored recall or orientation question and returns a read-only grounded answer with enough certainty or source metadata for the UI to distinguish grounded recall from uncertainty.
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
