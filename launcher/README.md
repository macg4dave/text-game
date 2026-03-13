# SunRay

`launcher/` is the Rust home for the `SunRay` executable and its shared automation modules.

## Current contract

- `SunRay` is the supported automation surface for this repo.
- `SunRay` is one binary with focused subcommands, not a pile of wrapper aliases.
- Running `SunRay` with no subcommand now defaults to the `start-dev` launcher flow.
- Launcher-owned assets and fixtures should live under `launcher/assets/`.
- `SunRay` is not a webview shell.
- `SunRay` is not an installer.
- `SunRay` is not an updater.
- `SunRay` is not a package manager.
- `SunRay` is not a rewrite of the Node or TypeScript app runtime.
- Cross-platform release artifacts should be platform-native `SunRay` binaries that open the browser and coordinate Docker-backed runtime services.

## Command map

| Subcommand | Backlog slice | Current role |
| --- | --- | --- |
| `start-dev` | `T65b` | Supported launcher and Docker preflight flow |
| `test-local-ai-workflow` | `T65c` | Deterministic AI-contract checks plus optional live smoke |
| `test-setup-browser-smoke` | `T65e` | Targeted setup browser smoke harness |
| `validate-local-gpu-profile-matrix` | `T65d` | Launcher-owned GPU profile matrix validation |
| `validate-litellm-default-config` | `T65d` | Default LiteLLM config validation |

## Shared module layout

- `src/lib.rs` - public CLI surface and command-dispatch skeleton
- `src/config.rs` - command inventory, workspace-root discovery, and asset-path helpers
- `src/env.rs` - shared `.env` loading helpers
- `src/logging.rs` - shared logging bootstrap
- `src/error.rs` - reusable launcher-facing error types
- `src/process.rs` - external-process invocation helpers and command rendering
- `assets/local-gpu-profile-matrix.json` - launcher-owned local GPU selection contract

## How to inspect the command surface

Use Cargo directly:

- `cargo run --manifest-path launcher/Cargo.toml --`
- `cargo run --manifest-path launcher/Cargo.toml -- --help`
- `cargo build --release --target-dir launcher/target --manifest-path launcher/Cargo.toml`
- `cargo run --manifest-path launcher/Cargo.toml -- start-dev --no-browser`
- `cargo run --manifest-path launcher/Cargo.toml -- start-dev --rebuild`
- `cargo run --manifest-path launcher/Cargo.toml -- test-local-ai-workflow --persona practical-fixer`
- `cargo run --manifest-path launcher/Cargo.toml -- test-local-ai-workflow --persona-seed 7`
- `cargo run --manifest-path launcher/Cargo.toml -- test-local-ai-workflow --selection-only --report-json launcher/tmp/ai-validation.json`

Windows release builds from the supported command now produce `launcher/target/release/SunRay.exe`.
Launching `SunRay.exe` directly now behaves like `SunRay.exe start-dev`.

Or use the repo convenience scripts:

- `npm run sunray -- --help`
- `npm run sunray:check`
- `npm run sunray:test`
- `npm run sunray:build-release`
- `npm run sunray:start-dev -- --no-browser`
- `npm run sunray:test-setup-browser-smoke`
- `npm run sunray:validate-local-gpu-profile-matrix`
- `npm run sunray:validate-litellm-default-config`

`start-dev`, `test-local-ai-workflow`, `test-setup-browser-smoke`, `validate-local-gpu-profile-matrix`, and `validate-litellm-default-config` now run through Rust.

The full `test-local-ai-workflow` smoke now picks one test-player persona before the live AI turn check starts. You can let it choose at runtime, force a specific persona with `--persona`, or make the choice repeatable with `--persona-seed`. The supported personas are `curious-explorer`, `cautious-survivor`, `empathetic-talker`, and `practical-fixer`.

Use `--report-json <path>` when you want a machine-readable review bundle with the exact `SunRay` command, persona or seed details, overall pass or fail status, and stable per-scenario summaries.

The deterministic harness now also validates the scripted walkthrough matrix contract that backs the live story smoke. The current named walkthrough scenarios are:

- `story-sample-market-rumor`
- `story-sample-causeway-run`
- `story-sample-relay-finale`

During live smoke, those scenarios replay the canonical `story_sample` Ghostlight Relay path as multi-turn schema checks while keeping committed fixture outcomes server-owned instead of trusting model prose as truth.
