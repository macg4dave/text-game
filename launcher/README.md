# SunRay

`launcher/` is reserved for the Rust launcher executable `SunRay`.

Current contract:

- `SunRay` is the replacement target for the legacy `.ps1` automation surface.
- `SunRay` must reach parity with each legacy script before that script is deleted.
- `SunRay` is not a webview shell.
- `SunRay` is not an installer.
- `SunRay` is not an updater.
- `SunRay` is not a package manager.
- `SunRay` is not a replacement for Electron.
- `SunRay` is not a rewrite of the Node or TypeScript app runtime.

Near-term intent:

- add `launcher/Cargo.toml`
- add the `SunRay` binary entrypoint
- migrate one legacy script at a time into Rust
- delete each migrated script after parity is validated
