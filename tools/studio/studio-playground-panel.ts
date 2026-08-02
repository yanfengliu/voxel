import type { SceneV1 } from './scene.js';
import type { StudioLiveInteract } from './studio-live-interact.js';
import {
  LIVE_TICKS_PER_SECOND_V1,
  type LiveBodySnapshotV1,
  type LivePhysicsSessionV1,
} from './live-physics.js';
import type { PhysicalOverlaySegmentV1 } from './physical-overlay.js';
import {
  createPhysicsPlaygroundStationsV1,
  physicsPlaygroundStationV1,
  type PlaygroundStationV1,
} from './physics-playground-stations.js';
import {
  playgroundBodySpecsV1,
  type PlaygroundBodySpecV1,
} from './physics-playground-bodies.js';

/**
 * The physics playground's control panel: transport, cases, spawn, remove,
 * impulse, ramp angle, station switching, and the debug readout. It appears
 * only while a playground scene is open, and every control drives the live
 * Interact session — the panel owns no physics, only buttons and numbers.
 *
 * Scripted case actions fire immediately when clicked; their authored tick
 * delays matter to the deterministic headless runner, where the same cases
 * replay exactly.
 */

export interface StudioPlaygroundPanelDepsV1 {
  readonly interact: StudioLiveInteract;
  /** Opens another scene by id, exactly like clicking it in the rail. */
  readonly openSceneById: (sceneId: string) => void;
  /** The stage overlay this panel feeds with world-space segments. */
  readonly overlay: {
    setSegments(segments: readonly PhysicalOverlaySegmentV1[]): void;
    setVisible(on: boolean): void;
    visible(): boolean;
  };
  readonly redraw: () => void;
}

export interface StudioPlaygroundPanelV1 {
  readonly root: HTMLElement;
  /** Adopts the newly opened scene; hides when it is not a playground scene. */
  sceneOpened(scene: SceneV1 | null): void;
  /** The angle the profile resolver builds ramp stations at. */
  rampAngleDegrees(): number | undefined;
  visible(): boolean;
  /** The body the inspector reads; null selects the first dynamic body. */
  selectBody(placementId: string | null): void;
  selectedBody(): string | null;
  /** Fires a station case now; false when no such case or no live world. */
  fireCase(caseId: string): boolean;
  /** Spawns the next queued magazine block; null when none remain. */
  spawnNext(): string | null;
  /** Selects a ramp angle and rebuilds; throws on a non-listed angle. */
  setRampAngle(degrees: number): void;
  setOverlay(on: boolean): void;
  overlayOn(): boolean;
  /** Resets the current station (rebuild); `all` also restores defaults. */
  reset(all?: boolean): void;
  station(): PlaygroundStationV1 | null;
  /** One readout/overlay refresh; the panel also runs its own interval. */
  sync(): void;
  dispose(): void;
}

function button(label: string, title: string, run: () => void): HTMLButtonElement {
  const control = document.createElement('button');
  control.className = 'toggle';
  control.textContent = label;
  control.title = title;
  control.addEventListener('click', run);
  return control;
}

function fixed(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : String(value);
}

function vec(values: readonly [number, number, number], digits = 2): string {
  return `(${fixed(values[0], digits)}, ${fixed(values[1], digits)}, ${fixed(values[2], digits)})`;
}

const REFRESH_MS = 200;
/** Impulse control: a 3 m/s velocity change scaled by the body's own mass. */
const IMPULSE_SPEED = 3;

export function createStudioPlaygroundPanel(
  deps: StudioPlaygroundPanelDepsV1,
): StudioPlaygroundPanelV1 {
  const root = document.createElement('section');
  root.className = 'playground-panel';
  root.hidden = true;

  let station: PlaygroundStationV1 | null = null;
  let angle: number | undefined;
  let chosenBody: string | null = null;
  let spawnCount = 0;

  const title = document.createElement('h3');
  title.textContent = 'Physics playground';
  const stationRow = document.createElement('div');
  stationRow.className = 'playground-row';
  const transportRow = document.createElement('div');
  transportRow.className = 'playground-row';
  const caseRow = document.createElement('div');
  caseRow.className = 'playground-row';
  const bodyRow = document.createElement('div');
  bodyRow.className = 'playground-row';
  const readout = document.createElement('pre');
  readout.className = 'playground-readout';

  const session = (): LivePhysicsSessionV1 | null => deps.interact.session();
  let controlNotice: string | null = null;
  const guarded = (run: () => void): void => {
    try {
      controlNotice = null;
      run();
    } catch (error) {
      controlNotice = error instanceof Error ? error.message : String(error);
      sync();
    }
  };

  // --- station switching ---
  const stationSelect = document.createElement('select');
  stationSelect.title = 'Switch to another playground station scene.';
  stationSelect.addEventListener('change', () => {
    if (stationSelect.value && stationSelect.value !== station?.sceneId) {
      deps.openSceneById(stationSelect.value);
    }
  });
  stationRow.append(stationSelect);

  // --- ramp angle ---
  const angleSelect = document.createElement('select');
  angleSelect.title = 'Rebuilds the live world with the ramp at this angle. '
    + 'The authored scene stays flat; the pitch exists only in the solver '
    + 'and its presented poses.';
  angleSelect.hidden = true;
  angleSelect.addEventListener('change', () => {
    angle = Number(angleSelect.value);
    spawnCount = 0;
    deps.interact.rebuild();
  });
  stationRow.append(angleSelect);

  // --- transport ---
  const pauseButton = button('pause', 'Freezes the solver clock; the world '
    + 'holds its exact state until resumed or stepped.', () => {
    const live = session();
    if (!live) return;
    live.setPaused(!live.paused());
    syncTransport();
  });
  const stepButton = button('tick', `Advances exactly one ${
    String(Math.round(1_000 / LIVE_TICKS_PER_SECOND_V1 * 100) / 100)
  } ms solver tick — works while paused, which is what makes it a debugger.`, () => {
    session()?.stepOnce();
    deps.redraw();
    sync();
  });
  const slowButton = button('slow', 'Quarter-speed time, for watching an '
    + 'impact happen instead of having happened.', () => {
    const live = session();
    if (!live) return;
    live.setTimeScale(live.timeScale() === 1 ? 0.25 : 1);
    syncTransport();
  });
  function reset(all = false): void {
    spawnCount = 0;
    if (all) {
      angle = station?.defaultRampAngleDegrees;
      if (angle !== undefined) angleSelect.value = String(angle);
    }
    deps.interact.rebuild();
  }
  const resetButton = button('reset station', 'Rebuilds the live world from '
    + 'the station definition — every body returns to its exact starting '
    + 'state.', () => { reset(false); });
  const resetAllButton = button('reset playground', 'Resets this station to '
    + 'its defaults — ramp angle included — and rebuilds.', () => {
    reset(true);
  });
  transportRow.append(pauseButton, stepButton, slowButton, resetButton, resetAllButton);

  // --- body actions ---
  const bodySelect = document.createElement('select');
  bodySelect.title = 'The body the inspector and the overlay describe.';
  bodySelect.addEventListener('change', () => {
    chosenBody = bodySelect.value || null;
    sync();
  });
  function spawnNext(): string | null {
    const live = session();
    if (!live) return null;
    const next = live.pendingSpawns().find((id) => id.startsWith('magazine-'));
    if (next === undefined) return null;
    live.spawnPlanned(next, {
      centre: [((spawnCount % 5) - 2) * 0.6, 7, 0],
    });
    spawnCount += 1;
    sync();
    return next;
  }
  const spawnButton = button('spawn', 'Releases the next queued magazine '
    + 'block above the station center — mass with a drawn source. Disabled '
    + 'on stations without a magazine.', () => {
    spawnNext();
  });
  const removeButton = button('remove', 'Deletes the selected body from the '
    + 'solver outright; its visual freezes at the last presented pose. The '
    + 'delete-under-load probe.', () => {
    guarded(() => {
      const live = session();
      if (!live || chosenBody === null) return;
      live.removeBody(chosenBody);
      chosenBody = null;
      sync();
    });
  });
  const impulseButton = button('impulse', 'Applies an upward impulse worth '
    + 'a 3 m/s velocity change, scaled by the selected body\'s own mass.', () => {
    guarded(() => {
      const live = session();
      if (!live || chosenBody === null) return;
      const mass = live.snapshot()
        .find((row) => row.placementId === chosenBody)?.mass ?? 0;
      if (mass <= 0) return;
      live.applyImpulse(chosenBody, [0, IMPULSE_SPEED * mass, 0]);
    });
  });
  const overlayButton = button('debug view', 'Draws the selected body\'s '
    + 'collider boxes, contact points and normals, and velocity over the '
    + 'stage.', () => {
    deps.overlay.setVisible(!deps.overlay.visible());
    overlayButton.classList.toggle('on', deps.overlay.visible());
    sync();
    deps.redraw();
  });
  bodyRow.append(bodySelect, spawnButton, removeButton, impulseButton, overlayButton);

  root.append(title, stationRow, transportRow, caseRow, bodyRow, readout);

  function syncTransport(): void {
    const live = session();
    pauseButton.textContent = live?.paused() ? 'resume' : 'pause';
    pauseButton.classList.toggle('on', live?.paused() ?? false);
    slowButton.classList.toggle('on', (live?.timeScale() ?? 1) !== 1);
  }

  function fillStationSelect(): void {
    stationSelect.replaceChildren();
    for (const sceneId of playgroundSceneIds()) {
      const option = document.createElement('option');
      option.value = sceneId;
      option.textContent = physicsPlaygroundStationV1(sceneId)?.label ?? sceneId;
      stationSelect.append(option);
    }
    if (station) stationSelect.value = station.sceneId;
  }

  function fireCase(caseId: string): boolean {
    const live = session();
    const testCase = station?.cases.find((entry) => entry.id === caseId);
    if (!live || testCase === undefined) return false;
    let fired = true;
    guarded(() => {
      for (const action of testCase.actions) {
        if (action.kind === 'spawn') {
          // A case that already fired finds its body spawned; that is a
          // stale double-fire, worth a notice rather than a silent no-op.
          const spawned = live.spawnPlanned(action.placementId, {
            centre: action.centre,
            ...(action.velocity ? { velocity: action.velocity } : {}),
            ...(action.ccd ? { ccd: true } : {}),
          });
          if (!spawned) {
            fired = false;
            controlNotice = `Case '${testCase.label}' already fired: `
              + `'${action.placementId}' has spawned and a placement spawns `
              + 'at most once per run. Reset the station to fire it again.';
          }
        } else if (action.kind === 'remove') {
          live.removeBody(action.placementId);
        } else if (action.kind === 'impulse') {
          live.applyImpulse(action.placementId, action.impulse);
        } else if (live.jointIds().includes(action.jointId)) {
          live.detachJoint(action.jointId);
        } else {
          // Same rule as an already-spawned placement: report the honest
          // outcome instead of returning success for a case that did
          // nothing. Firing the trebuchet twice hits exactly this.
          fired = false;
          controlNotice = `Case '${testCase.label}' already fired: joint `
            + `'${action.jointId}' is already released, and a declared `
            + 'joint detaches at most once per run. Reset the station to '
            + 'fire it again.';
        }
      }
      sync();
    });
    return fired;
  }

  function fillCases(): void {
    caseRow.replaceChildren();
    if (!station) return;
    for (const testCase of station.cases) {
      caseRow.append(button(testCase.label, 'Fires this scripted case in '
        + 'the live world now. The deterministic runner replays the same '
        + 'case with exact tick timing.', () => {
        fireCase(testCase.id);
      }));
    }
  }

  function fillAngle(): void {
    const angles = station?.rampAngles;
    angleSelect.hidden = angles === undefined;
    if (angles === undefined) return;
    angleSelect.replaceChildren();
    for (const degrees of angles) {
      const option = document.createElement('option');
      option.value = String(degrees);
      option.textContent = `${String(degrees)}°`;
      angleSelect.append(option);
    }
    angleSelect.value = String(angle ?? station?.defaultRampAngleDegrees ?? 20);
  }

  function fillBodySelect(rows: readonly LiveBodySnapshotV1[]): void {
    const previous = bodySelect.value;
    bodySelect.replaceChildren();
    for (const row of rows) {
      const option = document.createElement('option');
      option.value = row.placementId;
      option.textContent = row.placementId;
      bodySelect.append(option);
    }
    // Prefer awake dynamic bodies, then any dynamic body (fixed floors and
    // walls report zero mass and make a dull default inspection target).
    const fallback = rows.find((row) => !row.sleeping && row.mass > 0)
      ?? rows.find((row) => row.mass > 0)
      ?? rows[0];
    const target = chosenBody !== null
      && rows.some((row) => row.placementId === chosenBody)
      ? chosenBody
      : fallback?.placementId ?? null;
    chosenBody = target;
    bodySelect.value = target ?? previous;
  }

  let specsCache: {
    readonly key: string;
    readonly specs: ReadonlyMap<string, PlaygroundBodySpecV1>;
  } | null = null;
  function cachedSpecs(): ReadonlyMap<string, PlaygroundBodySpecV1> | null {
    if (!station) return null;
    const key = `${station.sceneId}@${String(angle ?? '-')}`;
    if (specsCache?.key !== key) {
      specsCache = {
        key,
        specs: playgroundBodySpecsV1(station, {
          ...(angle !== undefined ? { rampAngleDegrees: angle } : {}),
        }),
      };
    }
    return specsCache.specs;
  }

  function overlaySegments(
    row: LiveBodySnapshotV1 | undefined,
  ): readonly PhysicalOverlaySegmentV1[] {
    const live = session();
    if (!live || !row || !station) return [];
    const spec = cachedSpecs()?.get(row.placementId);
    if (!spec) return [];
    const segments: PhysicalOverlaySegmentV1[] = [];
    const [qx, qy, qz, qw] = row.quaternion;
    const rotate = (v: readonly [number, number, number]) => {
      const tx = 2 * (qy * v[2] - qz * v[1]);
      const ty = 2 * (qz * v[0] - qx * v[2]);
      const tz = 2 * (qx * v[1] - qy * v[0]);
      return [
        row.translation[0] + v[0] + qw * tx + (qy * tz - qz * ty),
        row.translation[1] + v[1] + qw * ty + (qz * tx - qx * tz),
        row.translation[2] + v[2] + qw * tz + (qx * ty - qy * tx),
      ] as const;
    };
    // The selected body's collider boxes, as 'collider' lines (existing CSS).
    const boxes = spec.ballRadius !== undefined
      ? [{ at: [0, 0, 0] as const, half: [spec.ballRadius, spec.ballRadius, spec.ballRadius] as const }]
      : spec.boxes.slice(0, 48).map((box) => ({ at: box.at, half: box.half }));
    for (const box of boxes) {
      const corner = (sx: number, sy: number, sz: number) => rotate([
        box.at[0] + sx * box.half[0],
        box.at[1] + sy * box.half[1],
        box.at[2] + sz * box.half[2],
      ]);
      const c = [
        corner(-1, -1, -1), corner(1, -1, -1), corner(1, 1, -1), corner(-1, 1, -1),
        corner(-1, -1, 1), corner(1, -1, 1), corner(1, 1, 1), corner(-1, 1, 1),
      ];
      const edges: readonly (readonly [number, number])[] = [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7],
      ];
      for (const [a, b] of edges) {
        segments.push({ kind: 'collider', a: c[a]!, b: c[b]!, });
      }
    }
    // Contacts as 'sensor' lines: a short normal whisker at each point.
    for (const contact of live.contactSamples(row.placementId, 12)) {
      const [px, py, pz] = contact.point;
      const [nx, ny, nz] = contact.normal;
      segments.push({
        kind: 'sensor',
        a: [px, py, pz],
        b: [px + nx * 0.6, py + ny * 0.6, pz + nz * 0.6],
      });
    }
    // Velocity as a 'port' line from the center, scaled to a readable length.
    const speed = Math.hypot(...row.linearVelocity);
    if (speed > 0.01) {
      segments.push({
        kind: 'port',
        a: row.translation,
        b: [
          row.translation[0] + row.linearVelocity[0] * 0.25,
          row.translation[1] + row.linearVelocity[1] * 0.25,
          row.translation[2] + row.linearVelocity[2] * 0.25,
        ],
      });
    }
    return segments;
  }

  function sync(): void {
    if (root.hidden) return;
    const live = session();
    if (!live || !station) {
      readout.textContent = 'The live world is still building…';
      return;
    }
    const rows = live.snapshot();
    fillBodySelect(rows);
    syncTransport();
    spawnButton.disabled = !live.pendingSpawns()
      .some((id) => id.startsWith('magazine-'));
    const state = live.state();
    const activity = live.activity();
    const contacts = live.contactCount();
    const timing = deps.interact.timing();
    const lines = [
      // Derived, never spelled. This line said "240 Hz" to the owner's face
      // while the solver ran at 60, and the rate gate could not see it because
      // it only looks for rate-shaped literals in code, not display strings.
      `tick ${String(LIVE_TICKS_PER_SECOND_V1)} Hz  stepped ${String(state.stepped)}  `
      + (state.paused ? 'paused' : `running ×${String(state.timeScale)}`),
      `bodies ${String(state.bodies)} (${String(activity.activeBodies)} awake)`
      + `  colliders ${String(state.colliders)}  contacts ${String(contacts)}`
      + `  active voxels ${String(activity.activeVoxels)}`,
      `physics ${fixed(timing.stepMs, 2)} ms/frame  frame ${fixed(timing.frameMs, 1)} ms`
      + `  (${timing.frameMs > 0 ? fixed(1000 / timing.frameMs, 0) : '—'} fps)`,
    ];
    const row = rows.find((entry) => entry.placementId === chosenBody);
    if (row) {
      const material = station.bodies
        .find((body) => body.placementId === row.placementId)?.material ?? '?';
      lines.push(
        '',
        `▸ ${row.placementId}  material ${material}  voxels ${String(row.voxelCount)}`
        + `  mass ${fixed(row.mass, 1)}  ${row.sleeping ? 'asleep' : 'awake'}`,
        `pos ${vec(row.translation)}  com ${vec(row.centreOfMass)}`,
        `v ${vec(row.linearVelocity)}  |v| ${fixed(Math.hypot(...row.linearVelocity))} m/s`,
        `ω ${vec(row.angularVelocity)} rad/s`,
      );
      const samples = live.contactSamples(row.placementId, 12);
      const deepest = samples.reduce(
        (most, sample) => Math.max(most, sample.depth), 0);
      lines.push(
        `contacts ${String(samples.length)}${samples.length > 0
          ? `  deepest ${fixed(deepest, 4)} m  with ${[...new Set(samples.map((sample) => sample.other))].join(', ')}`
          : ''}`,
      );
    }
    if (controlNotice !== null) {
      lines.push('', `! ${controlNotice}`);
    }
    readout.textContent = lines.join('\n');
    if (deps.overlay.visible()) {
      deps.overlay.setSegments(overlaySegments(row));
      deps.redraw();
    }
  }

  let timer: ReturnType<typeof setInterval> | null = null;

  function playgroundSceneIds(): readonly string[] {
    return createPhysicsPlaygroundStationsV1().map((entry) => entry.sceneId);
  }

  return {
    root,
    sceneOpened(scene) {
      station = scene === null
        ? null
        : physicsPlaygroundStationV1(scene.id) ?? null;
      root.hidden = station === null;
      chosenBody = null;
      spawnCount = 0;
      angle = station?.defaultRampAngleDegrees;
      if (station === null) {
        deps.overlay.setSegments([]);
        if (timer !== null) {
          clearInterval(timer);
          timer = null;
        }
        return;
      }
      fillStationSelect();
      fillAngle();
      fillCases();
      sync();
      timer ??= setInterval(() => { sync(); }, REFRESH_MS);
    },
    rampAngleDegrees: () => angle,
    visible: () => !root.hidden,
    selectBody(placementId) {
      chosenBody = placementId;
      sync();
    },
    selectedBody: () => chosenBody,
    fireCase,
    spawnNext,
    setRampAngle(degrees) {
      const allowed = station?.rampAngles;
      if (!allowed?.includes(degrees)) {
        throw new Error(
          `The ramp angle must be one of ${(allowed ?? []).join(', ')} `
          + `degrees; got ${String(degrees)}. Other stations have no ramp.`,
        );
      }
      angle = degrees;
      angleSelect.value = String(degrees);
      spawnCount = 0;
      deps.interact.rebuild();
    },
    setOverlay(on) {
      deps.overlay.setVisible(on);
      overlayButton.classList.toggle('on', on);
      sync();
      deps.redraw();
    },
    overlayOn: () => deps.overlay.visible(),
    reset,
    station: () => station,
    sync,
    dispose() {
      if (timer !== null) clearInterval(timer);
      root.remove();
    },
  };
}
