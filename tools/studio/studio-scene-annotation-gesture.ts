import type { SceneViewPinDraftV1 } from './scene-annotations.js';

export interface SceneAnnotationGesturePreviousV1 {
  readonly timeMs: number;
  readonly enabled: boolean;
  readonly playing: boolean;
  readonly annotationMode: boolean;
}

export interface SceneAnnotationGestureIntentV1 {
  readonly capture: Omit<SceneViewPinDraftV1, 'text'>;
  readonly previous: SceneAnnotationGesturePreviousV1;
  readonly hasMotion: boolean;
}

export interface StudioSceneAnnotationGestureDepsV1 {
  readonly readIntent: (event: PointerEvent) => SceneAnnotationGestureIntentV1 | null;
  readonly freezeAt: (timeMs: number) => void;
  readonly beginCapture: (capture: Omit<SceneViewPinDraftV1, 'text'>) => boolean;
  readonly restorePlayback: (
    previous: SceneAnnotationGesturePreviousV1,
    hasMotion: boolean,
  ) => void;
  readonly restoreAnnotationMode: (enabled: boolean) => void;
  readonly reportFailure: (error: Error, summary: string) => void;
}

export interface StudioSceneAnnotationGestureV1 {
  prepare(event: PointerEvent): boolean;
  finish(): void;
  cancel(): void;
}

/**
 * Owns the press-to-release lifetime of one scene annotation gesture.
 *
 * The composition root still reads the camera and controls the scene clock;
 * this controller only guarantees that a rejected click or a drag restores
 * both owners together instead of leaving a half-captured state behind.
 */
export function createStudioSceneAnnotationGestureV1(
  deps: StudioSceneAnnotationGestureDepsV1,
): StudioSceneAnnotationGestureV1 {
  let intent: SceneAnnotationGestureIntentV1 | null = null;

  function restore(current: SceneAnnotationGestureIntentV1): string[] {
    const failures: string[] = [];
    try {
      deps.restorePlayback(current.previous, current.hasMotion);
    } catch (error) {
      failures.push(`playback restoration failed (${String(error)})`);
    }
    try {
      deps.restoreAnnotationMode(current.previous.annotationMode);
    } catch (error) {
      failures.push(`annotation-mode restoration failed (${String(error)})`);
    }
    return failures;
  }

  function reportCaptureFailure(
    captureFailure: unknown,
    current: SceneAnnotationGestureIntentV1,
  ): void {
    const rollbackFailures = restore(current);
    const reason = captureFailure instanceof Error ? captureFailure.message : String(captureFailure);
    const rollback = rollbackFailures.length === 0
      ? 'The prior playback and annotation mode were restored.'
      : `The capture also could not fully restore its prior state: ${rollbackFailures.join('; ')}.`;
    deps.reportFailure(
      new Error(`The scene annotation could not capture this view: ${reason} ${rollback}`),
      'The scene annotation could not capture this view; the scene and prior notes remain unchanged.',
    );
  }

  return {
    prepare(event) {
      let next: SceneAnnotationGestureIntentV1 | null;
      try {
        next = deps.readIntent(event);
      } catch (error) {
        deps.reportFailure(
          error instanceof Error ? error : new Error(String(error)),
          'The scene annotation could not read the pressed picture; playback and notes remain unchanged.',
        );
        return false;
      }
      if (next === null) return false;
      try {
        deps.freezeAt(next.capture.timeMs);
        intent = next;
        return true;
      } catch (error) {
        reportCaptureFailure(error, next);
        return false;
      }
    },

    finish() {
      const current = intent;
      intent = null;
      if (current === null) return;
      try {
        if (!deps.beginCapture(current.capture)) {
          throw new Error(
            'The scene Notes panel did not accept the captured view. Reopen its Notes tab and try again.',
          );
        }
      } catch (error) {
        reportCaptureFailure(error, current);
      }
    },

    cancel() {
      const current = intent;
      intent = null;
      if (current === null) return;
      const failures = restore(current);
      if (failures.length > 0) {
        deps.reportFailure(
          new Error(
            'The annotation gesture became a drag, so no note was captured, but its prior state '
            + `could not be fully restored: ${failures.join('; ')}.`,
          ),
          'The dragged annotation was canceled, but its prior playback state could not be restored.',
        );
      }
    },
  };
}
