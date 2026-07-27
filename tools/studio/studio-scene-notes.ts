import {
  type SceneAnnotationPersistenceResultV1,
  type SceneAnnotationsV1,
} from './scene-annotations.js';
import { element } from './studio-app-helpers.js';
import {
  type SceneViewPinCaptureV1,
  type StudioSceneNotesDepsV1,
  type StudioSceneNotesPanelV1,
} from './studio-scene-notes-types.js';
import { createStudioSceneNotesViewV1 } from './studio-scene-notes-view.js';

export type {
  SceneViewPinCaptureV1,
  StudioSceneNotesDepsV1,
  StudioSceneNotesPanelV1,
  StudioSceneNotesSceneV1,
  StudioSceneNotesSendResultV1,
} from './studio-scene-notes-types.js';
export function createStudioSceneNotesPanel(
  deps: StudioSceneNotesDepsV1,
): StudioSceneNotesPanelV1 {
  const listeners = new AbortController();
  let pinListeners = new AbortController();
  let sceneId: string | null = null;
  let pendingCapture: SceneViewPinCaptureV1 | null = null;
  let requestPending = false;
  let sceneGeneration = 0;
  let renderedAvailable: boolean | null = null;
  let briefFailureMessage: string | null = null;
  let briefRejected = false;
  let documentGeneration = 0;
  let pinShowButtons = new Map<number, HTMLButtonElement>();
  const savingRequestStatus = 'Saving request…';
  let firstRender = true;
  let disposed = false;

  const {
    root,
    brief,
    briefLabelText,
    annotateButton,
    captureHint,
    pinText,
    queueButton,
    cancelButton,
    editor,
    pins,
    empty,
    sendButton,
    status,
  } = createStudioSceneNotesViewV1();
  function setStatus(message: string, tone: 'idle' | 'ok' | 'bad' = 'idle'): void {
    status.dataset.tone = tone;
    status.textContent = message;
  }
  function reportPersistence(result: SceneAnnotationPersistenceResultV1): void {
    setStatus(result.message, result.persisted ? 'ok' : 'bad');
  }

  function activeSceneId(action: string): string | null {
    const current = deps.getScene();
    if (sceneId === null || current?.id !== sceneId) {
      setStatus(
        `${action} needs the scene shown in this Notes tab. Open that scene and try again.`,
        'bad',
      );
      return null;
    }
    return sceneId;
  }

  function updateSendAvailability(): void {
    sendButton.disabled = sceneId === null
      || deps.getScene()?.id !== sceneId
      || requestPending
      || briefRejected;
  }

  function updateModePresentation(): void {
    const annotationMode = deps.getAnnotationMode();
    annotateButton.setAttribute('aria-pressed', String(annotationMode));
    annotateButton.classList.toggle('armed', annotationMode);
    captureHint.textContent = annotationMode
      ? 'Annotation is armed. Click the picture once to capture its current view and phase, or press this button to cancel.'
      : 'Turn annotation on, then click the picture once to capture its current view and phase.';
  }

  function syncAnnotationMode(): void {
    if (disposed) return;
    updateModePresentation();
  }

  function setMode(enabled: boolean): boolean {
    try {
      if (deps.getAnnotationMode() !== enabled) deps.setAnnotationMode(enabled);
      const applied = deps.getAnnotationMode();
      updateModePresentation();
      deps.redraw();
      if (applied !== enabled) {
        throw new Error(
          `the application still reports annotation mode as ${applied ? 'armed' : 'disarmed'}`,
        );
      }
      return true;
    } catch (error) {
      setStatus(
        `Scene annotation mode could not be ${enabled ? 'armed' : 'disarmed'}: ${errorMessage(error)}`,
        'bad',
      );
      return false;
    }
  }

  function editorOwnsFocus(): boolean {
    const active = pinText.ownerDocument.activeElement;
    return active !== null && editor.contains(active);
  }

  function restoreFocusAfterEditorCloses(editorHadFocus: boolean): void {
    if (!editorHadFocus) return;
    if (!annotateButton.disabled) {
      annotateButton.focus();
      return;
    }
    const active = pinText.ownerDocument.activeElement;
    if (active instanceof HTMLElement) active.blur();
  }

  function focusPinShowOrAnnotate(preferredPinIds: readonly number[]): void {
    for (const pinId of preferredPinIds) {
      const show = pinShowButtons.get(pinId);
      if (show !== undefined && !show.disabled) {
        show.focus();
        return;
      }
    }
    const firstAvailable = [...pinShowButtons.values()].find((show) => !show.disabled);
    if (firstAvailable !== undefined) {
      firstAvailable.focus();
    } else if (!annotateButton.disabled) {
      annotateButton.focus();
    }
  }

  function renderPins(document: SceneAnnotationsV1, available: boolean): void {
    pinListeners.abort();
    pinListeners = new AbortController();
    pinShowButtons = new Map();
    pins.replaceChildren();
    empty.hidden = document.pins.length > 0;
    document.pins.forEach((pin, pinIndex) => {
      const number = pin.id;
      const item = element('li', 'note-row');
      const show = element('button', 'note-where');
      show.type = 'button';
      show.textContent = `Show #${String(number)}`;
      show.setAttribute(
        'aria-label',
        `Show annotation ${String(number)} at ${String(Math.round(pin.timeMs))} milliseconds`,
      );
      show.disabled = !available;
      pinShowButtons.set(pin.id, show);
      show.title = available
        ? 'Restore this captured view and phase'
        : 'Open this annotation’s scene before restoring its captured view and phase';
      show.addEventListener('click', () => {
        if (activeSceneId(`Showing annotation #${String(number)}`) === null) return;
        try {
          deps.showPin(pin);
          deps.redraw();
          setStatus(`Showing annotation #${String(number)} at its captured view and phase.`, 'ok');
          focusPinShowOrAnnotate([pin.id]);
        } catch (error) {
          setStatus(`Annotation #${String(number)} could not be shown: ${errorMessage(error)}`, 'bad');
          focusPinShowOrAnnotate([pin.id]);
        }
      }, { signal: pinListeners.signal });
      const text = element('span', 'note-text');
      text.textContent = pin.text;
      const remove = element('button', 'note-remove');
      remove.type = 'button';
      remove.textContent = 'Done';
      remove.setAttribute('aria-label', `Done with annotation ${String(number)}; remove it`);
      remove.addEventListener('click', () => {
        const activeId = activeSceneId(`Removing annotation #${String(number)}`);
        if (activeId === null) return;
        try {
          const result = deps.removePin(activeId, pin.id);
          const followingIds = document.pins.slice(pinIndex + 1).map(({ id }) => id);
          const precedingIds = document.pins.slice(0, pinIndex).map(({ id }) => id).reverse();
          render(activeId);
          if (!result.removed) {
            setStatus(
              `Annotation #${String(number)} was not removed because it is no longer in this scene.`,
              'bad',
            );
            focusPinShowOrAnnotate([pin.id, ...followingIds, ...precedingIds]);
            return;
          }
          reportPersistence(result.persistence);
          deps.redraw();
          focusPinShowOrAnnotate([...followingIds, ...precedingIds]);
        } catch (error) {
          setStatus(`Annotation #${String(number)} could not be removed: ${errorMessage(error)}`, 'bad');
        }
      }, { signal: pinListeners.signal });
      item.append(show, text, remove);
      pins.append(item);
    });
  }

  function render(nextSceneId: string): void {
    if (disposed) return;
    documentGeneration += 1;
    if (briefRejected) {
      if (briefFailureMessage !== null && status.textContent === briefFailureMessage) setStatus('');
      briefFailureMessage = null;
      briefRejected = false;
    }
    const current = deps.getScene();
    const available = current?.id === nextSceneId;
    const sceneChanged = sceneId !== null && sceneId !== nextSceneId;
    const availabilityChanged = renderedAvailable !== null && renderedAvailable !== available;
    let restoreEditorFocus = false;
    if (sceneChanged || availabilityChanged) {
      sceneGeneration += 1;
      briefFailureMessage = null;
      setStatus('');
      restoreEditorFocus = editorOwnsFocus();
      pendingCapture = null;
      editor.hidden = true;
      pinText.value = '';
      setMode(false);
    }
    sceneId = nextSceneId;
    renderedAvailable = available;
    annotateButton.disabled = !available;
    brief.disabled = !available;
    updateSendAvailability();
    let loadFailure: string | null = null;
    try {
      const document = deps.getDocument(nextSceneId);
      if (document.sceneId !== nextSceneId) {
        throw new Error(
          `The notes document belongs to scene '${document.sceneId}', not requested scene '${nextSceneId}'.`,
        );
      }
      brief.value = document.brief;
      briefLabelText.textContent = available ? `Scene brief — ${current.label}` : 'Scene brief';
      renderPins(document, available);
    } catch (error) {
      brief.value = '';
      pinListeners.abort();
      pinListeners = new AbortController();
      pins.replaceChildren();
      empty.hidden = false;
      loadFailure = `Scene notes could not be loaded for '${nextSceneId}': ${errorMessage(error)}`;
    }
    if (firstRender) {
      firstRender = false;
      const warnings = [
        ...(deps.loadWarnings ?? []),
        ...(loadFailure === null ? [] : [loadFailure]),
      ];
      if (warnings.length > 0) setStatus(warnings.join(' '), 'bad');
    } else if (loadFailure !== null) {
      setStatus(loadFailure, 'bad');
    }
    updateModePresentation();
    restoreFocusAfterEditorCloses(restoreEditorFocus);
  }

  function beginCapture(capture: SceneViewPinCaptureV1): boolean {
    if (disposed || activeSceneId('Capturing an annotation') === null) return false;
    const copiedCapture = structuredClone(capture);
    if (!setMode(false)) return false;
    try {
      pendingCapture = copiedCapture;
      pinText.value = '';
      editor.hidden = false;
      setStatus(
        `Captured the view and phase at ${String(Math.round(capture.timeMs))} milliseconds. Add the note to queue it.`,
        'ok',
      );
      pinText.focus();
      deps.redraw();
      return true;
    } catch (error) {
      pendingCapture = null;
      pinText.value = '';
      editor.hidden = true;
      throw error;
    }
  }

  function cancelCapture(): void {
    if (disposed) return;
    const restoreEditorFocus = editorOwnsFocus();
    const hadCapture = pendingCapture !== null || deps.getAnnotationMode();
    pendingCapture = null;
    pinText.value = '';
    editor.hidden = true;
    const disarmed = setMode(false);
    restoreFocusAfterEditorCloses(restoreEditorFocus);
    if (hadCapture && disarmed) setStatus('Scene annotation canceled.');
    deps.redraw();
  }

  function queueCapture(): void {
    const activeId = activeSceneId('Queuing an annotation');
    if (activeId === null || pendingCapture === null) {
      setStatus(
        'Nothing was queued because no scene view has been captured. Choose Annotate scene and click the picture first.',
        'bad',
      );
      return;
    }
    const text = pinText.value.trim();
    if (text.length === 0) {
      setStatus('This captured view needs a note. Describe what should change before queuing it.', 'bad');
      pinText.focus();
      return;
    }
    try {
      const result = deps.addPin(activeId, { ...pendingCapture, text });
      const restoreEditorFocus = editorOwnsFocus();
      pendingCapture = null;
      pinText.value = '';
      editor.hidden = true;
      render(activeId);
      restoreFocusAfterEditorCloses(restoreEditorFocus);
      reportPersistence(result.persistence);
      deps.redraw();
    } catch (error) {
      setStatus(`The captured annotation could not be queued: ${errorMessage(error)}`, 'bad');
      pinText.focus();
    }
  }

  function focusBrief(): void {
    if (!disposed && sceneId !== null) brief.focus();
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    listeners.abort();
    pinListeners.abort();
    pendingCapture = null;
    try {
      if (deps.getAnnotationMode()) {
        deps.setAnnotationMode(false);
        deps.redraw();
      }
    } catch {
      // Disposal has no surviving status surface; the composition root owns
      // cleanup of any stage resource that rejected its ordinary callback.
    }
  }

  function finishRequest(sentFromSceneGeneration: number, requestSceneId: string): boolean {
    requestPending = false;
    const current = deps.getScene();
    const sameGeneration = sceneGeneration === sentFromSceneGeneration;
    const requestSceneStillOpen = sameGeneration
      && sceneId === requestSceneId
      && current?.id === requestSceneId;
    updateSendAvailability();
    if (!requestSceneStillOpen && sameGeneration && current?.id !== sceneId) {
      sceneGeneration += 1;
      renderedAvailable = false;
      briefFailureMessage = null;
      setStatus('');
    }
    return requestSceneStillOpen;
  }

  brief.addEventListener('input', () => {
    documentGeneration += 1;
    const activeId = activeSceneId('Saving the scene brief');
    if (activeId === null) return;
    try {
      const result = deps.setBrief(activeId, brief.value);
      briefRejected = false;
      updateSendAvailability();
      if (!result.persisted) {
        briefFailureMessage = result.message;
        setStatus(result.message, 'bad');
      } else if (briefFailureMessage !== null) {
        if (status.textContent === briefFailureMessage) setStatus('');
        briefFailureMessage = null;
      }
    } catch (error) {
      briefRejected = true;
      briefFailureMessage = `The scene brief could not be saved: ${errorMessage(error)}`;
      setStatus(briefFailureMessage, 'bad');
      updateSendAvailability();
    }
  }, { signal: listeners.signal });
  annotateButton.addEventListener('click', () => {
    if (activeSceneId('Arming scene annotation') === null) return;
    if (pendingCapture !== null) {
      cancelCapture();
      return;
    }
    try {
      const enabled = !deps.getAnnotationMode();
      if (setMode(enabled)) {
        setStatus(enabled ? 'Scene annotation armed. Click the picture once.' : 'Scene annotation canceled.');
      }
    } catch (error) {
      setStatus(`Scene annotation mode could not be read: ${errorMessage(error)}`, 'bad');
    }
  }, { signal: listeners.signal });
  queueButton.addEventListener('click', queueCapture, { signal: listeners.signal });
  cancelButton.addEventListener('click', cancelCapture, { signal: listeners.signal });
  pinText.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.isComposing) {
      event.preventDefault();
      cancelCapture();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      queueCapture();
    }
  }, { signal: listeners.signal });
  sendButton.addEventListener('click', () => {
    const activeId = activeSceneId('Sending a scene request');
    if (activeId === null) return;
    if (briefRejected) {
      briefFailureMessage = `${briefFailureMessage ?? 'The visible scene brief was rejected.'} `
        + 'Fix the scene brief before sending this request.';
      setStatus(briefFailureMessage, 'bad');
      brief.focus();
      return;
    }
    let document: SceneAnnotationsV1;
    try {
      document = deps.getDocument(activeId);
    } catch (error) {
      setStatus(`The scene request could not read its saved notes: ${errorMessage(error)}`, 'bad');
      return;
    }
    requestPending = true;
    const sentFromSceneGeneration = sceneGeneration;
    const sentFromDocumentGeneration = documentGeneration;
    updateSendAvailability();
    setStatus(savingRequestStatus);
    void Promise.resolve()
      .then(() => deps.sendRequest(activeId, document))
      .then((result) => {
        if (disposed) return;
        if (!finishRequest(sentFromSceneGeneration, activeId)) return;
        if (briefRejected || documentGeneration !== sentFromDocumentGeneration) {
          if (!briefRejected && status.textContent === savingRequestStatus) setStatus('');
          return;
        }
        if (!result.ok) {
          setStatus(result.reason, 'bad');
          return;
        }
        setStatus(
          `Saved locally as ${result.file}. No agent was started or notified; ask one to process that file when ready.`,
          'ok',
        );
      })
      .catch((error: unknown) => {
        if (disposed) return;
        if (!finishRequest(sentFromSceneGeneration, activeId)) return;
        if (briefRejected || documentGeneration !== sentFromDocumentGeneration) {
          if (!briefRejected && status.textContent === savingRequestStatus) setStatus('');
          return;
        }
        setStatus(`The scene request could not be saved: ${errorMessage(error)}`, 'bad');
      });
  }, { signal: listeners.signal });

  return {
    element: root,
    get annotationMode() {
      return deps.getAnnotationMode();
    },
    get editorOpen() {
      return pendingCapture !== null;
    },
    render,
    syncAnnotationMode,
    beginCapture,
    cancelCapture,
    focusBrief,
    dispose,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
