import { SCENE_ANNOTATION_MAX_BRIEF_LENGTH } from './scene-annotations.js';
import { element } from './studio-app-helpers.js';

export interface StudioSceneNotesViewV1 {
  readonly root: HTMLElement;
  readonly brief: HTMLTextAreaElement;
  readonly briefLabelText: HTMLElement;
  readonly annotateButton: HTMLButtonElement;
  readonly captureHint: HTMLElement;
  readonly pinText: HTMLTextAreaElement;
  readonly queueButton: HTMLButtonElement;
  readonly cancelButton: HTMLButtonElement;
  readonly editor: HTMLElement;
  readonly pins: HTMLOListElement;
  readonly empty: HTMLElement;
  readonly sendButton: HTMLButtonElement;
  readonly status: HTMLElement;
}

let nextPanelId = 1;

export function createStudioSceneNotesViewV1(): StudioSceneNotesViewV1 {
  const panelId = nextPanelId++;
  const intro = element('p', 'hint');
  intro.textContent = 'Leave a brief for the whole scene or annotate a captured view. '
    + 'Each numbered pin remembers the camera framing and animation phase at capture time.';

  const brief = element('textarea', 'request');
  brief.id = `studio-scene-brief-${String(panelId)}`;
  brief.rows = 4;
  brief.maxLength = SCENE_ANNOTATION_MAX_BRIEF_LENGTH;
  brief.spellcheck = true;
  brief.placeholder = 'What should someone reviewing this scene know?';
  const briefLabel = element('label', 'field');
  briefLabel.htmlFor = brief.id;
  const briefLabelText = element('span');
  briefLabelText.textContent = 'Scene brief';
  const briefHelp = element('small', 'hint');
  briefHelp.textContent = 'Autosaved for this scene as you type.';
  briefLabel.append(briefLabelText, brief, briefHelp);

  const annotateButton = element('button');
  annotateButton.type = 'button';
  annotateButton.textContent = 'Annotate scene';
  annotateButton.setAttribute('aria-pressed', 'false');
  const captureHint = element('p', 'hint');
  captureHint.textContent = 'Turn annotation on, then click the picture once to capture its current view and phase.';

  const pinText = element('textarea', 'request');
  pinText.id = `studio-scene-pin-text-${String(panelId)}`;
  pinText.rows = 3;
  pinText.spellcheck = true;
  pinText.placeholder = 'What should change in this captured view?';
  const pinTextLabel = element('label', 'field');
  pinTextLabel.htmlFor = pinText.id;
  const pinTextLabelText = element('span');
  pinTextLabelText.textContent = 'Annotation note';
  const pinTextHelp = element('small', 'hint');
  pinTextHelp.textContent = 'Enter queues this note; Shift+Enter adds a new line.';
  pinTextLabel.append(pinTextLabelText, pinText, pinTextHelp);
  const queueButton = element('button', 'primary');
  queueButton.type = 'button';
  queueButton.textContent = 'Queue';
  const cancelButton = element('button');
  cancelButton.type = 'button';
  cancelButton.textContent = 'Cancel';
  const editorActions = element('div', 'row');
  editorActions.append(queueButton, cancelButton);
  const editor = element('div', 'library-detail');
  editor.append(pinTextLabel, editorActions);
  editor.hidden = true;

  const pinsHeading = element('p', 'grouphead');
  pinsHeading.textContent = 'Captured annotations';
  const pins = element('ol', 'notes');
  const empty = element('p', 'hint');
  empty.textContent = 'No captured annotations for this scene.';

  const sendButton = element('button', 'primary');
  sendButton.type = 'button';
  sendButton.textContent = 'Send request';
  const status = element('p', 'verdict');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const root = element('div', 'pane');
  root.setAttribute('aria-label', 'Scene notes');
  root.append(
    intro,
    briefLabel,
    annotateButton,
    captureHint,
    editor,
    pinsHeading,
    pins,
    empty,
    sendButton,
    status,
  );
  return {
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
  };
}
