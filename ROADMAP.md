# Roadmap

## Vision
Build a portable text-based adventure that gives players maximum freedom while a director layer steers toward a defined end goal using compact memory and structured state updates.

## Milestones
1. M1 - Core Loop (Target: Feb 2026)
2. M2 - Memory + Director Layer (Target: Feb 2026)
3. M3 - Quest + World State Tools (Target: Mar 2026)
4. M4 - UX Polish + Portability (Target: Mar 2026)

## Tracker
| ID | Priority | Item | Status | Notes |
| --- | --- | --- | --- | --- |
| T1 | P1 | Node server + API routes | Done | /api/state, /api/turn |
| T2 | P1 | SQLite state + event log | Done | players/events/memories |
| T3 | P1 | OpenAI Responses API wiring | Done | JSON schema output |
| T4 | P1 | Web UI shell | Done | input, log, options |
| T5 | P1 | Story director contract | Done | system rules enforced |
| T6 | P2 | Embeddings + memory retrieval | In Progress | cosine similarity in-app |
| T11 | P1 | Output validator | Done | sanitize model output |
| T12 | P1 | Local spellcheck/autocomplete | Done | lightweight CPU assist |
| T13 | P1 | Director spec + beat enforcement | Done | server-side rules |
| T14 | P2 | Director spec validator + reload | Done | /api/director/reload |
| T15 | P2 | Quest spec validator + reload | Done | /api/quests/reload |
| T7 | P2 | Quest editor + tools | Planned | admin UI |
| T8 | P3 | Save slots + export | Planned | JSON export |
| T9 | P3 | Accessibility pass | Planned | keyboard + contrast |
| T10 | P4 | Desktop wrapper | Planned | Tauri/Electron |

## P1-P4 Priority List
P1. Core loop, state, director steering, stable JSON outputs
P2. Memory retrieval, quest tooling, safety rails
P3. Save/load, export, polish, accessibility
P4. Desktop packaging and distribution

## Blockers
None currently.

## Risks
- Prompt drift could weaken the director layer without tight schema checks
- Token usage could spike if summaries are not compact

## Decisions Locked
- Node.js backend + SQLite
- Web frontend for portability
- OpenAI Responses API + Structured Outputs
