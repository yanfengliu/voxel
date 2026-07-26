export interface StudioKeyboardOptionsV1 {
  readonly root: HTMLElement;
  readonly sceneOpen: () => boolean;
  readonly noteEditorOpen: () => boolean;
  readonly closeNoteEditor: () => void;
  /** Cancels click-only work before accepted camera movement begins. */
  readonly onMovementStart?: () => void;
  readonly undoScene: () => void;
  readonly redoScene: () => void;
  readonly step: (direction: -1 | 1) => void;
}

export interface StudioKeyboardHandleV1 {
  attach(): void;
  /** Camera-relative held input: positive forward is W, positive right is D. */
  movement(): { readonly forward: number; readonly right: number };
  clearMovement(): void;
  dispose(): void;
}

interface AttachedStudioKeyboardV1 {
  readonly root: HTMLElement;
  readonly clearMovement: () => void;
}

let owner: AttachedStudioKeyboardV1 | null = null;
const attachedKeyboards: AttachedStudioKeyboardV1[] = [];

function promote(keyboard: AttachedStudioKeyboardV1): void {
  if (owner !== keyboard) owner?.clearMovement();
  const previous = attachedKeyboards.indexOf(keyboard);
  if (previous >= 0) attachedKeyboards.splice(previous, 1);
  attachedKeyboards.push(keyboard);
  owner = keyboard;
}

/** Routes page-level shortcuts to the most recently used studio mount. */
export function createStudioKeyboard(options: StudioKeyboardOptionsV1): StudioKeyboardHandleV1 {
  const { root } = options;
  const heldMovementCodes = new Set<string>();
  const clearMovement = (): void => { heldMovementCodes.clear(); };
  const keyboard: AttachedStudioKeyboardV1 = { root, clearMovement };
  const movementCode = (event: KeyboardEvent): string | null => {
    if (event.code === 'KeyW' || event.code === 'KeyA'
      || event.code === 'KeyS' || event.code === 'KeyD') return event.code;
    const key = event.key.toLowerCase();
    if (key === 'w' || key === 'a' || key === 's' || key === 'd') {
      return `Key${key.toUpperCase()}`;
    }
    return null;
  };
  const interactiveControl = (target: EventTarget | null): Element | null => {
    const targetElement = target instanceof Element ? target : null;
    return targetElement?.closest(
      'a[href], area[href], summary, input, textarea, button, select, option, '
      + '[contenteditable]:not([contenteditable="false"]), [role="button"], [role="checkbox"], '
      + '[role="combobox"], [role="link"], [role="listbox"], [role="menuitem"], '
      + '[role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="radio"], '
      + '[role="slider"], [role="spinbutton"], [role="switch"], [role="tab"], [role="textbox"], '
      + '[role="treeitem"]',
    ) ?? null;
  };
  const textEditingControl = (target: EventTarget | null): Element | null => {
    const targetElement = target instanceof Element ? target : null;
    return targetElement?.closest(
      'input, textarea, [contenteditable]:not([contenteditable="false"]), '
      + '[role="textbox"], [role="spinbutton"], [role="slider"], [role="combobox"], [role="listbox"]',
    ) ?? null;
  };
  const claimOwnership = (event: Event): void => {
    promote(keyboard);
    if (interactiveControl(event.target) !== null) clearMovement();
  };
  const ownsEventTarget = (target: EventTarget | null): target is Node => {
    if (!(target instanceof Node)) return false;
    const targetIsPage = target === document.body || target === document.documentElement;
    return root.contains(target) || (targetIsPage && owner === keyboard);
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!ownsEventTarget(event.target)) return;
    if (event.key === 'Escape' && options.noteEditorOpen()) options.closeNoteEditor();
    if (textEditingControl(event.target) !== null) return;

    const modifier = event.ctrlKey || event.metaKey;
    const undoKey = event.key === 'z' || event.key === 'Z';
    const redoKey = event.key === 'y' || event.key === 'Y';
    if (options.sceneOpen() && modifier && (undoKey || redoKey)) {
      event.preventDefault();
      if (redoKey || event.shiftKey) options.redoScene(); else options.undoScene();
      return;
    }
    if (interactiveControl(event.target) !== null) return;
    const code = movementCode(event);
    if (code !== null && !event.isComposing
      && !event.ctrlKey && !event.metaKey && !event.altKey) {
      options.onMovementStart?.();
      promote(keyboard);
      heldMovementCodes.add(code);
      event.preventDefault();
      return;
    }
    // A scene can contain independent model and light periods, so there is no
    // honest single "next model frame" for the hidden-model stepper to apply.
    if (!options.sceneOpen() && event.key === 'ArrowLeft') options.step(-1);
    if (!options.sceneOpen() && event.key === 'ArrowRight') options.step(1);
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    const code = movementCode(event);
    if (code === null || !heldMovementCodes.delete(code)) return;
    event.preventDefault();
  };
  const onVisibilityChange = (): void => {
    if (document.hidden) clearMovement();
  };
  const onDocumentFocusIn = (event: FocusEvent): void => {
    if (owner === keyboard && event.target instanceof Node && !root.contains(event.target)) {
      clearMovement();
    }
  };

  let attached = false;
  return {
    attach() {
      if (attached) return;
      attached = true;
      root.addEventListener('pointerdown', claimOwnership, true);
      root.addEventListener('focusin', claimOwnership, true);
      if (owner === null) promote(keyboard); else attachedKeyboards.push(keyboard);
      document.addEventListener('keydown', onKeyDown);
      document.addEventListener('keyup', onKeyUp);
      document.addEventListener('focusin', onDocumentFocusIn);
      document.addEventListener('visibilitychange', onVisibilityChange);
      window.addEventListener('blur', clearMovement);
    },
    movement() {
      return {
        forward: Number(heldMovementCodes.has('KeyW')) - Number(heldMovementCodes.has('KeyS')),
        right: Number(heldMovementCodes.has('KeyD')) - Number(heldMovementCodes.has('KeyA')),
      };
    },
    clearMovement,
    dispose() {
      if (!attached) return;
      attached = false;
      clearMovement();
      root.removeEventListener('pointerdown', claimOwnership, true);
      root.removeEventListener('focusin', claimOwnership, true);
      const index = attachedKeyboards.indexOf(keyboard);
      if (index >= 0) attachedKeyboards.splice(index, 1);
      if (owner === keyboard) owner = attachedKeyboards.at(-1) ?? null;
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('focusin', onDocumentFocusIn);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', clearMovement);
    },
  };
}
