export interface StudioSceneNotesFocusV1 {
  editorOwnsFocus(): boolean;
  restoreAfterEditorCloses(editorHadFocus: boolean): void;
  focusPinShowOrAnnotate(preferredPinIds: readonly number[]): void;
}

export function createStudioSceneNotesFocusV1(options: {
  readonly editor: HTMLElement;
  readonly pinText: HTMLTextAreaElement;
  readonly annotateButton: HTMLButtonElement;
  readonly pinShowButtons: () => ReadonlyMap<number, HTMLButtonElement>;
}): StudioSceneNotesFocusV1 {
  return {
    editorOwnsFocus() {
      const active = options.pinText.ownerDocument.activeElement;
      return active !== null && options.editor.contains(active);
    },

    restoreAfterEditorCloses(editorHadFocus) {
      if (!editorHadFocus) return;
      if (!options.annotateButton.disabled) {
        options.annotateButton.focus();
        return;
      }
      const active = options.pinText.ownerDocument.activeElement;
      if (active instanceof HTMLElement) active.blur();
    },

    focusPinShowOrAnnotate(preferredPinIds) {
      const pinShowButtons = options.pinShowButtons();
      for (const pinId of preferredPinIds) {
        const show = pinShowButtons.get(pinId);
        if (show !== undefined && !show.disabled) {
          show.focus();
          return;
        }
      }
      const firstAvailable = Array.from(pinShowButtons.values()).find((show) => !show.disabled);
      if (firstAvailable !== undefined) {
        firstAvailable.focus();
      } else if (!options.annotateButton.disabled) {
        options.annotateButton.focus();
      }
    },
  };
}
