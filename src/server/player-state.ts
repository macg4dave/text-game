import type { DirectorSpec, DirectorState, Player } from "../core/types.js";
import { getInitialDirectorState } from "../story/director.js";

type LegacyDirectorState = Partial<DirectorState> & { current_act?: string };

export function normalizeDirectorState(
  player: Player,
  directorSpec: DirectorSpec
): { director: DirectorState; changed: boolean } {
  const initial = getInitialDirectorState(directorSpec);
  const director = (player.director_state || initial) as LegacyDirectorState;
  const missingFields = !director.current_act_id || !director.current_beat_id || !director.current_beat_label;
  if (!missingFields) {
    return { director: director as DirectorState, changed: false };
  }

  const fallback: DirectorState = {
    ...initial,
    end_goal_progress: director.end_goal_progress || initial.end_goal_progress
  };

  if (director.current_act && director.current_act_id === undefined) {
    const act = directorSpec.acts.find((item) => item.name === director.current_act);
    if (act) {
      fallback.current_act_id = act.id;
      fallback.current_act = act.name;
      fallback.current_beat_id = act.beats[0]?.id || fallback.current_beat_id;
      fallback.current_beat_label = act.beats[0]?.label || fallback.current_beat_label;
    }
  }

  return { director: fallback, changed: true };
}
