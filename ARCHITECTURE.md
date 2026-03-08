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

## First Decisions To Keep

- Node.js + TypeScript app source, with `public/app.ts` emitted to `public/app.js`
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
- the browser still serves an emitted `public/app.js` asset compiled from `public/app.ts`
- Docker, launcher, and other runtime smoke paths should execute compiled server output from `dist/`

## Packaging Direction

The current packaging spike direction is an Electron shell over the existing compiled server and browser UI.

Reasoning:

- it preserves one gameplay stack and keeps the browser/server split as an internal detail
- it can ship the Node-based server with the desktop shell without adding a Rust toolchain
- it is a better near-term fit than Tauri while the app still depends on a local Node server and SQLite runtime

Implications for follow-on work:

- packaged runtime files should be staged into a writable user-data area instead of writing into install resources
- setup and recovery flows should assume the player may never see a terminal
- launcher-only and Docker paths remain useful development and support fallbacks, but they are no longer the preferred long-term packaged direction
