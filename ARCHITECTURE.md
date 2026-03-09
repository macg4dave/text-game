# Architecture Notes

## Current Direction

This project should treat AI access as a provider boundary, not as a product-specific dependency.

Recommended approach:

- Keep the game loop written against one local adapter interface: `generateTurn`, `getEmbedding`, `getEmbeddings`.
- Prefer OpenAI-compatible HTTP APIs first because they let the same app code work with OpenAI, OpenRouter, Together-style gateways, local adapters, and similar services.
- Prefer LiteLLM as the first multi-provider gateway when you want one endpoint to route across many upstream model vendors.
- Keep model-specific features out of the turn pipeline unless there is a documented fallback.

## Why This Fits The Project

The project is still in planning, so the main risk is locking game logic to one vendor too early.

Using a provider-neutral boundary gives:

- easier model swaps while tuning cost, latency, and quality
- cleaner testing because the turn pipeline can be mocked at one seam
- less rewrite work if the project later needs a second native provider adapter

## Recommended Provider Strategy

Phase 1:

- Use `AI_API_KEY`, `AI_BASE_URL`, `AI_CHAT_MODEL`, and `AI_EMBEDDING_MODEL`.
- Support `AI_PROVIDER=litellm` with LiteLLM-specific env fallbacks and proxy defaults.
- Treat the LiteLLM-managed gateway as the supported MVP path for both local AI and hosted providers.
- Default to OpenAI-compatible structured JSON generation.
- Keep embeddings optional at the architecture level, even if enabled by default.

Phase 2:

- Add explicit provider adapters only when a provider cannot fit the compatible API shape cleanly.
- Keep adapter output normalized to the existing game contract.

## Compatibility Rules

The main turn pipeline should assume only:

- chat or response generation with structured JSON output
- embeddings for memory retrieval
- request timeout and error handling at the adapter layer

Do not assume:

- provider-specific tool calling
- provider-specific role semantics
- provider-specific safety metadata

## Authority Boundary

- The model is a narrator plus proposal engine, not a hidden game engine.
- The model may suggest consequences, pacing, options, and memory candidates, but those suggestions are not authoritative state.
- The server must validate and adjudicate proposed consequences before mutating player state, director state, quest progress, or persisted memory.
- Player-facing narrative should be derived or reconciled after the authoritative commit so prose cannot smuggle in unearned world facts.
- Event log, replay, and save behavior should treat committed state and accepted consequences as truth; raw model claims are debug data unless the server accepted them.
- The current `turn-output/v1` wire shape still uses transitional names such as `state_updates`, `director_updates`, and `memory_updates`, but those fields are proposals only; the authoritative player snapshot is the truth-bearing response surface.

## Turn Layering

- The turn pipeline should be split into three responsibilities:
  - freeform intent interpretation
  - world simulation resolution
  - story pacing or framing
- Intent interpretation turns broad player input into one or more candidate intents without deciding story pacing.
- World simulation resolution decides plausibility, accepted consequences, failures, and side effects against authoritative state and rules.
- Director logic should consume accepted simulation outcomes and decide how to frame, emphasize, or pace them toward the end goal.
- Beat controls such as `required_flags`, `unlock_flags`, and `max_beats_per_turn` are pacing tools. They should not be the primary reason an otherwise plausible action succeeds or fails.
- Prompt and schema language should preserve the same split: candidate state consequences belong to simulation-oriented proposal fields, while director-facing progress text belongs to pacing or framing fields rather than permission logic.

## Model Turn Schema Boundary

- The model-facing schema is a transport contract, not the game's design language.
- Prefer a compact turn payload built around narrative, candidate actions, structured intents, and proposed deltas.
- Reject schema growth that adds scene-state mirrors, world models, beat objects, or similar design-shaped payloads to the turn output.
- Keep scene modeling, simulation rules, quest logic, beat policy, and other gameplay semantics in server-owned modules or content specs rather than encoding them as schema shape.
- If a proposed schema field exists mainly to teach game rules to the model, treat that as a boundary smell and move the logic into validators, adjudication, reducer code, or authored specs instead.
- Compact schemas should be translated into richer authoritative domain concepts server-side after validation, not by making the model output mirror the whole engine state machine.

## Replay Record Model

- Replay must be driven by committed semantic events, not by rerunning model generation from stored prompts or prose.
- The canonical event record should capture, at minimum:
  - the player attempt or interpreted intent
  - the server-resolved accepted or rejected outcome
  - the authoritative state or director transitions committed under the active ruleset or schema version
- The current canonical event contract should be treated as versioned `committed-event/v1`, with replay-critical semantic fields separated from optional transcript, prompt, or presentation artifacts.
- Canonical replay bootstrap should come from an explicit `player-created` event stored in the same committed event log so replay does not depend on an out-of-band initial player snapshot.
- Raw prompts, raw model responses, and final prose are useful diagnostics or presentation artifacts, but they are not sufficient as the replay source of truth.
- Save migration, replay fixtures, and debugging surfaces should treat semantic event records as canonical and any raw transcript data as supplementary.

## Memory Model

- Memory is a narration and continuity aid, not an independent truth authority.
- The memory system should support explicit classes with different authority and retrieval policy, including:
  - hard canon facts
  - quest progression facts
  - relationship facts
  - world discoveries
  - soft flavor recollections
- Treat semantic memory class and storage tier as separate axes:
  - class explains what kind of fact or recollection a record represents
  - tier explains whether that record belongs in hot context, warm summaries, or cold history
- Authority-relevant classes should be admitted only from server-accepted outcomes or trusted derivation paths.
- Admission rules should stay explicit by class: hard canon and quest progression come from server commits only, relationship and world-discovery memory may also come from trusted summaries, and soft flavor recollection remains narration-only.
- Retrieval policy should be class-aware so each turn pulls the smallest useful set instead of treating all memories as equivalent.
- Soft flavor recollections may enrich narration, but they must not mutate or override authoritative state on their own.
- Treat memory as a storage hierarchy:
  - hot live context for the current turn
  - warm structured facts and rolling summaries
  - cold history retained for replay, debugging, or explicit recovery use
- Default live context should contain only the current scene, current goal, nearby world state, and a small set of high-priority recalled facts.
- Durable memory should be split across distinct buckets such as hard canon facts, quest or progression facts, relationship summaries, and cold history logs rather than one monolithic prompt payload.
- Raw history should remain out of the live prompt by default; if a transcript slice is needed, it should be requested as an explicit retrieval mode with its own budget.
- Summary and recap artifacts should be versioned so later recomputation can rebuild them from canonical event data and committed facts when summarization logic changes.
- Ranking inside bucket budgets should prefer relevance first, then recency and narrative importance, with strong boosts for later voluntary player re-engagement.
- Compression should happen in layers: post-scene fact extraction and compact summaries first, then chapter- or beat-level recap merges later.
- NPC continuity should flow through four layers:
  - transcript or event-log retention for replay and debugging
  - structured encounter facts extracted from committed scenes
  - long-lived NPC memory records admitted only above a significance threshold
  - short-lived scene context used only for the current conversation
- A server-side significance evaluator should score encounter facts after dialogue scenes using committed signals such as stable identity, repeated meaningful exchange, relationship change, clues, promises, quest hooks, unique role, and later voluntary player return.
- NPC importance tiers should control what is persisted and how aggressively it is retrieved, from ambient presence through anchor-cast history.
- World memory, NPC memory, and player journal memory should remain separate retrieval domains even if they share lower-level storage primitives.
- Context assembly should be budgeted by bucket and remain inspectable enough to explain which facts entered the model context, why they were selected, and what token cost they consumed.

## First Decisions To Keep

- Node.js + TypeScript app source, with browser authoring code under `src/ui/app.ts` emitted to `public/app.js`
- Module-first source organization under `src/core`, `src/server`, `src/state`, `src/story`, `src/rules`, `src/ai`, `src/utils`, and `src/ui`
- SQLite state source of truth
- server-side director enforcement
- provider-neutral AI config with backward compatibility for existing `OPENAI_*` env vars
- Electron is the preferred Windows packaging spike because it can wrap the existing local HTTP gameplay stack without moving game authority into the shell

## TypeScript Note

TypeScript is a compile-time tooling choice for this repo, not an architecture boundary.

It should not change:

- the provider-neutral adapter seam
- the server-side authority model
- the runtime validation requirements for model output
- the external HTTP contract of the app

Current build/run contract:

- local development runs the server directly from TypeScript
- the browser still serves an emitted `public/app.js` asset compiled from `src/ui/app.ts`
- Docker, launcher, and other runtime smoke paths should execute compiled server output from `dist/`

## Script Structure Guidance

- Automation lives in `launcher/` as the Rust executable `SunRay`, rooted at `launcher/Cargo.toml`.
- New automation entrypoints should be Rust subcommands, not `.ps1`, `.sh`, or `.bat` files.
- Shared automation behavior should live in Rust modules inside that tooling runtime, with JSON or fixture assets beside it as needed.
- Rust automation may invoke Docker, npm, Node, Electron, and other existing tools as external processes, but this does not change the app runtime boundary.
- Existing PowerShell entrypoints are no longer part of the supported runtime surface and should not be revived.
- Keep launcher fixtures, validation assets, and shared automation helpers inside `launcher/` so the Rust tooling runtime owns its full support surface.

## Launcher Boundary

- `launcher/SunRay` is a process orchestrator for the existing runtime surfaces.
- `launcher/SunRay` is not a webview shell and must not embed or replace the browser UI.
- `launcher/SunRay` is not an installer, updater, or package manager.
- `launcher/SunRay` is not a replacement for Electron packaging.
- `launcher/SunRay` is not a replacement for the Node server or the TypeScript gameplay stack.
- If a responsibility would turn `SunRay` into a second app runtime instead of an automation entrypoint, it belongs elsewhere.

## Packaging Direction

The current packaging spike direction is an Electron shell over the existing compiled server and browser UI.

Reasoning:

- it preserves one gameplay stack and keeps the browser/server split as an internal detail
- it can ship the Node-based server with the desktop shell without moving the app shell into a Rust desktop runtime
- it is a better near-term fit than Tauri while the app still depends on a local Node server and SQLite runtime

Clarification:

- the repo may adopt a Rust toolchain for automation under `launcher/`; that tooling change does not change the Electron-versus-Tauri packaging decision for the shipped app runtime

Implications for follow-on work:

- packaged runtime files should be staged into a writable user-data area instead of writing into install resources
- setup and recovery flows should assume the player may never see a terminal
- launcher-only and Docker paths remain useful development and support fallbacks, but they are no longer the preferred long-term packaged direction

## Architecture Change Intake

- [BACKLOG.md](/g:/text-game/BACKLOG.md) is the execution source of truth for in-flight work. If an active architecture task and this document diverge, update this document to mirror the backlog-backed decision.
- Update this document when a future issue changes runtime boundaries, module ownership, provider boundaries, packaging shape, or other architecture-level contracts.
- Mirror architecture-affecting issues in [BACKLOG.md](/g:/text-game/BACKLOG.md) as a parent item plus child tasks so boundary decisions and implementation work stay linked.
- Keep purely strategic sequencing, validation policy, or user-copy updates out of this document unless they materially change the architecture boundary itself.
