# Engineering Standards

This document holds the cross-cutting delivery rules for the project. It is intentionally operational and should change less often than the backlog but more often than the roadmap.

## Definition of Done

A phase or backlog item is complete only when all relevant conditions below are met:

- Exit criteria are validated through tests or documented manual checks.
- `npm run type-check` passes for any task that changes TypeScript source, build scripts, or type-facing config.
- TypeScript source remains the only authoring source of truth. Generated JS assets and compiled output should be rebuilt or validated, not maintained as parallel hand-edited implementations.
- Schema changes include version updates and migrations where applicable.
- Replay-affecting changes include updated replay fixtures.
- Backlog state is updated in [BACKLOG.md](/g:/text-game/BACKLOG.md).
- Scope or behavior changes are reflected in [REQUIREMENTS.md](/g:/text-game/REQUIREMENTS.md).
- Setup, environment, or key path changes are reflected in [README.md](/g:/text-game/README.md).

## Delivery Budget Register

Numeric targets are required before Phase 0 closes. The source of truth for these defaults will be a server-side budget config file, and the same values should be adjustable from the web UI without code edits. The defaults below are now the Phase 0 baseline until later fixture data proves they should move.

| Metric | Target | Owner | Must Be Set By | Notes |
| --- | --- | --- | --- | --- |
| p95 `/api/turn` latency in local dev | 8 seconds | Tech lead | Phase 0 exit | Default comes from the budget config and is measured on the baseline fixture suite |
| Max total tokens per turn | 4,000 tokens | AI systems lead | Phase 0 exit | Default comes from the budget config; input plus output |
| Cost per 100 turns | $0.12 USD | AI systems lead | Phase 0 exit | Default comes from the budget config and is based on the LiteLLM-managed default aliases |
| Schema validation pass rate in CI fixtures | 100% | Tech lead | Phase 0 exit | Any failure blocks release progression |
| DB growth per 1,000 turns | 40 MB | Tech lead | Phase 0 exit | Default comes from the budget config; event log plus memory storage |

### Budget Baseline Assumptions

- The default budget model path is LiteLLM alias `game-chat` -> `gpt-4o-mini` and LiteLLM alias `game-embedding` -> `text-embedding-3-small`.
- The current turn shape includes up to 6 short-history entries, 6 retrieved memories, a rolling summary capped to the last 30 summary lines, up to 6 suggested player options, and up to 8 memory updates per turn.
- The $0.12 per 100 turns budget assumes the prompt is kept comfortably under the 4,000-token ceiling on the default alias pair and leaves small headroom for embedding calls.
- The 40 MB per 1,000 turns budget assumes SQLite growth is dominated by event text plus JSON-serialized embedding vectors stored with memories; this target should be revisited once replay fixtures and save-slot usage are measured.

## Schema and Migration Policy

- All external payloads are versioned: turn input, turn output, and authoritative state.
- Backward compatibility rules must be written before save/load is implemented.
- SQLite schema changes are applied by migrations only.
- Any change that affects replay determinism requires a golden fixture update.
- Version compatibility for saves must be tested before Phase 5 can close.

## Test Minimums

- TypeScript compile and `npm run type-check` must pass before unit, integration, or manual validation is counted as complete for TS changes
- Local development should execute the server directly from TypeScript, while Docker and launcher validation should exercise the compiled server output.
- Shared script behavior should be validated through the script entrypoints that consume it after helper changes, not only by reading the helper file in isolation.
- Unit tests for reducers, validators, ranking, and other pure functions
- Integration tests for the turn pipeline using fixtures
- Golden replay tests for deterministic scripted runs
- Fuzz tests for validator and sanitizer inputs
- CI execution on every push by Phase 4
- Any change to AI prompts, schemas, model defaults, or adapter request shapes must run the local AI workflow harness before and after the change when a local compatible provider is available

## Script Maintainability Policy

- Reusable PowerShell logic belongs under `scripts/lib/`.
- Entry scripts should orchestrate shared helpers rather than redefine them.
- Cross-script concerns such as dotenv loading, config precedence, Docker invocation, readiness polling, and common error formatting should have one shared implementation whenever practical.
- Script output should stay easy to debug: prefer consistent step logging, clear failure messages, and one canonical place to change shared behavior.

## AI Test-First Change Policy

- Treat AI-related work as test-based by default, not as prompt tinkering followed by hope.
- Treat TypeScript type safety as a guardrail, not a substitute for runtime validation.
- Before changing prompts, schemas, model defaults, adapter request shapes, retrieval logic, director rules, or validation behavior, first add or update at least one verification artifact that captures the intended behavior.
- Acceptable verification artifacts are:
  - a unit test for pure logic
  - an integration test using fixtures
  - a golden replay fixture
  - an extension to `scripts/test-local-ai-workflow.ps1` for provider-compatible contract checks
- The preferred loop is: define or tighten the expectation, run it to observe the current failure or gap, make the smallest implementation change, then re-run the focused check plus the relevant broader suite.
- If fully automated verification is not yet possible, add the smallest deterministic fixture or scripted harness step that proves the contract and record the limitation in [BACKLOG.md](/g:/text-game/BACKLOG.md).
- AI-related changes are not complete unless the changed behavior is covered by a test, fixture, or scripted harness path that another agent can re-run.

## Telemetry Contract

Each `/api/turn` should record, at minimum:

- request id
- player id or session id
- model alias
- retry count
- timeout path
- input tokens
- output tokens
- latency
- validation errors
- state schema version
- output schema version

## Operational Runbook Checklist

The runbook may live in this file or a dedicated operations document later, but the following content is mandatory before Phase 4 closes:

- local setup and reset steps
- backup and restore procedure
- event-log replay and bad-turn debugging steps
- incident checklist for model failures and timeouts
- release rollback notes for packaged builds

## Documentation Ownership

| Document | Owner Role | Update Trigger |
| --- | --- | --- |
| [ROADMAP.md](/g:/text-game/ROADMAP.md) | Tech lead | Phase change, scope change, or milestone resequencing |
| [BACKLOG.md](/g:/text-game/BACKLOG.md) | Current phase owner | Any status, dependency, or priority change |
| [REQUIREMENTS.md](/g:/text-game/REQUIREMENTS.md) | Product/UI lead | User-visible behavior or scope change |
| [README.md](/g:/text-game/README.md) | Tech lead | Setup or environment change |
