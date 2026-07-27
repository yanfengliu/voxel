import type {
  SceneAnnotationPersistenceResultV1,
  SceneAnnotationsV1,
  SceneViewPinDraftV1,
  SceneViewPinV1,
} from './scene-annotations.js';

export type SceneViewPinCaptureV1 = Omit<SceneViewPinDraftV1, 'text'>;

export type StudioSceneNotesSendResultV1 =
  | { readonly ok: true; readonly file: string }
  | { readonly ok: false; readonly reason: string };

export interface StudioSceneNotesSceneV1 {
  readonly id: string;
  readonly label: string;
}

export interface StudioSceneNotesDepsV1 {
  /** Returns the scene currently presented on the stage. */
  readonly getScene: () => StudioSceneNotesSceneV1 | null;
  /** Returns a defensive snapshot of one scene's saved brief and pins. */
  readonly getDocument: (sceneId: string) => SceneAnnotationsV1;
  /** Recovery or storage warnings discovered while the annotation store loaded. */
  readonly loadWarnings?: readonly string[];
  readonly setBrief: (sceneId: string, brief: string) => SceneAnnotationPersistenceResultV1;
  readonly addPin: (
    sceneId: string,
    draft: SceneViewPinDraftV1,
  ) => { readonly pin: SceneViewPinV1; readonly persistence: SceneAnnotationPersistenceResultV1 };
  readonly removePin: (
    sceneId: string,
    pinId: number,
  ) => { readonly removed: boolean; readonly persistence: SceneAnnotationPersistenceResultV1 };
  /**
   * Restores the pin's captured camera and scene phase after the composition
   * root confirms that the current DOM viewport matches the recorded viewport.
   */
  readonly showPin: (pin: SceneViewPinV1) => void;
  /** Reads the composition root's authoritative one-shot capture mode. */
  readonly getAnnotationMode: () => boolean;
  /** Arms or disarms the stage's one-shot scene capture interaction. */
  readonly setAnnotationMode: (enabled: boolean) => void;
  /** Saves a request artifact; it does not start or notify an agent. */
  readonly sendRequest: (
    sceneId: string,
    document: SceneAnnotationsV1,
  ) => Promise<StudioSceneNotesSendResultV1>;
  /** Repositions the numbered pin markers over the rendered scene. */
  readonly redraw: () => void;
}

export interface StudioSceneNotesPanelV1 {
  readonly element: HTMLElement;
  readonly annotationMode: boolean;
  readonly editorOpen: boolean;
  render(sceneId: string): void;
  /** Mirrors an app- or harness-driven mode change into this panel's controls. */
  syncAnnotationMode(): void;
  /** Opens a captured-note draft and reports whether the panel accepted it. */
  beginCapture(capture: SceneViewPinCaptureV1): boolean;
  cancelCapture(): void;
  focusBrief(): void;
  dispose(): void;
}
