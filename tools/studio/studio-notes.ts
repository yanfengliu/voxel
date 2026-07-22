import type { VoxelStudioHarnessV1 } from './harness.js';
import type { StudioNoteV1 } from './notes.js';
import type { ModelStudioTabId } from './shared-ui/index.js';
import type { StudioEditStateV1 } from './studio-app-context.js';
import type { StudioEditorPanelV1 } from './studio-editor.js';
import { element } from './studio-app-helpers.js';

/**
 * The Notes tab: what a reviewer saw and what should change. A note is pinned
 * to a moment on the timeline or a place on the model, listed here, and a
 * request carries the notes to an agent. Saving goes through the harness, so a
 * note the panel shows is a note the agent has.
 */

export interface StudioNotesDepsV1 {
  readonly harness: VoxelStudioHarnessV1;
  readonly supportsEdit: boolean;
  readonly supportsNotes: boolean;
  /** The shared anchor/floor state; the panel arms and clears place notes. */
  readonly state: StudioEditStateV1;
  /** Shown when a place note asks to jump to its floor and flash its cell. */
  readonly editor: StudioEditorPanelV1;
  readonly showTab: (name: ModelStudioTabId) => void;
  readonly syncPlayButton: () => void;
  /** Repaints the moment rings on the stage; owned by the composition root. */
  readonly redrawOverlays: () => void;
}

export interface StudioNotesPanelV1 {
  readonly pane: HTMLElement;
  /** Rebuilds the note list. Called when the notes change. */
  renderNotes(): void;
  /** Opens the note editor on the notes tab with a placeholder prompt. */
  openNoteEditor(hint: string): void;
  /** Cancels a pending note and clears the rings. */
  closeNoteEditor(): void;
  /** Arms a place note on a model cell and opens the editor for it. */
  beginPlaceNote(x: number, y: number, z: number): void;
  /** Attaches the top bar's Send-request shortcut to focus the request box. */
  wireRequestShortcut(button: HTMLButtonElement): void;
}

export function createStudioNotesPanel(deps: StudioNotesDepsV1): StudioNotesPanelV1 {
  const { harness, supportsEdit, supportsNotes, state, editor, showTab } = deps;
  const { syncPlayButton, redrawOverlays } = deps;

  const notesList = element('ul', 'notes');
  const noteInput = element('input', 'note-input');
  noteInput.type = 'text';
  noteInput.placeholder = 'Say what you see…';
  const noteSave = element('button', 'primary');
  noteSave.textContent = 'Pin note';
  const noteCancel = element('button');
  noteCancel.textContent = 'Cancel';
  const noteEditor = element('div', 'note-editor');
  noteEditor.append(noteInput, noteSave, noteCancel);
  noteEditor.hidden = true;
  const noteHint = element('p', 'hint');
  noteHint.textContent = 'Pause and click the picture to pin a note to that moment.';
  const pinPlaceButton = element('button');
  pinPlaceButton.textContent = 'Pin to a spot on the model';
  pinPlaceButton.hidden = !supportsEdit;
  pinPlaceButton.disabled = !supportsEdit;
  const requestBox = element('textarea', 'request');
  requestBox.rows = 3;
  requestBox.placeholder = 'What should change? Your notes travel with this.';
  const sendButton = element('button', 'primary');
  sendButton.textContent = 'Send request';
  const requestStatus = element('p', 'verdict');

  function describeNoteAnchor(note: StudioNoteV1): string {
    return note.kind === 'moment'
      ? `${String(note.timeMs)} ms`
      : `floor ${String(note.voxel.y + 1)}, square ${String(note.voxel.x)},${String(note.voxel.z)}`;
  }

  function renderNotes(): void {
    notesList.replaceChildren();
    const all = harness.notes();
    noteHint.hidden = all.length > 0;
    for (const note of all) {
      const item = element('li', 'note-row');
      const where = element('button', 'note-where');
      where.textContent = describeNoteAnchor(note);
      where.title = 'Show me';
      if (note.kind === 'place' && !supportsEdit) {
        where.disabled = true;
        where.title = 'Place notes need the Edit tools, and this Studio profile omits them.';
      }
      where.addEventListener('click', () => { showNote(note); });
      const text = element('span', 'note-text');
      text.textContent = note.text;
      const remove = element('button', 'note-remove');
      remove.textContent = '×';
      remove.title = 'Remove this note';
      remove.addEventListener('click', () => { harness.removeNote(note.id); });
      item.append(where, text, remove);
      notesList.appendChild(item);
    }
  }

  function showNote(note: StudioNoteV1): void {
    if (note.kind === 'moment') {
      harness.pause();
      syncPlayButton();
      harness.seek(note.timeMs);
      return;
    }
    if (!supportsEdit) return;
    showTab('edit');
    editor.showLayer(note.voxel.y);
    editor.flashVoxel(note.voxel);
  }

  function openNoteEditor(hint: string): void {
    if (!supportsNotes) return;
    showTab('notes');
    noteEditor.hidden = false;
    noteHint.hidden = true;
    noteInput.placeholder = hint;
    noteInput.focus();
  }

  function closeNoteEditor(): void {
    state.pending = null;
    state.armedForPlace = false;
    pinPlaceButton.classList.remove('armed');
    noteEditor.hidden = true;
    noteInput.value = '';
    redrawOverlays();
    renderNotes();
  }

  function beginPlaceNote(x: number, y: number, z: number): void {
    state.pending = { kind: 'place', x, y, z };
    state.armedForPlace = false;
    pinPlaceButton.classList.remove('armed');
    openNoteEditor(`Floor ${String(y + 1)}, square ${String(x)},${String(z)} — say what should change…`);
  }

  pinPlaceButton.addEventListener('click', () => {
    if (!supportsEdit) return;
    state.armedForPlace = !state.armedForPlace;
    pinPlaceButton.classList.toggle('armed', state.armedForPlace);
    if (state.armedForPlace) {
      showTab('edit');
      noteHint.hidden = false;
      noteHint.textContent = 'Now click a floor square in the Edit tab.';
    } else {
      noteHint.textContent = 'Pause and click the picture to pin a note to that moment.';
    }
  });
  noteSave.addEventListener('click', () => {
    if (!state.pending) return;
    const text = noteInput.value;
    try {
      if (state.pending.kind === 'moment') {
        harness.addMomentNote(state.pending.timeMs, { u: state.pending.u, v: state.pending.v }, text);
      } else {
        harness.addPlaceNote({ x: state.pending.x, y: state.pending.y, z: state.pending.z }, text);
      }
    } catch (error) {
      noteInput.placeholder = String(error instanceof Error ? error.message : error);
      noteInput.value = '';
      return;
    }
    closeNoteEditor();
  });
  noteCancel.addEventListener('click', closeNoteEditor);
  noteInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') noteSave.click();
    if (event.key === 'Escape') closeNoteEditor();
  });
  sendButton.addEventListener('click', () => {
    sendButton.disabled = true;
    requestStatus.dataset.tone = 'idle';
    requestStatus.textContent = 'Sending…';
    void harness.sendRequest(requestBox.value).then((result) => {
      sendButton.disabled = false;
      if (result.ok) {
        requestStatus.dataset.tone = 'ok';
        requestStatus.textContent = `Saved as ${result.file}. An agent will pick it up; your notes stay until it does.`;
        requestBox.value = '';
      } else {
        requestStatus.dataset.tone = 'bad';
        requestStatus.textContent = result.reason;
      }
    }).catch((error: unknown) => {
      sendButton.disabled = false;
      requestStatus.dataset.tone = 'bad';
      requestStatus.textContent = String(error);
    });
  });

  function wireRequestShortcut(button: HTMLButtonElement): void {
    button.addEventListener('click', () => {
      if (!supportsNotes) return;
      showTab('notes');
      requestBox.focus();
    });
  }

  const pane = element('div', 'pane');
  pane.append(noteHint, noteEditor, notesList, pinPlaceButton, requestBox, sendButton, requestStatus);

  return { pane, renderNotes, openNoteEditor, closeNoteEditor, beginPlaceNote, wireRequestShortcut };
}
