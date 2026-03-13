---
name: "SunRay Script Parity Migration"
description: "Use when retiring one legacy launcher entrypoint into Rust SunRay with parity-first, delete-after-validation rules."
---

Context
-------
This prompt is for `T65`-style migration work in `text-game`, where one retired launcher entrypoint is replaced by a matching `SunRay` Rust subcommand.

Relevant repo facts
-------------------
- Rust crate: `launcher/Cargo.toml`
- Launcher docs: `launcher/README.md`
- Source of truth for launcher work: `BACKLOG.md`
- Legacy launcher entrypoints, when still present, live under `scripts/`
- Shared retired helpers should be replaced by focused modules under `launcher/src/`
- Shared Rust replacements should live under `launcher/src/`

Parity rules
------------
- Migrate **one** legacy script at a time.
- Match behavior in Rust before deleting the script.
- Delete the migrated script in the same slice after parity is validated.
- Do not add new shell wrappers as a permanent compatibility layer.
- Keep Docker, npm, Node, Electron, and browser behavior as invoked dependencies rather than reimplementing them.

Non-goals
---------
- Do not rewrite the TypeScript gameplay runtime.
- Do not redesign Docker Compose.
- Do not turn `SunRay` into a desktop runtime or installer.
- Do not widen scope into unrelated backlog tasks.

Prompt template
---------------
Task:
"""
Migrate `<legacy_script_path>` into `SunRay` command `<subcommand_name>`.

Details:
- Existing behavior to preserve: <dotenv loading, Docker checks, polling, logging, browser launch, config validation, smoke sequence, etc.>
- Legacy helper files involved: <scripts/lib/...>
- Rust files to update: <launcher/src/main.rs and focused modules>
- Validation to run: <cargo check/test + cargo run for the subcommand>
- Delete after parity: <yes/no, and which script should be removed>
- Constraints / do not modify: <Docker files, app runtime, Electron packaging, unrelated scripts>
"""

Assistant instructions
----------------------
1. Start by listing the exact parity behaviors to keep.
2. Extract reusable logic into focused Rust modules instead of inflating `main.rs`.
3. Preserve user-facing command names and recovery copy unless the task explicitly changes them.
4. Add focused tests for the Rust behavior where practical.
5. Run:
   - `cargo check --manifest-path launcher/Cargo.toml`
   - `cargo test --manifest-path launcher/Cargo.toml`
   - `cargo run --manifest-path launcher/Cargo.toml -- <subcommand_name> ...`
6. Only remove the legacy script after parity is validated.
7. Update `BACKLOG.md` and any affected docs in the same session.

Example prompts
---------------
- "Task: Confirm the retired `start-dev` launcher flow now lives in `SunRay` command `start-dev`. Details: preserve dotenv loading, Docker and GPU checks, port fallback, readiness polling, and `--no-browser`. Legacy helper files involved: any remaining `scripts/` launcher helpers. Rust files to update: `launcher/src/main.rs`, `launcher/src/env.rs`, `launcher/src/process.rs`, `launcher/src/config.rs`. Validation to run: cargo check/test plus `cargo run --manifest-path launcher/Cargo.toml -- start-dev --no-browser`. Delete after parity: yes, remove any retired launcher entrypoint once validated. Constraints / do not modify: `docker-compose.yml`, `src/` application code."
