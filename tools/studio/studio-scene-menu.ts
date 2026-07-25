import type { SceneInfoV1 } from './harness.js';
import { element } from './studio-app-helpers.js';

export interface StudioSceneMenuDepsV1 {
  readonly visibleSceneIds: () => readonly string[];
  readonly sceneExists: (id: string) => boolean;
  readonly renameScene: (id: string, label: string) => void;
  readonly deleteScene: (id: string) => void;
  readonly rebuild: () => void;
  readonly focusScene: (id: string | null) => void;
}

export interface StudioSceneMenuV1 {
  connect(row: HTMLButtonElement, scene: SceneInfoV1): void;
  close(): void;
  dispose(): void;
}

let dialogId = 0;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : `Scene action failed: ${String(error)}`;
}

/**
 * Owns the body-level menu and modal dialogs used by scene rows.
 *
 * The shelf itself is scrollable, so the menu is fixed against the viewport
 * rather than clipped inside the rail. Every document/window listener exists
 * only while the menu is open and is removed again by close or dispose.
 */
export function createStudioSceneMenu(deps: StudioSceneMenuDepsV1): StudioSceneMenuV1 {
  let menu: HTMLElement | null = null;
  let menuTrigger: HTMLButtonElement | null = null;
  let activeDialog: HTMLDialogElement | null = null;
  let disposed = false;
  let detachMenuGlobals = (): void => { /* no open menu */ };

  const focusScene = (id: string | null): void => {
    queueMicrotask(() => {
      if (!disposed) deps.focusScene(id);
    });
  };

  const closeMenu = (restoreFocus: boolean): void => {
    detachMenuGlobals();
    detachMenuGlobals = () => { /* no open menu */ };
    const trigger = menuTrigger;
    menuTrigger = null;
    menu?.remove();
    menu = null;
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) {
      if (trigger?.isConnected) trigger.focus();
      else focusScene(trigger?.dataset.sceneId ?? null);
    }
  };

  const removeDialog = (): void => {
    activeDialog?.remove();
    activeDialog = null;
  };

  const showDialog = (
    dialog: HTMLDialogElement,
    initialFocus: HTMLElement,
    focusAfterClose: () => string | null,
  ): void => {
    removeDialog();
    activeDialog = dialog;
    document.body.append(dialog);
    dialog.addEventListener('close', () => {
      if (activeDialog === dialog) activeDialog = null;
      dialog.remove();
      focusScene(focusAfterClose());
    }, { once: true });
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      const outside = event.clientX < bounds.left || event.clientX > bounds.right
        || event.clientY < bounds.top || event.clientY > bounds.bottom;
      if (outside) dialog.close();
    });
    dialog.showModal();
    queueMicrotask(() => {
      if (dialog.open) initialFocus.focus({ preventScroll: true });
    });
  };

  const openRenameDialog = (scene: SceneInfoV1): void => {
    const id = String(++dialogId);
    const dialog = element('dialog', 'scene-dialog');
    const form = element('form', 'scene-dialog-form');
    const title = element('h2');
    title.id = `scene-rename-title-${id}`;
    title.textContent = 'Rename scene';
    dialog.setAttribute('aria-labelledby', title.id);
    const label = element('label', 'scene-dialog-label');
    label.textContent = 'Scene name';
    const input = element('input', 'scene-dialog-input');
    input.type = 'text';
    input.value = scene.label;
    input.autocomplete = 'off';
    label.append(input);
    const error = element('p', 'scene-dialog-error');
    error.setAttribute('role', 'alert');
    error.hidden = true;
    const actions = element('div', 'scene-dialog-actions');
    const cancel = element('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    const rename = element('button', 'primary');
    rename.type = 'submit';
    rename.textContent = 'Rename';
    actions.append(cancel, rename);
    form.append(title, label, error, actions);
    dialog.append(form);

    let focusId: string | null = scene.id;
    cancel.addEventListener('click', () => { dialog.close(); });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const nextLabel = input.value.trim();
      if (nextLabel === '') {
        error.textContent = 'Enter a scene name containing at least one non-whitespace character.';
        error.hidden = false;
        input.focus();
        return;
      }
      try {
        deps.renameScene(scene.id, nextLabel);
        deps.rebuild();
        focusId = scene.id;
        dialog.close();
      } catch (caught) {
        error.textContent = errorMessage(caught);
        error.hidden = false;
        input.focus();
      }
    });

    showDialog(dialog, input, () => focusId);
    queueMicrotask(() => { if (dialog.open) input.select(); });
  };

  const openDeleteDialog = (scene: SceneInfoV1): void => {
    const id = String(++dialogId);
    const dialog = element('dialog', 'scene-dialog');
    const form = element('form', 'scene-dialog-form');
    const title = element('h2');
    title.id = `scene-delete-title-${id}`;
    title.textContent = 'Delete scene?';
    dialog.setAttribute('aria-labelledby', title.id);
    const message = element('p', 'scene-dialog-copy');
    message.textContent = `Delete “${scene.label}” and its ${String(scene.models)} `
      + `model placement${scene.models === 1 ? '' : 's'} from this Studio session?`;
    const error = element('p', 'scene-dialog-error');
    error.setAttribute('role', 'alert');
    error.hidden = true;
    const actions = element('div', 'scene-dialog-actions');
    const cancel = element('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    const remove = element('button', 'danger');
    remove.type = 'submit';
    remove.textContent = 'Delete';
    actions.append(cancel, remove);
    form.append(title, message, error, actions);
    dialog.append(form);

    let focusId: string | null = scene.id;
    cancel.addEventListener('click', () => { dialog.close(); });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const before = deps.visibleSceneIds();
      const index = before.indexOf(scene.id);
      const fallback = index < 0 ? null : before[index + 1] ?? before[index - 1] ?? null;
      try {
        deps.deleteScene(scene.id);
        deps.rebuild();
        focusId = fallback;
        dialog.close();
      } catch (caught) {
        if (!deps.sceneExists(scene.id)) {
          // Deletion can finish even when renderer cleanup reports a failure.
          // Reflect the committed state and make the diagnostic non-retryable.
          deps.rebuild();
          focusId = fallback;
          remove.disabled = true;
          remove.textContent = 'Deleted';
          cancel.textContent = 'Close';
        }
        error.textContent = errorMessage(caught);
        error.hidden = false;
        cancel.focus();
      }
    });

    showDialog(dialog, cancel, () => focusId);
  };

  const openMenu = (
    row: HTMLButtonElement,
    scene: SceneInfoV1,
    left: number,
    top: number,
  ): void => {
    if (disposed) return;
    closeMenu(false);
    menuTrigger = row;
    row.setAttribute('aria-expanded', 'true');
    const nextMenu = element('div', 'scene-context-menu');
    nextMenu.setAttribute('role', 'menu');
    nextMenu.setAttribute('aria-label', `Scene actions for ${scene.label}`);
    const rename = element('button');
    rename.type = 'button';
    rename.setAttribute('role', 'menuitem');
    rename.textContent = 'Rename scene';
    const remove = element('button', 'danger');
    remove.type = 'button';
    remove.setAttribute('role', 'menuitem');
    remove.textContent = 'Delete scene';
    nextMenu.append(rename, remove);
    document.body.append(nextMenu);
    menu = nextMenu;

    const bounds = nextMenu.getBoundingClientRect();
    const gutter = 8;
    const windowWidth = document.defaultView?.innerWidth ?? bounds.width + gutter * 2;
    const windowHeight = document.defaultView?.innerHeight ?? bounds.height + gutter * 2;
    nextMenu.style.left = `${String(Math.max(gutter, Math.min(left, windowWidth - bounds.width - gutter)))}px`;
    nextMenu.style.top = `${String(Math.max(gutter, Math.min(top, windowHeight - bounds.height - gutter)))}px`;

    const items = [rename, remove];
    nextMenu.addEventListener('keydown', (event) => {
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      let target: number;
      if (event.key === 'ArrowDown') target = (current + 1) % items.length;
      else if (event.key === 'ArrowUp') target = (current - 1 + items.length) % items.length;
      else if (event.key === 'Home') target = 0;
      else if (event.key === 'End') target = items.length - 1;
      else if (event.key === 'Tab') {
        // Put focus back on the trigger before the browser performs its normal
        // Tab move, so the menu closes and the key continues through the shelf.
        closeMenu(true);
        return;
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu(true);
        return;
      } else return;
      event.preventDefault();
      items[target]?.focus();
    });
    rename.addEventListener('click', () => {
      closeMenu(false);
      openRenameDialog(scene);
    });
    remove.addEventListener('click', () => {
      closeMenu(false);
      openDeleteDialog(scene);
    });

    const onOutsidePointer = (event: PointerEvent): void => {
      if (!nextMenu.contains(event.target as Node)) closeMenu(false);
    };
    const onViewportChange = (): void => { closeMenu(false); };
    let initialScrollMaySettle = true;
    const settleFrame = window.requestAnimationFrame(() => {
      initialScrollMaySettle = false;
    });
    const onScroll = (): void => {
      // Playwright and browsers may finish scrolling a just-clicked row after
      // contextmenu fires. Only that opening-frame scroll may be ignored.
      if (initialScrollMaySettle && nextMenu.contains(document.activeElement)) return;
      closeMenu(false);
    };
    document.addEventListener('pointerdown', onOutsidePointer, true);
    document.addEventListener('scroll', onScroll, true);
    document.addEventListener('wheel', onViewportChange, true);
    window.addEventListener('resize', onViewportChange);
    detachMenuGlobals = () => {
      window.cancelAnimationFrame(settleFrame);
      document.removeEventListener('pointerdown', onOutsidePointer, true);
      document.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('wheel', onViewportChange, true);
      window.removeEventListener('resize', onViewportChange);
    };
    rename.focus({ preventScroll: true });
  };

  return {
    connect(row, scene) {
      row.dataset.sceneId = scene.id;
      row.setAttribute('aria-haspopup', 'menu');
      row.setAttribute('aria-expanded', 'false');
      row.setAttribute('aria-keyshortcuts', 'Shift+F10');
      row.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        openMenu(row, scene, event.clientX, event.clientY);
      });
      row.addEventListener('keydown', (event) => {
        if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return;
        event.preventDefault();
        const bounds = row.getBoundingClientRect();
        openMenu(row, scene, bounds.left + 12, bounds.bottom);
      });
    },
    close: () => { closeMenu(false); },
    dispose() {
      if (disposed) return;
      disposed = true;
      closeMenu(false);
      removeDialog();
    },
  };
}
