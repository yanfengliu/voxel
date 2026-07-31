import type { ScenePlacementPoseV1 } from './scene-pose-delta.js';
import {
  windmillFlourPoseV1,
  windmillWheatSackPoseV1,
} from './windmill-production-kinematics.js';
import { WINDMILL_PRODUCTION_PLACEMENT_IDS_V1 } from './windmill-production-layout.js';

/**
 * The mill's material flow, keyed to blows that actually happen.
 *
 * The wheat and flour were never solver output — they are authored
 * presentation kinematics, and they claim nothing about milling. What changes
 * live is where their schedule comes from: it used to read five impact ticks
 * out of a recording, and now it watches the hammer.
 *
 * That inverts one thing that cannot be inverted for free. A sack has to leave
 * the queue *before* the blow it is milled by, and nothing can know a future
 * impact. So the mill's own rhythm is measured — a loaded mill keeps a steady
 * beat — and the next blow is predicted one interval ahead of the last one.
 * The prediction only ever moves a sack; if the mill slows, speeds up or
 * stops, the sacks follow the blows that did land, because every impact
 * already observed replaces its own prediction.
 *
 * Until two blows have landed there is no measurable beat, so nothing advances
 * and the queue simply waits. A mill that has not struck twice has not
 * established that it is running.
 */

/** A blow is one rising edge of hammer-on-anvil contact, not every touching tick. */
export interface WindmillLiveProductionStateV1 {
  readonly impactsSeconds: readonly number[];
  readonly beatSeconds: number | null;
  readonly touching: boolean;
}

const SACK_IDS = WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.wheatSacks;

function quaternionOf(pose: { readonly quaternion: readonly [number, number, number, number] }):
readonly [number, number, number, number] {
  return pose.quaternion;
}

export class WindmillLiveProductionV1 {
  readonly #impacts: number[] = [];
  #touching = false;

  /**
   * Records the hammer's contact for this instant.
   *
   * Contact lasts several ticks, so only the rising edge counts; without that
   * a single blow would read as a burst of them and the flour would jump.
   */
  observe(timeSeconds: number, hammerTouchesAnvil: boolean): void {
    if (hammerTouchesAnvil && !this.#touching) this.#impacts.push(timeSeconds);
    this.#touching = hammerTouchesAnvil;
  }

  state(): WindmillLiveProductionStateV1 {
    return {
      impactsSeconds: [...this.#impacts],
      beatSeconds: this.#beat(),
      touching: this.#touching,
    };
  }

  /** The mill's measured beat, or null before it has struck twice. */
  #beat(): number | null {
    if (this.#impacts.length < 2) return null;
    const first = this.#impacts[0]!;
    const last = this.#impacts[this.#impacts.length - 1]!;
    return (last - first) / (this.#impacts.length - 1);
  }

  /**
   * When sack `index` is milled: the blow that landed, or the one the mill's
   * beat says is coming.
   */
  #impactFor(index: number): number | null {
    const observed = this.#impacts[index];
    if (observed !== undefined) return observed;
    const beat = this.#beat();
    if (beat === null) return null;
    const last = this.#impacts[this.#impacts.length - 1]!;
    return last + beat * (index - (this.#impacts.length - 1));
  }

  /**
   * Poses for the five sacks and the flour level at this instant, ready to
   * merge into the live pose map. A sack whose blow is neither landed nor yet
   * predictable is left alone, so it rests wherever the scene placed it.
   */
  poses(timeSeconds: number): ReadonlyMap<string, ScenePlacementPoseV1> {
    const poses = new Map<string, ScenePlacementPoseV1>();
    SACK_IDS.forEach((placementId, index) => {
      const impact = this.#impactFor(index);
      if (impact === null) return;
      const pose = windmillWheatSackPoseV1(index, impact, timeSeconds);
      poses.set(placementId, {
        translation: pose.translation,
        quaternion: quaternionOf(pose),
      });
    });
    const flour = windmillFlourPoseV1(this.#impacts, timeSeconds);
    poses.set(WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.flourHeap, {
      translation: flour.translation,
      quaternion: quaternionOf(flour),
    });
    return poses;
  }
}
