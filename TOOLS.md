# Tools and Control Endpoints

## Director Spec

- `GET /api/director/spec` returns the current director spec.
- `POST /api/director/reload` reloads `data/spec/director.json`.

## Quest Spec

- `GET /api/quests/spec` returns the current quest spec.
- `POST /api/quests/reload` reloads `data/spec/quests.json`.

## Notes

- Reload endpoints validate specs and return errors if invalid.
- Specs are used to steer AI behavior and enforce pacing rules.

## Script Helper Note

- Shared launcher and harness helper functions live in `scripts/lib/shared.ps1`.
- Prefer updating shared helpers there instead of duplicating script plumbing in multiple entry scripts.
- Local GPU tier selection for `scripts/start-dev.ps1 -AiStack local-gpu` also lives there; use `LOCAL_GPU_PROFILE_ID` or `LOCAL_GPU_VRAM_GB` for manual overrides instead of forking launcher logic.
