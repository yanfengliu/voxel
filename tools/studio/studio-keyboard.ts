export interface StudioKeyboardOptionsV1 {
  readonly root: HTMLElement;
  readonly sceneOpen: () => boolean;
  readonly noteEditorOpen: () => boolean;
  readonly closeNoteEditor: () => void;
  readonly undoScene: () => void;
  readonly redoScene: () => void;
  readonly step: (direction: -1 | 1) => void;
}

export interface StudioKeyboardHandleV1 {
  attach(): void;
  dispose(): void;
}

let ownerRoot: HTMLElement | null = null;
const attachedRoots: HTMLElement[] = [];

function promote(root: HTMLElement): void {
  const previous = attachedRoots.indexOf(root);
  if (previous >= 0) attachedRoots.splice(previous, 1);
  attachedRoots.push(root);
  ownerRoot = root;
}

/** Routes page-level shortcuts to the most recently used studio mount. */
export function createStudioKeyboard(options: StudioKeyboardOptionsV1): StudioKeyboardHandleV1 {
  const { root } = options;
  const claimOwnership = (): void => { promote(root); };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!(event.target instanceof Node)) return;
    const targetIsPage = event.target === document.body || event.target === document.documentElement;
    if (!root.contains(event.target) && !(targetIsPage && ownerRoot === root)) return;
    if (event.key === 'Escape' && options.noteEditorOpen()) options.closeNoteEditor();
    const targetElement = event.target instanceof Element ? event.target : null;
    const editingText = targetElement?.closest('input, textarea, [contenteditable]:not([contenteditable="false"])');
    if (editingText) return;

    const modifier = event.ctrlKey || event.metaKey;
    const undoKey = event.key === 'z' || event.key === 'Z';
    const redoKey = event.key === 'y' || event.key === 'Y';
    if (options.sceneOpen() && modifier && (undoKey || redoKey)) {
      event.preventDefault();
      if (redoKey || event.shiftKey) options.redoScene(); else options.undoScene();
      return;
    }
    if (targetElement?.closest('button, select')) return;
    // A scene can contain independent model and light periods, so there is no
    // honest single "next model frame" for the hidden-model stepper to apply.
    if (!options.sceneOpen() && event.key === 'ArrowLeft') options.step(-1);
    if (!options.sceneOpen() && event.key === 'ArrowRight') options.step(1);
  };

  let attached = false;
  return {
    attach() {
      if (attached) return;
      attached = true;
      root.addEventListener('pointerdown', claimOwnership, true);
      root.addEventListener('focusin', claimOwnership, true);
      if (ownerRoot === null) promote(root); else attachedRoots.push(root);
      document.addEventListener('keydown', onKeyDown);
    },
    dispose() {
      if (!attached) return;
      attached = false;
      root.removeEventListener('pointerdown', claimOwnership, true);
      root.removeEventListener('focusin', claimOwnership, true);
      const index = attachedRoots.indexOf(root);
      if (index >= 0) attachedRoots.splice(index, 1);
      if (ownerRoot === root) ownerRoot = attachedRoots.at(-1) ?? null;
      document.removeEventListener('keydown', onKeyDown);
    },
  };
}
