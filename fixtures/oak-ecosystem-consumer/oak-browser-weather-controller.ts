import { oakWindTravelOverHostTicksV1 } from './oak-mechanics.js';
import type { OakSimulationControllerV1 } from './oak-simulation.js';
import type { OakSimulationSnapshotV1 } from './oak-types.js';
import {
  OAK_RAIN_FALL_TICKS_V1,
  OAK_RAIN_PRESENTATION_TICKS_V1,
  type OakRainPresentationEventV1,
} from './oak-weather-voxel-presentation.js';

export interface OakBrowserRainPresentationEventV1 extends OakRainPresentationEventV1 {
  readonly authoritativePulseApplied: boolean;
}

export interface OakBrowserWeatherPresentationStateV1 {
  readonly windTravelM: number;
  readonly rainEvent: OakBrowserRainPresentationEventV1 | undefined;
}

export type OakBrowserRainStartResultV1 =
  | Readonly<{ status: 'started'; event: OakBrowserRainPresentationEventV1 }>
  | Readonly<{ status: 'active'; event: OakBrowserRainPresentationEventV1 }>;

/** Owns browser-only weather cue phase while delegating water and wind authority. */
export class OakBrowserWeatherControllerV1 {
  #epoch: string;
  #hostTick: number;
  #windTravelM = 0;
  #rainEvent: OakBrowserRainPresentationEventV1 | undefined;
  #nextRainEventId = 1;

  constructor(snapshot: OakSimulationSnapshotV1) {
    this.#epoch = snapshot.epoch;
    this.#hostTick = snapshot.hostTick;
  }

  presentation(): OakBrowserWeatherPresentationStateV1 {
    return { windTravelM: this.#windTravelM, rainEvent: this.#rainEvent };
  }

  startRain(snapshot: OakSimulationSnapshotV1, liters: number): OakBrowserRainStartResultV1 {
    if (!Number.isFinite(liters) || liters <= 0) {
      throw new RangeError(
        `Oak browser rain liters must be finite and positive; received ${String(liters)}.`,
      );
    }
    const active = this.#rainEvent !== undefined
      && snapshot.hostTick - this.#rainEvent.startedHostTick < OAK_RAIN_PRESENTATION_TICKS_V1;
    if (active) return { status: 'active', event: this.#rainEvent! };
    const event: OakBrowserRainPresentationEventV1 = {
      id: this.#nextRainEventId,
      startedHostTick: snapshot.hostTick,
      startedWindTravelM: this.#windTravelM,
      liters,
      authoritativePulseApplied: false,
    };
    this.#nextRainEventId += 1;
    this.#rainEvent = event;
    return { status: 'started', event };
  }

  #applyRainPulseAtContact(simulation: OakSimulationControllerV1): void {
    const event = this.#rainEvent;
    if (event === undefined || event.authoritativePulseApplied) return;
    const snapshot = simulation.snapshot();
    if (snapshot.hostTick < event.startedHostTick + OAK_RAIN_FALL_TICKS_V1) return;
    simulation.applyCommand({ kind: 'rainfall-pulse', liters: event.liters });
    this.#rainEvent = { ...event, authoritativePulseApplied: true };
  }

  advanceHostTicks(simulation: OakSimulationControllerV1, count: number): void {
    const snapshot = simulation.snapshot();
    const event = this.#rainEvent;
    if (event === undefined || event.authoritativePulseApplied) {
      simulation.advanceHostTicks(count);
      return;
    }
    const contactTick = event.startedHostTick + OAK_RAIN_FALL_TICKS_V1;
    if (snapshot.hostTick >= contactTick) {
      this.#applyRainPulseAtContact(simulation);
      simulation.advanceHostTicks(count);
      return;
    }
    if (!Number.isSafeInteger(count) || count < 0 || snapshot.hostTick + count < contactTick) {
      simulation.advanceHostTicks(count);
      return;
    }
    const ticksUntilContact = contactTick - snapshot.hostTick;
    simulation.advanceHostTicks(ticksUntilContact);
    this.#applyRainPulseAtContact(simulation);
    simulation.advanceHostTicks(count - ticksUntilContact);
  }

  sync(simulation: OakSimulationControllerV1): OakSimulationSnapshotV1 {
    const snapshot = simulation.snapshot();
    if (snapshot.epoch !== this.#epoch || snapshot.hostTick < this.#hostTick) {
      this.#epoch = snapshot.epoch;
      this.#hostTick = snapshot.hostTick;
      this.#windTravelM = 0;
      this.#rainEvent = undefined;
      this.#nextRainEventId = 1;
      return snapshot;
    }
    if (snapshot.hostTick > this.#hostTick && snapshot.wind.regime === 'breeze') {
      this.#windTravelM += oakWindTravelOverHostTicksV1(
        this.#hostTick,
        snapshot.hostTick,
        snapshot.wind.regime,
      );
    }
    this.#hostTick = snapshot.hostTick;
    return snapshot;
  }

  clearExpired(snapshot: OakSimulationSnapshotV1): void {
    if (this.#rainEvent !== undefined
      && snapshot.hostTick - this.#rainEvent.startedHostTick >= OAK_RAIN_PRESENTATION_TICKS_V1) {
      this.#rainEvent = undefined;
    }
  }
}
