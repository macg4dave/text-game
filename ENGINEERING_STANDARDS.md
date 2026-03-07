# Engineering Standards

This document holds the cross-cutting delivery rules for the project. It is intentionally operational and should change less often than the backlog but more often than the roadmap.

## Definition of Done

A phase or backlog item is complete only when all relevant conditions below are met:

- Exit criteria are validated through tests or documented manual checks.
- Schema changes include version updates and migrations where applicable.
- Replay-affecting changes include updated replay fixtures.
- Backlog state is updated in [BACKLOG.md](/g:/text-game/BACKLOG.md).
- Scope or behavior changes are reflected in [REQUIREMENTS.md](/g:/text-game/REQUIREMENTS.md).
- Setup, environment, or key path changes are reflected in [README.md](/g:/text-game/README.md).

## Delivery Budget Register

Numeric targets are required before Phase 0 closes. Until then, this register is intentionally incomplete.

| Metric | Target | Owner | Must Be Set By | Notes |
| --- | --- | --- | --- | --- |
| p95 `/api/turn` latency in local dev | TBD | Tech lead | Phase 0 exit | Measured on the baseline fixture suite |
| Max total tokens per turn | TBD | AI systems lead | Phase 0 exit | Input plus output |
| Cost per 100 turns | TBD | AI systems lead | Phase 0 exit | Based on the default model aliases |
| Schema validation pass rate in CI fixtures | 100% | Tech lead | Phase 0 exit | Any failure blocks release progression |
| DB growth per 1,000 turns | TBD | Tech lead | Phase 0 exit | Event log plus memory storage |

## Schema and Migration Policy

- All external payloads are versioned: turn input, turn output, and authoritative state.
- Backward compatibility rules must be written before save/load is implemented.
- SQLite schema changes are applied by migrations only.
- Any change that affects replay determinism requires a golden fixture update.
- Version compatibility for saves must be tested before Phase 5 can close.

## Test Minimums

- Unit tests for reducers, validators, ranking, and other pure functions
- Integration tests for the turn pipeline using fixtures
- Golden replay tests for deterministic scripted runs
- Fuzz tests for validator and sanitizer inputs
- CI execution on every push by Phase 4

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
