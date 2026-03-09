# SunRay

`launcher/` is the Rust home for the `SunRay` executable and its shared automation modules.

## Current contract

- `SunRay` is the replacement target for the legacy `.ps1` automation surface.
- `SunRay` must reach parity with each legacy script before that script is deleted.
- `SunRay` is one binary with parity-focused subcommands, not a pile of wrapper aliases.
- `SunRay` is not a webview shell.
- `SunRay` is not an installer.
- `SunRay` is not an updater.
- `SunRay` is not a package manager.
- `SunRay` is not a replacement for Electron.
- `SunRay` is not a rewrite of the Node or TypeScript app runtime.

## Command map

| Subcommand | Legacy parity target | Backlog slice | Current status |
| --- | --- | --- | --- |
| `start-dev` | `scripts/start-dev.ps1` | `T65b` | Implemented in Rust; legacy script deleted |
| `test-local-ai-workflow` | `scripts/test-local-ai-workflow.ps1` | `T65c` | Implemented in Rust; awaiting manual legacy-script deletion |
| `test-setup-browser-smoke` | `scripts/test-setup-browser-smoke.ps1` | `T65e` | CLI scaffolded; behavior parity pending |
| `validate-local-gpu-profile-matrix` | `scripts/validate-local-gpu-profile-matrix.ps1` | `T65d` | CLI scaffolded; behavior parity pending |
| `validate-litellm-default-config` | `scripts/validate-litellm-default-config.ps1` | `T65d` | CLI scaffolded; behavior parity pending |
| `start-desktop-prototype` | `scripts/start-desktop-prototype.ps1` | `T65e` | CLI scaffolded; behavior parity pending |

## Shared module layout

- `src/lib.rs` - public CLI surface and command-dispatch skeleton
- `src/config.rs` - command inventory and workspace-root discovery
- `src/env.rs` - shared `.env` loading helpers
- `src/logging.rs` - shared logging bootstrap
- `src/error.rs` - reusable launcher-facing error types
- `src/process.rs` - external-process invocation helpers and command rendering

## How to inspect the command surface

Use Cargo directly:

- `cargo run --manifest-path launcher/Cargo.toml -- --help`
- `cargo run --manifest-path launcher/Cargo.toml -- start-dev --no-browser`
- `cargo run --manifest-path launcher/Cargo.toml -- start-dev --rebuild`

Or use the repo convenience scripts:

- `npm run sunray -- --help`
- `npm run sunray:check`
- `npm run sunray:test`
- `npm run sunray:start-dev -- --no-browser`

`start-dev` is the first migrated launcher path. The remaining subcommands still expose the scaffolded contract until their parity slices land.

## Migration rule

- Migrate one legacy script at a time.
- Match behavior in `SunRay` first.
- Delete the legacy script in the same slice after parity validation.
- Do not add new `.ps1`, `.sh`, or `.bat` automation.
