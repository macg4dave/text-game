# AI Control System

## Purpose
Keep the narrative flexible while ensuring the story advances toward the end goal using deterministic, server-side rules.

## Control Layers
1. **State Source of Truth**
   - All facts live in SQLite. The model only reads a compact state pack.

2. **Director Spec**
   - Defined in `data/spec/director.json`.
   - Organizes the story into acts and beats.
   - Each beat lists `required_flags` and `unlock_flags`.

3. **Server-Side Enforcement**
   - The model may suggest flags and progress text.
   - The server computes beat progression and updates `director_state`.
   - End goal is immutable.

## Beat Progression Rules
- A beat advances only when the model adds an `unlock_flag` for the current beat.
- The server automatically moves to the next beat that meets its `required_flags`.
- Beat progression is limited to `max_beats_per_turn` (default 1).

## Director State Fields
- `end_goal`
- `current_act_id`, `current_act`
- `current_beat_id`, `current_beat_label`
- `story_beats_remaining`
- `end_goal_progress`
- `completed_beats`

## Model Contract
The model must return JSON:
- `narrative`
- `player_options`
- `state_updates` (including `flags_add`)
- `director_updates.end_goal_progress`
- `memory_updates`

## Why This Works
- Player freedom is preserved because the model can interpret any action.
- Story direction is enforced by server logic, not model opinion.
- Token usage stays low via compact state and summaries.
