import { MathUtils, Vector3 } from 'three';
import type { PerspectiveCamera } from 'three';

import {
  clampOrbit,
  dragOrbit,
  KEYBOARD_PAN_VIEW_HEIGHTS_PER_SECOND,
  moveOrbitCenter,
  panOrbit,
  type OrbitCenterV1,
  type OrbitLimitsV1,
  type OrbitStateV1,
  zoomOrbit,
} from '../../tools/studio/orbit.js';
import { createStudioKeyboard } from '../../tools/studio/studio-keyboard.js';
import type {
  OakBrowserCameraV1,
  OakBrowserNavigationEvidenceV1,
  OakBrowserViewportV1,
} from './oak-browser-contract.js';

const DRAG_THRESHOLD_PIXELS = 4;
const OAK_ORBIT_LIMITS: OrbitLimitsV1 = {
  // Preserve the near-overhead preset without allowing a true pole singularity.
  pitchLimitDegrees: 89.99,
  // The Studio's 0.25–256 inspection range, expressed in centimetre-scale oak metres.
  minViewHeight: 0.0025,
  maxViewHeight: 2.56,
};

type OakPointerGestureV1 = 'none' | 'inert' | 'orbit' | 'pan';

export interface OakBrowserNavigationOptionsV1 {
  readonly root: HTMLElement;
  readonly surface: HTMLCanvasElement;
  readonly camera: PerspectiveCamera;
  readonly viewport: () => OakBrowserViewportV1;
  /** Called after a pointer or wheel gesture has already applied its camera. */
  readonly onViewChanged: () => void;
  readonly onRefit: (preset: OakBrowserCameraV1) => void;
}

export interface OakBrowserNavigationHandleV1 {
  attach(): void;
  beginPreset(preset: OakBrowserCameraV1): void;
  syncFromFittedPreset(preset: OakBrowserCameraV1, distanceM: number): void;
  isFree(): boolean;
  /** Reapplies the free camera after a viewport change. */
  apply(): void;
  /** Advances held WASD input; true means the caller must present this camera. */
  advanceFrame(elapsedMs: number): boolean;
  evidence(): OakBrowserNavigationEvidenceV1;
  dispose(): void;
}

/**
 * Oak-scale adapter for the Studio's inspection contract.
 *
 * The pure orbit/pan/zoom and held-key laws are shared with Studio. This module
 * owns only DOM routing and the metre-scale perspective projection; it never
 * writes biological state.
 */
export function createOakBrowserNavigationV1(
  options: OakBrowserNavigationOptionsV1,
): OakBrowserNavigationHandleV1 {
  const { camera, root, surface } = options;
  const removers: (() => void)[] = [];
  const forward = new Vector3();
  let attached = false;
  let initialized = false;
  let mode: OakBrowserNavigationEvidenceV1['mode'] = 'preset';
  let anchorPreset: OakBrowserCameraV1 = 'hero';
  let orbit: OrbitStateV1 = { yawDegrees: 0, pitchDegrees: 0, viewHeight: 0.1 };
  let center: OrbitCenterV1 = [0, 0, 0];
  let gesture: OakPointerGestureV1 = 'none';
  let moved = false;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let lastX = 0;
  let lastY = 0;
  let activePointerId: number | null = null;

  const apply = (): void => {
    if (!initialized) return;
    orbit = clampOrbit(orbit, OAK_ORBIT_LIMITS);
    const yaw = MathUtils.degToRad(orbit.yawDegrees);
    const pitch = MathUtils.degToRad(orbit.pitchDegrees);
    const distance = (orbit.viewHeight / 2) / Math.tan(MathUtils.degToRad(camera.fov / 2));
    const flat = Math.cos(pitch) * distance;
    camera.position.set(
      center[0] + Math.sin(yaw) * flat,
      center[1] + Math.sin(pitch) * distance,
      center[2] + Math.cos(yaw) * flat,
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(center[0], center[1], center[2]);
    const viewport = options.viewport();
    camera.aspect = viewport.width / Math.max(1, viewport.height);
    camera.near = Math.max(0.0005, distance / 100);
    camera.far = Math.max(25, distance * 4);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  };

  const commit = (): void => {
    mode = 'free';
    apply();
    options.onViewChanged();
  };
  const ignoreStudioOnlyAction = (): void => undefined;

  const keyboard = createStudioKeyboard({
    root,
    sceneOpen: () => false,
    noteEditorOpen: () => false,
    closeNoteEditor: ignoreStudioOnlyAction,
    undoScene: ignoreStudioOnlyAction,
    redoScene: ignoreStudioOnlyAction,
    sceneHasMotion: () => false,
    toggleScenePlayback: ignoreStudioOnlyAction,
    step: ignoreStudioOnlyAction,
  });

  const add = <K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void,
    optionsValue?: AddEventListenerOptions,
  ): void => {
    target.addEventListener(type, listener as EventListener, optionsValue);
    removers.push(() => {
      target.removeEventListener(type, listener as EventListener, optionsValue);
    });
  };

  const clearPointer = (event?: PointerEvent): void => {
    if (
      event !== undefined
      && activePointerId !== null
      && event.pointerId !== activePointerId
    ) return;
    const pointerId = event?.pointerId ?? activePointerId;
    if (pointerId !== null && surface.hasPointerCapture(pointerId)) {
      surface.releasePointerCapture(pointerId);
    }
    activePointerId = null;
    gesture = 'none';
    moved = false;
  };

  const handle: OakBrowserNavigationHandleV1 = {
    attach() {
      if (attached) return;
      attached = true;
      keyboard.attach();
      add(surface, 'contextmenu', (event) => { event.preventDefault(); });
      add(surface, 'pointerdown', (event) => {
        if (activePointerId !== null) return;
        surface.focus({ preventScroll: true });
        activePointerId = event.pointerId;
        pointerStartX = event.clientX;
        pointerStartY = event.clientY;
        lastX = event.clientX;
        lastY = event.clientY;
        moved = false;
        surface.setPointerCapture(event.pointerId);
        if (event.button === 1) gesture = 'orbit';
        else if (event.button === 2) gesture = 'pan';
        else gesture = event.button === 0 ? 'inert' : 'none';
        if (gesture === 'orbit' || gesture === 'pan') event.preventDefault();
      });
      add(surface, 'pointermove', (event) => {
        if (event.pointerId !== activePointerId) return;
        if (gesture === 'none' || gesture === 'inert') return;
        const dx = event.clientX - lastX;
        const dy = event.clientY - lastY;
        if (
          !moved
          && Math.hypot(event.clientX - pointerStartX, event.clientY - pointerStartY)
            < DRAG_THRESHOLD_PIXELS
        ) return;
        moved = true;
        lastX = event.clientX;
        lastY = event.clientY;
        if (gesture === 'orbit') {
          orbit = dragOrbit(orbit, dx, dy, OAK_ORBIT_LIMITS);
        } else {
          center = panOrbit(
            orbit,
            center,
            dx,
            dy,
            options.viewport().height,
            OAK_ORBIT_LIMITS,
          );
        }
        commit();
      });
      add(surface, 'pointerup', clearPointer);
      add(surface, 'pointercancel', clearPointer);
      add(surface, 'lostpointercapture', clearPointer);
      add(surface, 'wheel', (event) => {
        event.preventDefault();
        const step = Math.sign(event.deltaY);
        if (step === 0) return;
        orbit = zoomOrbit(orbit, step, OAK_ORBIT_LIMITS);
        commit();
      }, { passive: false });
      add(surface, 'dblclick', (event) => {
        event.preventDefault();
        options.onRefit(anchorPreset);
      });
    },
    beginPreset(preset) {
      keyboard.clearMovement();
      mode = 'preset';
      anchorPreset = preset;
    },
    syncFromFittedPreset(preset, distanceM) {
      if (!Number.isFinite(distanceM) || distanceM <= 0) {
        throw new RangeError(
          `Cannot synchronize oak navigation from camera distance ${String(distanceM)} m; `
          + 'the fitted distance must be finite and positive.',
        );
      }
      camera.getWorldDirection(forward);
      center = [
        camera.position.x + forward.x * distanceM,
        camera.position.y + forward.y * distanceM,
        camera.position.z + forward.z * distanceM,
      ];
      const offsetX = camera.position.x - center[0];
      const offsetY = camera.position.y - center[1];
      const offsetZ = camera.position.z - center[2];
      orbit = clampOrbit({
        yawDegrees: MathUtils.radToDeg(Math.atan2(offsetX, offsetZ)),
        pitchDegrees: MathUtils.radToDeg(Math.asin(MathUtils.clamp(offsetY / distanceM, -1, 1))),
        viewHeight: 2 * distanceM * Math.tan(MathUtils.degToRad(camera.fov / 2)),
      }, OAK_ORBIT_LIMITS);
      anchorPreset = preset;
      mode = 'preset';
      initialized = true;
    },
    isFree() {
      return mode === 'free';
    },
    apply,
    advanceFrame(elapsedMs) {
      if (!initialized || elapsedMs <= 0) return false;
      const movement = keyboard.movement();
      if (movement.forward === 0 && movement.right === 0) return false;
      const distance = orbit.viewHeight
        * KEYBOARD_PAN_VIEW_HEIGHTS_PER_SECOND
        * (Math.min(50, elapsedMs) / 1_000);
      center = moveOrbitCenter(
        orbit,
        center,
        movement.forward,
        movement.right,
        distance,
        OAK_ORBIT_LIMITS,
      );
      mode = 'free';
      apply();
      return true;
    },
    evidence() {
      if (!initialized) {
        throw new Error('Oak navigation evidence requires a fitted camera preset.');
      }
      return {
        mode,
        anchorPreset,
        orbit: {
          yawDegrees: orbit.yawDegrees,
          pitchDegrees: orbit.pitchDegrees,
          viewHeightM: orbit.viewHeight,
        },
        centerM: { x: center[0], y: center[1], z: center[2] },
        presentedCamera: {
          positionM: {
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z,
          },
          quaternion: {
            x: camera.quaternion.x,
            y: camera.quaternion.y,
            z: camera.quaternion.z,
            w: camera.quaternion.w,
          },
          fovDegrees: camera.fov,
          projectionMatrix: camera.projectionMatrix.toArray(),
        },
      };
    },
    dispose() {
      if (!attached) return;
      attached = false;
      clearPointer();
      keyboard.dispose();
      for (const remove of removers.splice(0)) remove();
    },
  };
  return handle;
}
