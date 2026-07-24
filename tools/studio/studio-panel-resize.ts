import { element } from './studio-app-helpers.js';
import type { ViewPrefsStoreV1 } from './view-prefs.js';

/**
 * Makes the studio's library and inspector columns draggable, so a panel can be
 * given the room its content needs. It sets the grid template inline on the
 * shell root — the shell's own CSS is untouched — and adds a grab handle over
 * each column boundary. Widths persist with the same store the look does, keyed
 * separately. The stage between them follows every drag through the frame
 * loop's own resize.
 */
const LAYOUT_KEY = 'voxel-studio-layout/1';
const RAIL_MIN = 160;
const RAIL_MAX = 440;
const INSPECTOR_MIN = 260;
const INSPECTOR_MAX = 620;
const clampRail = (value: number): number => Math.min(RAIL_MAX, Math.max(RAIL_MIN, value));
const clampInspector = (value: number): number => Math.min(INSPECTOR_MAX, Math.max(INSPECTOR_MIN, value));

/**
 * Returns a dispose that stops watching the window. The grid template is set
 * inline ONLY once a custom width exists — from storage or a first drag — so a
 * studio nobody resized keeps the shared shell's own responsive columns (which
 * narrow the inspector on small screens, and which a browser test depends on).
 * Until then the handles are placed by measuring the real regions, so they
 * follow whatever the shell lays out.
 */
export function setupPanelResize(options: {
  readonly grid: HTMLElement;
  readonly railRegion: HTMLElement;
  readonly inspectorRegion: HTMLElement;
  readonly store: ViewPrefsStoreV1;
}): () => void {
  const { grid, railRegion, inspectorRegion, store } = options;
  let custom: { rail: number; inspector: number } | null = null;
  try {
    const raw = store.getItem(LAYOUT_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as { rail?: unknown; inspector?: unknown };
      if (typeof parsed.rail === 'number' && typeof parsed.inspector === 'number') {
        custom = { rail: clampRail(parsed.rail), inspector: clampInspector(parsed.inspector) };
      }
    }
  } catch { /* No custom width; keep the shell's own columns. */ }

  const railHandle = element('div', 'col-resize');
  railHandle.title = 'Drag to resize the library';
  railHandle.setAttribute('aria-label', 'Resize the library panel');
  railHandle.style.marginLeft = '-4px';
  const inspectorHandle = element('div', 'col-resize');
  inspectorHandle.title = 'Drag to resize the inspector';
  inspectorHandle.setAttribute('aria-label', 'Resize the inspector panel');
  inspectorHandle.style.marginRight = '-4px';
  // A positioned parent so the handles' offsets are relative to the grid, not
  // the page; harmless for a grid container.
  grid.style.position = 'relative';
  grid.append(railHandle, inspectorHandle);

  const sync = (): void => {
    if (custom) {
      grid.style.gridTemplateColumns = `${String(custom.rail)}px minmax(200px, 1fr) ${String(custom.inspector)}px`;
    }
    // Placed from the measured layout, so the handles sit on the real
    // boundaries whether the width came from the shell CSS or a custom drag.
    railHandle.style.left = `${String(railRegion.offsetWidth)}px`;
    inspectorHandle.style.right = `${String(inspectorRegion.offsetWidth)}px`;
  };
  sync();
  // Only re-place the handles on resize; custom widths are fixed pixels and do
  // not move, but the shell's responsive columns do.
  const onWindowResize = (): void => { sync(); };
  window.addEventListener('resize', onWindowResize);

  const dragHandle = (handle: HTMLElement, axis: 'rail' | 'inspector'): void => {
    handle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      handle.classList.add('dragging');
      // The first drag adopts the current measured widths as the baseline, and
      // from here the studio keeps its own columns.
      custom ??= { rail: railRegion.offsetWidth, inspector: inspectorRegion.offsetWidth };
      const startX = event.clientX;
      const startRail = custom.rail;
      const startInspector = custom.inspector;
      const move = (moveEvent: PointerEvent): void => {
        const dx = moveEvent.clientX - startX;
        if (custom === null) return;
        if (axis === 'rail') custom.rail = clampRail(startRail + dx);
        // Dragging the inspector handle left widens the inspector.
        else custom.inspector = clampInspector(startInspector - dx);
        sync();
      };
      const up = (upEvent: PointerEvent): void => {
        handle.releasePointerCapture(upEvent.pointerId);
        handle.classList.remove('dragging');
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        try { store.setItem(LAYOUT_KEY, JSON.stringify(custom)); } catch { /* ignore */ }
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  };
  dragHandle(railHandle, 'rail');
  dragHandle(inspectorHandle, 'inspector');

  return () => { window.removeEventListener('resize', onWindowResize); };
}
