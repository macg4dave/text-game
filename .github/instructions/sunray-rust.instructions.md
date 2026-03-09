---
applyTo: "launcher/**/*.rs,launcher/Cargo.toml,launcher/README.md"
description: "Use for Rust work in launcher/SunRay, including subcommand design, parity migration from legacy PowerShell scripts, launcher harness changes, and shared Rust automation modules."
---

# SunRay Rust Instructions

## Purpose

Use these instructions for work in `launcher/` and the `SunRay` Rust executable.

`SunRay` is the repo's Rust launcher and automation harness. It replaces legacy PowerShell orchestration a script at a time, but it does **not** replace the Node/TypeScript app runtime, Electron packaging, Docker configuration, or gameplay logic.

## Required grounding before substantial Rust changes

Read these project files before making non-trivial `SunRay` changes:

1. `ROADMAP.md`
2. `BACKLOG.md`
3. `ENGINEERING_STANDARDS.md`
4. `ARCHITECTURE.md`
5. `launcher/README.md`

Use `BACKLOG.md` as the execution source of truth for launcher work.

## Current SunRay command surface

Preserve the current subcommand names unless the task explicitly changes the CLI contract:

- `start-dev`
- `test-local-ai-workflow`
- `test-setup-browser-smoke`
- `validate-local-gpu-profile-matrix`
- `validate-litellm-default-config`
- `start-desktop-prototype`

## SunRay boundary rules

- `SunRay` is an automation launcher and harness runtime only.
- It may orchestrate Docker, npm, Node, browser launch, and Electron prototype flows.
- It is **not** a webview shell.
- It is **not** an installer.
- It is **not** an updater.
- It is **not** a package manager.
- It is **not** a replacement for Electron.
- It is **not** a rewrite of the Node or TypeScript app runtime.

If a change would move product/runtime responsibilities into Rust instead of orchestration responsibilities, stop and re-scope.

## Migration rules

- Migrate one legacy script at a time.
- Match the current behavior in `SunRay` before deleting the legacy script.
- Delete the migrated legacy script in the same migration slice after parity is validated.
- Do not add new `.ps1`, `.sh`, or `.bat` automation.
- Keep shared concerns in Rust modules rather than duplicating process/env/retry logic across commands.

## Rust implementation preferences for this repo

- Prefer idiomatic Rust and minimal patches.
- Use `clap` for CLI parsing and preserve user-facing command names.
- Use `anyhow` at the command boundary and `thiserror` for reusable structured errors when that adds clarity.
- Prefer `Result`-based flows; avoid `unwrap()` and `expect()` outside tests or tiny invariant checks.
- Keep user-facing errors plain-language and launcher-oriented.
- Keep Windows process and path handling explicit and conservative.
- Quote or normalize paths when invoking external tools.
- Reuse focused modules such as `process`, `env`, `logging`, `error`, and `config` rather than letting `main.rs` grow into a mixed bucket.

## Validation expectations

For Rust code changes in `launcher/`:

- Run `cargo check --manifest-path launcher/Cargo.toml`
- Run `cargo test --manifest-path launcher/Cargo.toml`

If you change command behavior, also run the relevant command path, for example:

- `cargo run --manifest-path launcher/Cargo.toml -- start-dev --no-browser`
- `cargo run --manifest-path launcher/Cargo.toml -- test-local-ai-workflow --selection-only`
- `cargo run --manifest-path launcher/Cargo.toml -- validate-local-gpu-profile-matrix`

For AI-harness-related changes, define or tighten the deterministic test or harness step **before** changing behavior.

## Documentation and backlog sync

When the supported Rust launcher surface changes:

- update `BACKLOG.md`
- update `README.md` if user-facing commands or setup guidance changed
- keep examples aligned with the current `SunRay` command surface

Do not leave prompt assets, docs, and backlog notes disagreeing about whether PowerShell or Rust is the supported automation path.
