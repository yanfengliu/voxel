import type { SceneInfoV1 } from './harness.js';
import { element } from './studio-app-helpers.js';
import {
  createStudioContextMenu,
  type StudioContextMenuInvocationV1,
  type StudioContextMenuV1,
} from './studio-context-menu.js';

export interface StudioSceneMenuDepsV1 {
  readonly visibleSceneIds: () => readonly string[];
  readonly sceneExists: (id: string) => boolean;
  readonly renameScene: (id: string, label: string) => void;
  readonly deleteScene: (id: string) => void;
  readonly rebuild: () => void;
  readonly focusScene: (id: string | null) => void;
}

export interface StudioSceneMenuV1 {
  connect(row: HTMLElement, scene: SceneInfoV1, overflowTrigger?: HTMLElement): void;
  close(): void;
  dispose(): void;
}

let dialogId = 0;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : `Scene action failed: ${String(error)}`;
}

/**
 * Adapts scene commands to the Studio context menu and owns their modal
 * dialogs. A caller-supplied menu remains caller-owned; otherwise this adapter
 * creates and disposes a private manager for backward compatibility.
 */
export function createStudioSceneMenu(
  deps: StudioSceneMenuDepsV1,
  sharedContextMenu?: StudioContextMenuV1,
): StudioSceneMenuV1 {
  const contextMenu = sharedContextMenu ?? createStudioContextMenu();
  const ownsContextMenu = sharedContextMenu === undefined;
  let activeDialog: HTMLDialogElement | null = null;
  let disposed = false;

  const focusScene = (id: string | null): void => {
    queueMicrotask(() => {
      if (!disposed) deps.focusScene(id);
    });
  };

  const removeDialog = (): void => {
    activeDialog?.remove();
    activeDialog = null;
  };

  const showDialog = (
    dialog: HTMLDialogElement,
    initialFocus: HTMLElement,
    restoreFocus: () => void,
  ): void => {
    removeDialog();
    activeDialog = dialog;
    document.body.append(dialog);
    dialog.addEventListener('close', () => {
      if (activeDialog === dialog) activeDialog = null;
      dialog.remove();
      // Native dialog focus restoration completes after the close event.
      // Restore on the next microtask so it cannot overwrite our exact target.
      queueMicrotask(() => {
        if (!disposed) restoreFocus();
      });
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

  const openRenameDialog = (
    scene: SceneInfoV1,
    invocation?: StudioContextMenuInvocationV1,
  ): void => {
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
        dialog.close();
      } catch (caught) {
        error.textContent = errorMessage(caught);
        error.hidden = false;
        input.focus();
      }
    });

    showDialog(dialog, input, () => {
      if (invocation) invocation.restoreFocus();
      else focusScene(scene.id);
    });
    queueMicrotask(() => { if (dialog.open) input.select(); });
  };

  const openDeleteDialog = (
    scene: SceneInfoV1,
    invocation?: StudioContextMenuInvocationV1,
  ): void => {
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
    let wasDeleted = false;
    cancel.addEventListener('click', () => { dialog.close(); });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const before = deps.visibleSceneIds();
      const index = before.indexOf(scene.id);
      const fallback = index < 0 ? null : before[index + 1] ?? before[index - 1] ?? null;
      try {
        deps.deleteScene(scene.id);
        wasDeleted = true;
        deps.rebuild();
        focusId = fallback;
        dialog.close();
      } catch (caught) {
        if (!deps.sceneExists(scene.id)) {
          // Deletion can finish even when renderer cleanup reports a failure.
          // Reflect the committed state and make the diagnostic non-retryable.
          deps.rebuild();
          wasDeleted = true;
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

    showDialog(dialog, cancel, () => {
      if (wasDeleted) focusScene(focusId);
      else if (invocation) invocation.restoreFocus();
      else focusScene(scene.id);
    });
  };

  return {
    connect(row, scene, overflowTrigger) {
      if (disposed) return;
      row.dataset.sceneId = scene.id;
      contextMenu.connect(row, {
        ariaLabel: `Scene actions for ${scene.label}`,
        restoreFocus: () => { focusScene(scene.id); },
        actions: [
          {
            label: 'Rename scene',
            run: (invocation) => { openRenameDialog(scene, invocation); },
          },
          {
            label: 'Delete scene',
            danger: true,
            run: (invocation) => { openDeleteDialog(scene, invocation); },
          },
        ],
      }, overflowTrigger);
    },
    close: () => { contextMenu.close(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      contextMenu.close();
      if (ownsContextMenu) contextMenu.dispose();
      removeDialog();
    },
  };
}
