import type { ModelLabelInfoV1 } from './model-label-workspace.js';
import { element } from './studio-app-helpers.js';
import type {
  StudioContextMenuInvocationV1,
  StudioContextMenuTargetV1,
  StudioContextMenuV1,
} from './studio-context-menu.js';

export interface StudioModelMenuDepsV1 {
  readonly openModel: (id: string, tab: 'examine' | 'build') => void;
  readonly renameModel: (id: string, label: string) => void;
  readonly restoreModelName: (id: string) => void;
  readonly focusModel: (id: string) => void;
  readonly reportError: (message: string) => void;
}

export interface StudioModelMenuV1 {
  connect(row: HTMLElement, model: ModelLabelInfoV1, overflowTrigger?: HTMLElement): void;
  dispose(): void;
}

let dialogId = 0;

function errorMessage(action: string, model: ModelLabelInfoV1, error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  return `${action} “${model.label}” failed: ${reason}`;
}

/**
 * Model-specific commands and rename dialog.
 *
 * The shared context-menu owner handles pointer, keyboard, positioning, and
 * cleanup. This adapter changes only the mount-local display label; catalog
 * data and every stable id remain untouched.
 */
export function createStudioModelMenu(
  deps: StudioModelMenuDepsV1,
  contextMenu: StudioContextMenuV1,
): StudioModelMenuV1 {
  let activeDialog: HTMLDialogElement | null = null;
  let disposed = false;

  const focusModel = (id: string): void => {
    queueMicrotask(() => {
      if (!disposed) deps.focusModel(id);
    });
  };

  const removeDialog = (): void => {
    activeDialog?.remove();
    activeDialog = null;
  };

  const openRenameDialog = (
    model: ModelLabelInfoV1,
    invocation?: StudioContextMenuInvocationV1,
  ): void => {
    removeDialog();
    const id = String(++dialogId);
    const dialog = element('dialog', 'scene-dialog model-rename-dialog');
    const form = element('form', 'scene-dialog-form');
    const title = element('h2');
    title.id = `model-rename-title-${id}`;
    title.textContent = 'Rename model';
    dialog.setAttribute('aria-labelledby', title.id);
    const explanation = element('p', 'scene-dialog-copy');
    explanation.textContent = `Only this Studio session’s display name changes. The stable id “${model.id}” `
      + 'stays the same, so recipes and scenes keep resolving it.';
    const label = element('label', 'scene-dialog-label');
    label.textContent = 'Display name';
    const input = element('input', 'scene-dialog-input');
    input.type = 'text';
    input.value = model.label;
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
    form.append(title, explanation, label, error, actions);
    dialog.append(form);

    cancel.addEventListener('click', () => { dialog.close(); });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const nextLabel = input.value.trim();
      if (nextLabel === '') {
        error.textContent = 'Enter a display name containing at least one non-whitespace character.';
        error.hidden = false;
        input.focus();
        return;
      }
      try {
        deps.renameModel(model.id, nextLabel);
        dialog.close();
      } catch (caught) {
        error.textContent = errorMessage('Renaming', model, caught);
        error.hidden = false;
        input.focus();
      }
    });
    dialog.addEventListener('close', () => {
      if (activeDialog === dialog) activeDialog = null;
      dialog.remove();
      // Native dialog focus restoration completes after the close event.
      // Restore on the next microtask so it cannot overwrite our exact target.
      queueMicrotask(() => {
        if (disposed) return;
        if (invocation) invocation.restoreFocus();
        else focusModel(model.id);
      });
    }, { once: true });
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      const outside = event.clientX < bounds.left || event.clientX > bounds.right
        || event.clientY < bounds.top || event.clientY > bounds.bottom;
      if (outside) dialog.close();
    });
    document.body.append(dialog);
    activeDialog = dialog;
    dialog.showModal();
    queueMicrotask(() => {
      if (!dialog.open) return;
      input.focus({ preventScroll: true });
      input.select();
    });
  };

  const runModelAction = (
    action: string,
    model: ModelLabelInfoV1,
    command: () => void,
  ): void => {
    try {
      command();
      focusModel(model.id);
    } catch (error) {
      deps.reportError(errorMessage(action, model, error));
      focusModel(model.id);
    }
  };

  return {
    connect(row, model, overflowTrigger) {
      const target: StudioContextMenuTargetV1 = {
        ariaLabel: `Model actions for ${model.label}`,
        restoreFocus: () => { focusModel(model.id); },
        actions: [
          {
            label: 'Examine model',
            run: () => {
              runModelAction('Opening', model, () => { deps.openModel(model.id, 'examine'); });
            },
          },
          {
            label: 'Watch build',
            run: () => {
              runModelAction('Opening the build for', model, () => { deps.openModel(model.id, 'build'); });
            },
          },
          {
            label: 'Rename model',
            run: (invocation) => { openRenameDialog(model, invocation); },
          },
          ...(model.renamed ? [{
            label: 'Restore original name',
            run: () => {
              runModelAction('Restoring the name of', model, () => { deps.restoreModelName(model.id); });
            },
          }] : []),
        ],
      };
      contextMenu.connect(row, target, overflowTrigger);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      removeDialog();
    },
  };
}
