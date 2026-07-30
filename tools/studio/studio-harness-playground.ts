import type { LiveBodySnapshotV1 } from './live-physics.js';
import type { StudioLiveInteract } from './studio-live-interact.js';
import type { StudioPlaygroundPanelV1 } from './studio-playground-panel.js';

/**
 * The harness's playground sub-object: everything the panel can do, as
 * synchronous plain-data calls, so browser tests drive the playground the
 * way a person does — same code paths, same guardrails.
 */

export interface VoxelStudioPlaygroundStateV1 {
  /** A playground scene is open and the panel is showing. */
  readonly available: boolean;
  readonly running: boolean;
  readonly paused: boolean;
  readonly timeScale: number;
  readonly stepped: number;
  readonly bodies: number;
  readonly activeBodies: number;
  readonly activeVoxels: number;
  readonly contacts: number;
  readonly pendingSpawns: number;
  readonly stepMs: number;
  readonly frameMs: number;
  readonly rampAngleDegrees: number | null;
  readonly selectedBody: string | null;
  readonly overlayOn: boolean;
}

export interface VoxelStudioPlaygroundHarnessV1 {
  state(): VoxelStudioPlaygroundStateV1;
  /** Full per-body solver readouts, sorted by placement id. */
  bodies(): readonly LiveBodySnapshotV1[];
  pause(): void;
  resume(): void;
  /** Advances exactly `count` fixed ticks (default 1); works while paused. */
  stepOnce(count?: number): void;
  setTimeScale(scale: number): void;
  /** Rebuilds the station; `all` also restores its defaults. */
  reset(all?: boolean): void;
  spawnNext(): string | null;
  fireCase(caseId: string): boolean;
  setRampAngle(degrees: number): void;
  selectBody(placementId: string | null): void;
  removeBody(placementId: string): void;
  impulse(placementId: string, impulse: readonly [number, number, number]): void;
  setOverlay(on: boolean): void;
}

export interface PlaygroundHarnessHostV1 {
  readonly interact: () => StudioLiveInteract;
  readonly panel: () => StudioPlaygroundPanelV1 | null;
}

export function createPlaygroundHarness(
  host: PlaygroundHarnessHostV1,
): VoxelStudioPlaygroundHarnessV1 {
  const requireSession = () => {
    const session = host.interact().session();
    if (session === null) {
      throw new Error(
        'The playground has no live world: open a playground scene and wait '
        + 'for livePhysics().running before driving the transport.',
      );
    }
    return session;
  };
  const requirePanel = () => {
    const panel = host.panel();
    if (panel?.visible() !== true) {
      throw new Error(
        'No playground scene is open, so the panel controls are absent. '
        + 'Open a studio:scene:physics-* scene first.',
      );
    }
    return panel;
  };
  return {
    state() {
      const panel = host.panel();
      const session = host.interact().session();
      const available = panel?.visible() ?? false;
      if (!available || session === null) {
        return {
          available,
          running: session !== null,
          paused: false,
          timeScale: 1,
          stepped: 0,
          bodies: 0,
          activeBodies: 0,
          activeVoxels: 0,
          contacts: 0,
          pendingSpawns: 0,
          stepMs: 0,
          frameMs: 0,
          rampAngleDegrees: panel?.rampAngleDegrees() ?? null,
          selectedBody: panel?.selectedBody() ?? null,
          overlayOn: panel?.overlayOn() ?? false,
        };
      }
      const state = session.state();
      const activity = session.activity();
      const timing = host.interact().timing();
      return {
        available,
        running: true,
        paused: state.paused,
        timeScale: state.timeScale,
        stepped: state.stepped,
        bodies: state.bodies,
        activeBodies: activity.activeBodies,
        activeVoxels: activity.activeVoxels,
        contacts: session.contactCount(),
        pendingSpawns: session.pendingSpawns().length,
        stepMs: timing.stepMs,
        frameMs: timing.frameMs,
        rampAngleDegrees: panel?.rampAngleDegrees() ?? null,
        selectedBody: panel?.selectedBody() ?? null,
        overlayOn: panel?.overlayOn() ?? false,
      };
    },
    bodies: () => requireSession().snapshot(),
    pause() {
      requireSession().setPaused(true);
    },
    resume() {
      requireSession().setPaused(false);
    },
    stepOnce(count = 1) {
      if (!Number.isInteger(count) || count < 1 || count > 10_000) {
        throw new Error(
          `stepOnce takes an integer count in 1..10000, got ${String(count)}.`,
        );
      }
      const session = requireSession();
      for (let index = 0; index < count; index += 1) session.stepOnce();
      requirePanel().sync();
    },
    setTimeScale(scale) {
      requireSession().setTimeScale(scale);
    },
    reset(all = false) {
      requirePanel().reset(all);
    },
    spawnNext: () => requirePanel().spawnNext(),
    fireCase: (caseId) => requirePanel().fireCase(caseId),
    setRampAngle(degrees) {
      requirePanel().setRampAngle(degrees);
    },
    selectBody(placementId) {
      requirePanel().selectBody(placementId);
    },
    removeBody(placementId) {
      requireSession().removeBody(placementId);
      requirePanel().sync();
    },
    impulse(placementId, impulse) {
      requireSession().applyImpulse(placementId, impulse);
    },
    setOverlay(on) {
      requirePanel().setOverlay(on);
    },
  };
}
