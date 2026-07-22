import type { VoxelStudioHarnessV1 } from './harness.js';
import type { StudioModelV1 } from './model.js';
import { voxelIndex } from './model.js';
import type { ModelStudioTabId } from './shared-ui/index.js';
import type { StudioEditStateV1 } from './studio-app-context.js';
import { element, hexRgb, labelled, rgbHex } from './studio-app-helpers.js';

/**
 * The Edit tab: paint the model floor by floor. A swatch palette, a stack of
 * floors tallest first, and the one editable floor as a grid. Painting and
 * recolouring go through the harness; the top bar's Open/New/Copy commands are
 * created there but wired here, because their behaviour is all editing.
 */

export interface StudioEditorDepsV1 {
  readonly harness: VoxelStudioHarnessV1;
  readonly supportsEdit: boolean;
  /** The floor/colour/anchor state the editor shares with the app and notes. */
  readonly state: StudioEditStateV1;
  readonly showTab: (name: ModelStudioTabId) => void;
  /** Arms a place note on this cell; owned by the notes panel. */
  readonly beginPlaceNote: (x: number, y: number, z: number) => void;
}

/** The top-bar commands the editor owns the behaviour of. */
export interface StudioEditorTopBarV1 {
  readonly openButton: HTMLButtonElement;
  readonly newButton: HTMLButtonElement;
  readonly copyButton: HTMLButtonElement;
}

export interface StudioEditorPanelV1 {
  readonly pane: HTMLElement;
  /** Rebuilds every editor control to match the open model. Called on refresh. */
  rebuild(): void;
  /** Shows a given floor, rebuilding the stack and grid if it changed. */
  showLayer(y: number): void;
  /** Flashes one cell on the current grid, for "show me" on a place note. */
  flashVoxel(voxel: { readonly x: number; readonly y: number; readonly z: number }): void;
  /** Attaches the Open/New/Copy behaviour to the top bar's own buttons. */
  wireTopBar(buttons: StudioEditorTopBarV1): void;
}

export function createStudioEditorPanel(deps: StudioEditorDepsV1): StudioEditorPanelV1 {
  const { harness, supportsEdit, state, showTab, beginPlaceNote } = deps;

  const swatches = element('div', 'swatches');
  const colorInput = element('input');
  colorInput.type = 'color';
  const stack = element('div', 'stack');
  const layerLabel = element('span', 'layer-label');
  const grid = element('div', 'grid');
  const stackHint = element('p', 'hint');
  stackHint.textContent = 'Your model is a stack of floors, tallest first. Pick one to edit below.';
  const modelText = element('textarea', 'model');
  modelText.rows = 5;
  modelText.spellcheck = false;
  const modelStatus = element('p', 'verdict');
  const sizeInput = element('input', 'slider');
  sizeInput.type = 'range';
  sizeInput.min = '2';
  sizeInput.max = '24';
  sizeInput.value = '8';
  const loadButton = element('button');
  loadButton.textContent = 'Open this model';

  function buildSwatches(): void {
    const model = harness.model();
    swatches.replaceChildren();
    model.palette.forEach((color, index) => {
      const swatch = element('button', 'swatch');
      swatch.style.background = index === 0 ? 'transparent' : rgbHex(color);
      swatch.textContent = index === 0 ? '∅' : '';
      swatch.title = index === 0 ? 'Empty (erase)' : `Colour ${String(index)}`;
      swatch.setAttribute('aria-pressed', String(index === state.selectedSlot));
      swatch.addEventListener('click', () => {
        state.selectedSlot = index;
        if (index > 0) colorInput.value = rgbHex(color);
        buildSwatches();
      });
      swatches.appendChild(swatch);
    });
    const add = element('button', 'swatch add');
    add.textContent = '+';
    add.title = 'Add a colour';
    add.addEventListener('click', () => {
      state.selectedSlot = harness.addColor(hexRgb(colorInput.value)).paletteIndex;
    });
    swatches.appendChild(add);
  }

  function updateLayerLabel(): void {
    const model = harness.model();
    const [sx, sy, sz] = model.size;
    let filled = 0;
    for (let x = 0; x < sx; x += 1) {
      for (let z = 0; z < sz; z += 1) {
        if ((model.voxels[voxelIndex(model, x, state.layer, z)] ?? 0) !== 0) filled += 1;
      }
    }
    const ground = state.layer === 0 ? ', the ground' : '';
    layerLabel.textContent =
      `Editing floor ${String(state.layer + 1)} of ${String(sy)}${ground} · `
      + `${String(filled)} of ${String(sx * sz)} squares filled`;
  }

  function buildStack(): void {
    const model = harness.model();
    const [sx, sy, sz] = model.size;
    stack.replaceChildren();
    for (let y = sy - 1; y >= 0; y -= 1) {
      const row = element('button', 'floor');
      row.setAttribute('aria-current', String(y === state.layer));
      const mini = element('div', 'mini');
      mini.style.gridTemplateColumns = `repeat(${String(sx)}, 1fr)`;
      let filled = 0;
      for (let z = sz - 1; z >= 0; z -= 1) {
        for (let x = 0; x < sx; x += 1) {
          const slot = model.voxels[voxelIndex(model, x, y, z)] ?? 0;
          if (slot !== 0) filled += 1;
          const dot = element('i');
          dot.style.background = slot === 0
            ? 'transparent'
            : rgbHex(model.palette[slot] ?? { r: 0, g: 0, b: 0 });
          mini.appendChild(dot);
        }
      }
      const tag = element('span');
      tag.textContent = filled === 0 ? `${String(y + 1)} · empty` : String(y + 1);
      row.append(tag, mini);
      row.addEventListener('click', () => {
        state.layer = y;
        buildStack();
        updateLayerLabel();
        buildGrid();
      });
      stack.appendChild(row);
    }
  }

  function buildGrid(): void {
    const model = harness.model();
    const [sx, , sz] = model.size;
    grid.replaceChildren();
    grid.style.gridTemplateColumns = `repeat(${String(sx)}, 1fr)`;
    for (let z = sz - 1; z >= 0; z -= 1) {
      for (let x = 0; x < sx; x += 1) {
        const slot = model.voxels[voxelIndex(model, x, state.layer, z)] ?? 0;
        const cell = element('button', 'cell');
        cell.style.background = slot === 0 ? 'transparent' : rgbHex(
          model.palette[slot] ?? { r: 0, g: 0, b: 0 },
        );
        cell.title = slot === 0
          ? `Empty · floor ${String(state.layer + 1)}`
          : `Colour ${String(slot)} · floor ${String(state.layer + 1)}`;
        cell.addEventListener('click', () => {
          if (state.armedForPlace) {
            beginPlaceNote(x, state.layer, z);
            return;
          }
          harness.paint(x, state.layer, z, state.selectedSlot);
        });
        grid.appendChild(cell);
      }
    }
  }

  function syncColorInput(): void {
    if (state.selectedSlot > 0) {
      const model = harness.model();
      colorInput.value = rgbHex(model.palette[state.selectedSlot] ?? { r: 0, g: 0, b: 0 });
    }
  }

  function rebuild(): void {
    if (state.layer > harness.model().size[1] - 1) state.layer = 0;
    syncColorInput();
    buildSwatches();
    buildStack();
    updateLayerLabel();
    buildGrid();
  }

  function showLayer(y: number): void {
    if (state.layer !== y) {
      state.layer = y;
      buildStack();
      updateLayerLabel();
      buildGrid();
    }
  }

  function flashVoxel(voxel: { readonly x: number; readonly y: number; readonly z: number }): void {
    const [sx, , sz] = harness.model().size;
    const index = (sz - 1 - voxel.z) * sx + voxel.x;
    const cell = grid.children.item(index);
    if (cell instanceof HTMLElement) {
      cell.classList.add('flash');
      window.setTimeout(() => { cell.classList.remove('flash'); }, 1600);
      cell.scrollIntoView({ block: 'nearest' });
    }
  }

  colorInput.addEventListener('input', () => {
    if (state.selectedSlot > 0) harness.recolor(state.selectedSlot, hexRgb(colorInput.value));
  });
  loadButton.addEventListener('click', () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(modelText.value);
    } catch (error) {
      modelStatus.dataset.tone = 'bad';
      modelStatus.textContent = `That is not JSON: ${String(error)}`;
      return;
    }
    const issues = harness.validate(parsed);
    if (issues.length > 0) {
      modelStatus.dataset.tone = 'bad';
      modelStatus.textContent = issues.map((i) => `${i.path} ${i.message}`).join(' · ');
      return;
    }
    harness.load(parsed as StudioModelV1);
    modelStatus.dataset.tone = 'ok';
    modelStatus.textContent = `Opened ${harness.model().label}.`;
  });

  function wireTopBar({ openButton, newButton, copyButton }: StudioEditorTopBarV1): void {
    openButton.addEventListener('click', () => {
      if (!supportsEdit) return;
      showTab('edit');
      modelText.focus();
      modelStatus.dataset.tone = 'idle';
      modelStatus.textContent = 'Paste a model file below, then press "Open this model".';
    });
    copyButton.addEventListener('click', () => {
      if (!supportsEdit) return;
      showTab('edit');
      modelText.value = JSON.stringify(harness.model(), null, 2);
      modelText.select();
      modelStatus.dataset.tone = 'idle';
      modelStatus.textContent = 'The model is in the box, ready to copy or edit.';
    });
    newButton.addEventListener('click', () => {
      if (!supportsEdit) return;
      const size = Number(sizeInput.value);
      harness.load({
        schemaVersion: 'studio.voxel-model/1',
        id: `studio:new-${String(size)}`,
        label: `New ${String(size)} cube`,
        seed: 1,
        size: [size, size, size],
        palette: [{ r: 0, g: 0, b: 0 }, { r: 150, g: 160, b: 175 }],
        voxels: new Array<number>(size * size * size).fill(0),
        motion: {
          periodMs: 0,
          phaseRadians: 0,
          translation: [0, 0, 0],
          rotationRadians: [0, 0, 0],
          scale: [0, 0, 0],
        },
      });
      showTab('edit');
      modelStatus.dataset.tone = 'idle';
      modelStatus.textContent = 'Empty model. Paint a floor to begin.';
    });
  }

  const pane = element('div', 'pane');
  const modelButtons = element('div', 'row');
  modelButtons.append(loadButton);
  pane.append(
    swatches,
    labelled('Colour', colorInput, 'Recolours every voxel using this swatch.'),
    stackHint, stack, layerLabel, grid,
    labelled('New model size', sizeInput, 'Used by the New button in the top bar.'),
    modelButtons, modelText, modelStatus,
  );

  return { pane, rebuild, showLayer, flashVoxel, wireTopBar };
}
