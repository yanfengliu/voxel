import type { StudioContextMenuActionV1 } from './studio-context-menu.js';
import type {
  StudioShelfItemKindV1,
  StudioShelfMovePositionV1,
  StudioShelfMoveV1,
} from './studio-shelf-order.js';

export interface StudioShelfSortableIdentityV1 {
  readonly kind: StudioShelfItemKindV1;
  readonly id: string;
  readonly label: string;
  readonly sectionIndex?: number;
}

export interface StudioShelfSortableItemV1 extends StudioShelfSortableIdentityV1 {
  readonly container: HTMLElement;
  readonly trigger: HTMLElement;
}

export interface StudioShelfSorterDepsV1 {
  readonly order: (kind: StudioShelfItemKindV1, sectionIndex?: number) => readonly string[];
  readonly move: (request: StudioShelfMoveV1) => readonly string[];
  readonly focus: (kind: StudioShelfItemKindV1, id: string, sectionIndex?: number) => void;
  readonly report: (message: string) => void;
  readonly reportError: (message: string) => void;
  readonly closeMenu: () => void;
  readonly enabled: () => boolean;
}

export interface StudioShelfSorterV1 {
  /** Makes the whole visible entry draggable while leaving its overflow button clickable. */
  connect(item: StudioShelfSortableItemV1): void;
  /** Accessible equivalents appended to the item's Shift+F10 context menu. */
  actions(item: StudioShelfSortableIdentityV1): readonly StudioContextMenuActionV1[];
  /** Releases listeners under a shelf body before its entries are replaced. */
  disconnectWithin(root: HTMLElement): void;
  dispose(): void;
}

function sameScope(a: StudioShelfSortableItemV1, b: StudioShelfSortableItemV1): boolean {
  return a.kind === b.kind && a.sectionIndex === b.sectionIndex;
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/** Native drag-and-drop plus keyboard-accessible context-menu moves for one shelf. */
export function createStudioShelfSorter(deps: StudioShelfSorterDepsV1): StudioShelfSorterV1 {
  const disconnectors = new Map<HTMLElement, () => void>();
  let active: StudioShelfSortableItemV1 | null = null;
  let dropTarget: StudioShelfSortableItemV1 | null = null;
  let dropPosition: StudioShelfMovePositionV1 = 'before';
  let disposed = false;
  const reorderableOrder = (
    item: StudioShelfSortableIdentityV1,
  ): readonly string[] | null => {
    if (!deps.enabled()) return null;
    try {
      const ids = deps.order(item.kind, item.sectionIndex);
      return ids.length > 1
        && new Set(ids).size === ids.length
        && ids.includes(item.id)
        ? ids
        : null;
    } catch {
      return null;
    }
  };
  const canReorder = (item: StudioShelfSortableIdentityV1): boolean =>
    reorderableOrder(item) !== null;

  const clearDropTarget = (): void => {
    dropTarget?.container.classList.remove('drop-before', 'drop-after');
    dropTarget = null;
  };
  const clearDrag = (): void => {
    active?.container.classList.remove('dragging');
    active = null;
    clearDropTarget();
  };
  const perform = (
    item: StudioShelfSortableIdentityV1,
    targetId: string,
    position: StudioShelfMovePositionV1,
    success: string,
  ): void => {
    try {
      const before = deps.order(item.kind, item.sectionIndex);
      const after = deps.move({
        kind: item.kind,
        id: item.id,
        targetId,
        position,
        ...(item.sectionIndex === undefined ? {} : { sectionIndex: item.sectionIndex }),
      });
      deps.report(sameOrder(before, after) ? `“${item.label}” is already there.` : success);
      deps.focus(item.kind, item.id, item.sectionIndex);
    } catch (error) {
      deps.reportError(
        `Rearranging “${item.label}” failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      deps.focus(item.kind, item.id, item.sectionIndex);
    }
  };

  return {
    connect(item) {
      if (disposed) return;
      const { container, trigger } = item;
      const reorderable = canReorder(item);
      container.draggable = reorderable;
      container.dataset.librarySortable = String(reorderable);
      container.dataset.librarySortableKind = item.kind;
      container.dataset.librarySortableKey = item.id;
      trigger.setAttribute(
        'aria-description',
        reorderable
          ? 'Drag to rearrange. Use Shift+F10 for Move up and Move down commands.'
          : deps.enabled()
            ? 'This list needs at least two entries with unique stable IDs before it can be rearranged.'
            : 'Clear the library search to rearrange this item.',
      );
      let suppressClick = false;
      let releaseClickTimer = 0;
      let pointerStartedOnNestedAction = false;

      const onPointerDown = (event: PointerEvent): void => {
        const origin = event.target;
        if (!(origin instanceof Element)) {
          pointerStartedOnNestedAction = false;
          return;
        }
        const action = origin.closest(
          '.library-more, button, a, input, select, textarea, [role="button"]',
        );
        pointerStartedOnNestedAction = action !== null
          && action !== trigger
          && !trigger.contains(action);
      };
      const resetPointerOrigin = (): void => {
        pointerStartedOnNestedAction = false;
      };

      const onDragStart = (event: DragEvent): void => {
        if (!canReorder(item)) {
          event.preventDefault();
          return;
        }
        if (pointerStartedOnNestedAction) {
          event.preventDefault();
          return;
        }
        deps.closeMenu();
        active = item;
        suppressClick = true;
        event.dataTransfer?.setData('text/plain', `${item.kind}:${item.id}`);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        requestAnimationFrame(() => {
          if (active === item && container.isConnected) container.classList.add('dragging');
        });
      };
      const onDragOver = (event: DragEvent): void => {
        if (active === null || active.id === item.id || !sameScope(active, item)) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        const bounds = container.getBoundingClientRect();
        const position: StudioShelfMovePositionV1 =
          event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after';
        if (dropTarget === item && dropPosition === position) return;
        clearDropTarget();
        dropTarget = item;
        dropPosition = position;
        container.classList.add(position === 'before' ? 'drop-before' : 'drop-after');
      };
      const onDragLeave = (event: DragEvent): void => {
        if (dropTarget !== item) return;
        const related = event.relatedTarget;
        if (related instanceof Node && container.contains(related)) return;
        clearDropTarget();
      };
      const onDrop = (event: DragEvent): void => {
        const source = active;
        if (source === null || source.id === item.id || !sameScope(source, item)) return;
        event.preventDefault();
        const position = dropTarget === item ? dropPosition : 'before';
        clearDrag();
        perform(
          source,
          item.id,
          position,
          `Moved “${source.label}” ${position} “${item.label}”.`,
        );
      };
      const onDragEnd = (): void => {
        resetPointerOrigin();
        clearDrag();
        window.clearTimeout(releaseClickTimer);
        releaseClickTimer = window.setTimeout(() => { suppressClick = false; }, 0);
      };
      const onClickCapture = (event: MouseEvent): void => {
        if (!suppressClick) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      };

      container.addEventListener('pointerdown', onPointerDown, true);
      container.addEventListener('pointerup', resetPointerOrigin, true);
      container.addEventListener('pointercancel', resetPointerOrigin, true);
      container.addEventListener('dragstart', onDragStart);
      container.addEventListener('dragover', onDragOver);
      container.addEventListener('dragleave', onDragLeave);
      container.addEventListener('drop', onDrop);
      container.addEventListener('dragend', onDragEnd);
      container.addEventListener('click', onClickCapture, true);
      disconnectors.set(container, () => {
        window.clearTimeout(releaseClickTimer);
        if (active === item) clearDrag();
        else if (dropTarget === item) clearDropTarget();
        container.removeEventListener('pointerdown', onPointerDown, true);
        container.removeEventListener('pointerup', resetPointerOrigin, true);
        container.removeEventListener('pointercancel', resetPointerOrigin, true);
        container.removeEventListener('dragstart', onDragStart);
        container.removeEventListener('dragover', onDragOver);
        container.removeEventListener('dragleave', onDragLeave);
        container.removeEventListener('drop', onDrop);
        container.removeEventListener('dragend', onDragEnd);
        container.removeEventListener('click', onClickCapture, true);
        container.removeAttribute('draggable');
        delete container.dataset.librarySortable;
        delete container.dataset.librarySortableKind;
        delete container.dataset.librarySortableKey;
        trigger.removeAttribute('aria-description');
        disconnectors.delete(container);
      });
    },
    actions(item) {
      const ids = reorderableOrder(item);
      if (ids === null) return [];
      const index = ids.indexOf(item.id);
      return [
        ...(index > 0 ? [{
          label: 'Move up',
          run: () => {
            perform(item, ids[index - 1]!, 'before', `Moved “${item.label}” up.`);
          },
        }] : []),
        ...(index >= 0 && index < ids.length - 1 ? [{
          label: 'Move down',
          run: () => {
            perform(item, ids[index + 1]!, 'after', `Moved “${item.label}” down.`);
          },
        }] : []),
      ];
    },
    disconnectWithin(root) {
      for (const [container, disconnect] of disconnectors) {
        if (container === root || root.contains(container)) disconnect();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearDrag();
      for (const disconnect of [...disconnectors.values()]) disconnect();
    },
  };
}
