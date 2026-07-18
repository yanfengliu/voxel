import { OrthographicCamera, PerspectiveCamera } from 'three';

import type { StudioCatalogV1 } from './catalog.js';
import { createConstructionPanel } from './construction.js';
import { describeMotion, describePoseAt } from './describe.js';
import { createStudioHarness, type VoxelStudioHarnessV1 } from './harness.js';
import { createEmptyModel } from './edit.js';
import type { StudioModelV1 } from './model.js';
import { voxelIndex } from './model.js';
import { NoteStore, type StudioNoteV1 } from './notes.js';
import {
  applyOrbit,
  clampOrbit,
  DEFAULT_ORBIT,
  describeOrbit,
  dragOrbit,
  zoomOrbit,
  type OrbitStateV1,
} from './orbit.js';
import { StudioPlayer } from './player.js';
import { StudioSession } from './session.js';

/**
 * The studio as an app: shelf on the left, the stage in the middle, one
 * inspector on the right, the player docked underneath. Its resting state is
 * watching; drag the picture to walk around the model.
 *
 * Every control calls the harness rather than reaching into the session, so
 * anything a person can do here, the agent can do and check. A control with no
 * harness equivalent would be a claim about the model only a human could
 * verify, which is the thing this studio exists to remove.
 *
 * This module is the game-neutral half. It knows that a shelf has sections and
 * that sections contain models; it never knows what a model *is* to the game
 * that made it. Every game mounts this with its own catalog -- see
 * `docs/guides/model-studio.md` -- and the engine's own shelf in `main.ts` is
 * simply the first caller, with no privileges the games lack.
 */

declare global {
  interface Window {
    voxelStudio?: VoxelStudioHarnessV1;
  }
}

export interface StudioMountOptionsV1 {
  /**
   * The shelf: which models this studio offers, in the sections the game
   * names and orders. The studio only knows that sections contain models.
   */
  readonly catalog: StudioCatalogV1;
  /**
   * Where to mount. Defaults to `#studio`, which is what the shipped page
   * provides; a game embedding the studio in its own page passes its element.
   */
  readonly root?: HTMLElement;
  /**
   * Which model to open first. Defaults to the first model on the shelf, so
   * a studio never opens on an empty stage.
   */
  readonly openModelId?: string;
  /**
   * Publishes the harness on `window.voxelStudio` so an agent driving the
   * real page can reach it. Defaults to true; a game mounting two studios in
   * one page turns it off for the second.
   */
  readonly publishHarness?: boolean;
}

export interface StudioHandleV1 {
  /** Everything the buttons can do, for an agent or a test to do instead. */
  readonly harness: VoxelStudioHarnessV1;
  /** Releases the GPU runtime, listeners, and frame loop. Idempotent. */
  dispose(): void;
}

/** The first model on the shelf, or an empty one when a shelf is empty. */
function openingModel(
  catalog: StudioCatalogV1,
  openModelId: string | undefined,
): StudioModelV1 {
  for (const section of catalog.sections) {
    for (const entry of section.models) {
      if (openModelId === undefined || entry.id === openModelId) return entry.load();
    }
  }
  if (openModelId !== undefined) {
    throw new Error(`No model on the shelf is called ${openModelId}.`);
  }
  // An empty shelf is a legitimate starting point for a game that has not
  // authored anything yet, so it opens on an empty model rather than refusing.
  return createEmptyModel({ id: 'studio:empty', label: 'Empty', size: [8, 8, 8] });
}

const VIEW_WIDTH = 640;
const VIEW_HEIGHT = 440;
// Replaced by the stage's real size once mounted; these only seed the first frame.
const SWEEP_SAMPLES = 24;
const DRAG_THRESHOLD_PIXELS = 4;

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function labelled(text: string, control: HTMLElement, hint?: string): HTMLLabelElement {
  const label = element('label', 'field');
  const span = element('span');
  span.textContent = text;
  label.append(span, control);
  if (hint) {
    const note = element('small', 'hint');
    note.textContent = hint;
    label.append(note);
  }
  return label;
}

function rgbHex(color: { r: number; g: number; b: number }): string {
  const hex = (value: number) => value.toString(16).padStart(2, '0');
  return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`;
}

function hexRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

type PendingAnchor =
  | { readonly kind: 'moment'; readonly timeMs: number; readonly u: number; readonly v: number }
  | { readonly kind: 'place'; readonly x: number; readonly y: number; readonly z: number };

export function mountStudio(options: StudioMountOptionsV1): StudioHandleV1 {
  const root = options.root ?? document.getElementById('studio');
  if (!root) throw new Error('The studio needs a #studio host element.');
  const catalog = options.catalog;

  // ---- stage ----
  const canvas = element('canvas');
  canvas.width = VIEW_WIDTH;
  canvas.height = VIEW_HEIGHT;
  const marks = element('div', 'marks');
  const canvasWrap = element('div', 'canvas-wrap');
  canvasWrap.append(canvas, marks);
  const viewChip = element('span', 'viewchip');
  viewChip.title = "Sides are the model's own, like a person facing you: "
    + 'their left appears on your right.';
  const stageHint = element('span', 'stagehint');
  stageHint.textContent =
    'drag to turn · scroll to zoom · double-click to re-centre · click to pin a note';
  // Exactly one of the two looks is ever true, so the control is one switch
  // with two sides rather than two buttons that could both look pressed: the
  // knob sits on the side that is on, and clicking slides it to the other.
  const lookSwitch = element('button', 'switch');
  lookSwitch.setAttribute('role', 'switch');
  lookSwitch.title = 'Study edges draw dark lines where surfaces meet; the game look is exactly what players see.';
  const lookThumb = element('span', 'thumb');
  const edgesSide = element('span', 'side');
  edgesSide.textContent = 'study edges';
  const gameSide = element('span', 'side');
  gameSide.textContent = 'game look';
  lookSwitch.append(lookThumb, edgesSide, gameSide);
  const depthToggle = element('button', 'toggle');
  depthToggle.textContent = 'real depth';
  depthToggle.title = 'Nearer really is bigger. The flat view can read backwards — '
    + 'equal sizes at every distance look like they grow away from you.';
  const toggles = element('div', 'toggles');
  toggles.append(lookSwitch, depthToggle);
  const stage = element('div', 'stage');
  stage.append(canvasWrap, viewChip, toggles, stageHint);

  const flatCamera = new OrthographicCamera();
  const depthCamera = new PerspectiveCamera();
  // Real depth is the resting state, per the owner: the flat view's
  // equal-sizes-everywhere reads backwards at a glance, so the honest eye is
  // the default and flat is the deliberate choice.
  let depthOn = true;
  let camera: OrthographicCamera | PerspectiveCamera = depthCamera;
  let orbit: OrbitStateV1 = DEFAULT_ORBIT;
  let viewW = VIEW_WIDTH;
  let viewH = VIEW_HEIGHT;
  applyOrbit(camera, orbit, viewW, viewH);

  let session = new StudioSession(openingModel(catalog, options.openModelId), {
    canvas, width: viewW, height: viewH, camera,
  });
  const player = new StudioPlayer(session.model.motion.periodMs);
  const noteStore = new NoteStore();
  let selectedSlot = 1;
  let layer = 0;
  let pending: PendingAnchor | null = null;
  let armedForPlace = false;
  let lastShownMs = 0;

  // ---- top bar ----
  const modelName = element('span', 'name');
  const statusChip = element('span', 'status');
  const openButton = element('button');
  openButton.textContent = 'Open…';
  const newButton = element('button');
  newButton.textContent = 'New';
  const copyButton = element('button');
  copyButton.textContent = 'Copy';
  const requestShortcut = element('button', 'primary');
  requestShortcut.textContent = 'Send request';

  // ---- player bar ----
  const stepBack = element('button', 'step');
  stepBack.textContent = '◀';
  stepBack.title = 'One frame back (left arrow)';
  const playButton = element('button', 'primary play');
  playButton.textContent = '▶ Play';
  const stepForward = element('button', 'step');
  stepForward.textContent = '▶';
  stepForward.title = 'One frame forward (right arrow)';
  const speedSelect = element('select', 'speed');
  for (const speed of [0.25, 0.5, 1, 2]) {
    const option = element('option');
    option.value = String(speed);
    option.textContent = `${String(speed)}×`;
    if (speed === 1) option.selected = true;
    speedSelect.appendChild(option);
  }
  const timeline = element('input', 'timeline');
  timeline.type = 'range';
  timeline.min = '0';
  timeline.step = '1';
  timeline.value = '0';
  const dots = element('div', 'dots');
  const timelineWrap = element('div', 'timeline-wrap');
  timelineWrap.append(timeline, dots);
  const timeLabel = element('span', 'time-label');

  // ---- inspector: examine ----
  const motionText = element('p', 'motion');
  const modelLine = element('p', 'factline');
  const engineWarning = element('p', 'verdict');
  engineWarning.hidden = true;
  const sweepButton = element('button');
  sweepButton.textContent = 'Check the movement';
  const sheetButton = element('button');
  sheetButton.textContent = 'All frames';
  const verdict = element('p', 'verdict');
  const sheetImage = element('img', 'sheet');
  sheetImage.alt = 'Every frame of the movement, in time order';
  sheetImage.hidden = true;

  // ---- inspector: notes ----
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
  const requestBox = element('textarea', 'request');
  requestBox.rows = 3;
  requestBox.placeholder = 'What should change? Your notes travel with this.';
  const sendButton = element('button', 'primary');
  sendButton.textContent = 'Send request';
  const requestStatus = element('p', 'verdict');

  // ---- inspector: edit ----
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

  // ---- inspector: motion ----
  const styleSelect = element('select', 'speed');
  for (const [value, label] of [
    ['swing', 'Swings back and forth'],
    ['turn', 'Turns all the way around'],
  ] as const) {
    const option = element('option');
    option.value = value;
    option.textContent = label;
    styleSelect.appendChild(option);
  }
  const periodInput = element('input', 'slider');
  periodInput.type = 'range';
  periodInput.min = '0';
  periodInput.max = '4000';
  periodInput.step = '50';
  const phaseInput = element('input', 'slider');
  phaseInput.type = 'range';
  phaseInput.min = '-180';
  phaseInput.max = '180';

  const AMPLITUDES = [
    { kind: 'rotationRadians', axis: 0, group: 'Turn', label: 'Pitch', unit: '°', max: 180, scale: Math.PI / 180 },
    { kind: 'rotationRadians', axis: 1, group: 'Turn', label: 'Rock', unit: '°', max: 180, scale: Math.PI / 180 },
    { kind: 'rotationRadians', axis: 2, group: 'Turn', label: 'Roll', unit: '°', max: 180, scale: Math.PI / 180 },
    { kind: 'translation', axis: 0, group: 'Slide', label: 'Sideways', unit: 'levels', max: 40, scale: 0.1 },
    { kind: 'translation', axis: 1, group: 'Slide', label: 'Up and down', unit: 'levels', max: 40, scale: 0.1 },
    { kind: 'translation', axis: 2, group: 'Slide', label: 'In and out', unit: 'levels', max: 40, scale: 0.1 },
    { kind: 'scale', axis: 0, group: 'Stretch', label: 'Width', unit: '%', max: 100, scale: 0.01 },
    { kind: 'scale', axis: 1, group: 'Stretch', label: 'Height', unit: '%', max: 100, scale: 0.01 },
    { kind: 'scale', axis: 2, group: 'Stretch', label: 'Depth', unit: '%', max: 100, scale: 0.01 },
  ] as const;

  const amplitudeInputs = AMPLITUDES.map((spec) => {
    const input = element('input', 'slider');
    input.type = 'range';
    input.min = String(-spec.max);
    input.max = String(spec.max);
    input.addEventListener('input', () => {
      const motion = harness.model().motion;
      const next: [number, number, number] = [...motion[spec.kind]];
      next[spec.axis] = Number(input.value) * spec.scale;
      harness.animate({ [spec.kind]: next });
    });
    return { spec, input };
  });

  // ---- the harness: the one surface both the buttons and the agent use ----
  const harness = createStudioHarness({
    session: () => session,
    replace(model: StudioModelV1) {
      session.dispose();
      session = new StudioSession(model, {
        canvas, width: viewW, height: viewH, camera,
      });
      refresh();
    },
    update(model: StudioModelV1) {
      session.setGenome(model);
      refresh();
    },
    player: () => player,
    noteStore: () => noteStore,
    now: () => performance.now(),
    drawAt: (timeMs: number) => { drawFrame(timeMs); },
    notesChanged() {
      renderNotes();
      renderDots();
    },
    orbit: () => ({ ...orbit, described: describeOrbit(orbit) }),
    resizeStage,
    depth: () => depthOn,
    setDepth,
    setOrbit(view) {
      orbit = clampOrbit({ ...orbit, ...view });
      applyOrbit(camera, orbit, viewW, viewH);
      viewChip.textContent = describeOrbit(orbit);
      drawFrame(lastShownMs);
      return { ...orbit, described: describeOrbit(orbit) };
    },
    catalog: () => catalog,
  });
  if (options.publishHarness !== false) window.voxelStudio = harness;

  // ---- drawing and readouts ----
  function drawFrame(timeMs: number): void {
    lastShownMs = timeMs;
    // Reasserted every draw, not only on drag: the engine may touch the shared
    // camera, and the studio's view must win on every frame, not just the ones
    // after an interaction.
    applyOrbit(camera, orbit, viewW, viewH);
    session.showAt(timeMs);
    const period = player.periodMs;
    if (period > 0) {
      const frame = harness.frameAt();
      timeLabel.textContent =
        `frame ${String(frame.frame)} / ${String(frame.frameCount)} · `
        + `${String(Math.round(timeMs))} ms of ${String(period)} · `
        + describePoseAt(harness.model().motion, timeMs);
    } else {
      timeLabel.textContent = 'still · one frame';
    }
    if (document.activeElement !== timeline) timeline.value = String(Math.round(timeMs));
    positionRings();
  }

  function syncPlayButton(): void {
    playButton.textContent = player.playing ? '⏸ Pause' : '▶ Play';
  }

  function positionRings(): void {
    marks.replaceChildren();
    const nearMs = 40;
    for (const note of noteStore.list()) {
      if (note.kind !== 'moment') continue;
      if (Math.abs(note.timeMs - lastShownMs) > nearMs) continue;
      marks.appendChild(ringAt(note.spot.u, note.spot.v, false));
    }
    if (pending?.kind === 'moment') marks.appendChild(ringAt(pending.u, pending.v, true));
  }

  function ringAt(u: number, v: number, active: boolean): HTMLElement {
    const ring = element('div', active ? 'ring active' : 'ring');
    ring.style.left = `${String(u * 100)}%`;
    ring.style.top = `${String(v * 100)}%`;
    return ring;
  }

  function renderDots(): void {
    dots.replaceChildren();
    const period = player.periodMs;
    if (period <= 0) return;
    for (const note of noteStore.list()) {
      if (note.kind !== 'moment') continue;
      const dot = element('button', 'dot');
      dot.title = `${String(note.timeMs)} ms — ${note.text}`;
      dot.style.left = `${String((note.timeMs / period) * 100)}%`;
      dot.addEventListener('click', () => { harness.seek(note.timeMs); syncPlayButton(); });
      dots.appendChild(dot);
    }
  }

  function describeNoteAnchor(note: StudioNoteV1): string {
    return note.kind === 'moment'
      ? `${String(note.timeMs)} ms`
      : `floor ${String(note.voxel.y + 1)}, square ${String(note.voxel.x)},${String(note.voxel.z)}`;
  }

  function renderNotes(): void {
    notesList.replaceChildren();
    const all = noteStore.list();
    noteHint.hidden = all.length > 0;
    for (const note of all) {
      const item = element('li', 'note-row');
      const where = element('button', 'note-where');
      where.textContent = describeNoteAnchor(note);
      where.title = 'Show me';
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
    showTab('edit');
    if (layer !== note.voxel.y) {
      layer = note.voxel.y;
      buildStack();
      updateLayerLabel();
      buildGrid();
    }
    const [sx, , sz] = harness.model().size;
    const index = (sz - 1 - note.voxel.z) * sx + note.voxel.x;
    const cell = grid.children.item(index);
    if (cell instanceof HTMLElement) {
      cell.classList.add('flash');
      window.setTimeout(() => { cell.classList.remove('flash'); }, 1600);
      cell.scrollIntoView({ block: 'nearest' });
    }
  }

  function openNoteEditor(hint: string): void {
    showTab('notes');
    noteEditor.hidden = false;
    noteHint.hidden = true;
    noteInput.placeholder = hint;
    noteInput.focus();
  }

  function closeNoteEditor(): void {
    pending = null;
    armedForPlace = false;
    pinPlaceButton.classList.remove('armed');
    noteEditor.hidden = true;
    noteInput.value = '';
    positionRings();
    renderNotes();
  }

  // ---- editors ----
  function buildSwatches(): void {
    const model = harness.model();
    swatches.replaceChildren();
    model.palette.forEach((color, index) => {
      const swatch = element('button', 'swatch');
      swatch.style.background = index === 0 ? 'transparent' : rgbHex(color);
      swatch.textContent = index === 0 ? '∅' : '';
      swatch.title = index === 0 ? 'Empty (erase)' : `Colour ${String(index)}`;
      swatch.setAttribute('aria-pressed', String(index === selectedSlot));
      swatch.addEventListener('click', () => {
        selectedSlot = index;
        if (index > 0) colorInput.value = rgbHex(color);
        buildSwatches();
      });
      swatches.appendChild(swatch);
    });
    const add = element('button', 'swatch add');
    add.textContent = '+';
    add.title = 'Add a colour';
    add.addEventListener('click', () => {
      selectedSlot = harness.addColor(hexRgb(colorInput.value)).paletteIndex;
    });
    swatches.appendChild(add);
  }

  function updateLayerLabel(): void {
    const model = harness.model();
    const [sx, sy, sz] = model.size;
    let filled = 0;
    for (let x = 0; x < sx; x += 1) {
      for (let z = 0; z < sz; z += 1) {
        if ((model.voxels[voxelIndex(model, x, layer, z)] ?? 0) !== 0) filled += 1;
      }
    }
    const ground = layer === 0 ? ', the ground' : '';
    layerLabel.textContent =
      `Editing floor ${String(layer + 1)} of ${String(sy)}${ground} · `
      + `${String(filled)} of ${String(sx * sz)} squares filled`;
  }

  function buildStack(): void {
    const model = harness.model();
    const [sx, sy, sz] = model.size;
    stack.replaceChildren();
    for (let y = sy - 1; y >= 0; y -= 1) {
      const row = element('button', 'floor');
      row.setAttribute('aria-current', String(y === layer));
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
        layer = y;
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
        const slot = model.voxels[voxelIndex(model, x, layer, z)] ?? 0;
        const cell = element('button', 'cell');
        cell.style.background = slot === 0 ? 'transparent' : rgbHex(
          model.palette[slot] ?? { r: 0, g: 0, b: 0 },
        );
        cell.title = slot === 0
          ? `Empty · floor ${String(layer + 1)}`
          : `Colour ${String(slot)} · floor ${String(layer + 1)}`;
        cell.addEventListener('click', () => {
          if (armedForPlace) {
            pending = { kind: 'place', x, y: layer, z };
            armedForPlace = false;
            pinPlaceButton.classList.remove('armed');
            openNoteEditor(`Floor ${String(layer + 1)}, square ${String(x)},${String(z)} — say what should change…`);
            return;
          }
          harness.paint(x, layer, z, selectedSlot);
        });
        grid.appendChild(cell);
      }
    }
  }

  // ---- the shelf ----
  const shelf = element('div', 'rail-body');
  const folded = new Set<string>();
  function buildShelf(): void {
    shelf.replaceChildren();
    const currentId = harness.model().id;
    for (const section of harness.shelf()) {
      const head = element('button', 'section-head');
      head.textContent = `${folded.has(section.name) ? '▸' : '▾'} ${section.name}`;
      head.addEventListener('click', () => {
        if (folded.has(section.name)) folded.delete(section.name);
        else folded.add(section.name);
        buildShelf();
      });
      shelf.appendChild(head);
      if (folded.has(section.name)) continue;
      for (const entry of section.models) {
        const row = element('button', 'model-row');
        row.classList.toggle('active', entry.id === currentId);
        const label = element('span');
        label.textContent = entry.label;
        row.appendChild(label);
        row.addEventListener('click', () => { harness.openFromShelf(entry.id); });
        shelf.appendChild(row);
      }
    }
    const note = element('p', 'railnote');
    note.textContent =
      'One studio per game, each with its own shelf. This one belongs to the engine.';
    shelf.appendChild(note);
  }

  // ---- refresh ----
  function refresh(): void {
    const model = harness.model();
    const described = harness.describe();
    // The step list belongs to whichever model is open, so opening another
    // one from the shelf must not leave the previous model's steps sitting
    // there looking current.
    construction.refresh();
    player.setPeriod(model.motion.periodMs, performance.now());
    syncPlayButton();
    const period = player.periodMs;
    playButton.disabled = period <= 0;
    stepBack.disabled = period <= 0;
    stepForward.disabled = period <= 0;
    timeline.disabled = period <= 0;
    timeline.max = String(Math.max(period - 1, 0));
    modelName.textContent = described.label;
    statusChip.textContent = described.state === 'running'
      ? 'drawing normally'
      : `engine reports "${described.state}"`;
    motionText.textContent = describeMotion(model.motion);
    modelLine.textContent =
      `${described.size.join('×')} · ${String(described.filledVoxels)} cubes · `
      + `${String(described.paletteEntries - 1)} colours`;
    engineWarning.hidden = described.state === 'running';
    engineWarning.dataset.tone = 'bad';
    engineWarning.textContent = `Something is wrong underneath: the engine reports "${described.state}".`;
    if (selectedSlot > 0) {
      colorInput.value = rgbHex(model.palette[selectedSlot] ?? { r: 0, g: 0, b: 0 });
    }
    if (layer > model.size[1] - 1) layer = 0;
    styleSelect.value = model.motion.rotationStyle === 'turn' ? 'turn' : 'swing';
    periodInput.value = String(model.motion.periodMs);
    phaseInput.value = String(Math.round((model.motion.phaseRadians * 180) / Math.PI));
    for (const { spec, input } of amplitudeInputs) {
      input.value = String(Math.round(model.motion[spec.kind][spec.axis] / spec.scale));
    }
    lookSwitch.dataset.side = session.edges ? 'left' : 'right';
    lookSwitch.setAttribute('aria-checked', String(session.edges));
    edgesSide.classList.toggle('on', session.edges);
    gameSide.classList.toggle('on', !session.edges);
    depthToggle.classList.toggle('on', depthOn);
    viewChip.textContent = describeOrbit(orbit);
    buildSwatches();
    buildStack();
    updateLayerLabel();
    buildGrid();
    buildShelf();
    renderDots();
    sheetImage.hidden = true;
    verdict.dataset.tone = 'idle';
    verdict.textContent = '';
    drawFrame(Math.min(lastShownMs, Math.max(period - 1, 0)));
  }

  // ---- wiring: player ----
  playButton.addEventListener('click', () => {
    if (player.playing) harness.pause(); else harness.play();
    syncPlayButton();
  });
  stepBack.addEventListener('click', () => { harness.step(-1); syncPlayButton(); });
  stepForward.addEventListener('click', () => { harness.step(1); syncPlayButton(); });
  speedSelect.addEventListener('change', () => { harness.setSpeed(Number(speedSelect.value)); });
  timeline.addEventListener('input', () => { harness.seek(Number(timeline.value)); });

  // ---- wiring: stage (orbit vs pin) ----
  let dragging = false;
  let moved = false;
  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    moved = false;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    if (!moved && Math.hypot(event.clientX - lastX, event.clientY - lastY) < DRAG_THRESHOLD_PIXELS) {
      return;
    }
    moved = true;
    lastX = event.clientX;
    lastY = event.clientY;
    harness.setViewAngles(dragOrbit(orbit, dx, dy));
  });
  canvas.addEventListener('pointerup', (event) => {
    canvas.releasePointerCapture(event.pointerId);
    const wasDrag = moved;
    dragging = false;
    moved = false;
    if (wasDrag) return;
    // A clean click is pointing at something seen; freeze that moment.
    if (player.playing) {
      harness.pause();
      syncPlayButton();
    }
    const rect = canvas.getBoundingClientRect();
    const u = (event.clientX - rect.left) / rect.width;
    const v = (event.clientY - rect.top) / rect.height;
    pending = { kind: 'moment', timeMs: player.timeAt(performance.now()), u, v };
    positionRings();
    openNoteEditor(`Pinned at ${String(Math.round(player.timeAt(performance.now())))} ms — say what you see…`);
  });
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    harness.setViewAngles(zoomOrbit(orbit, Math.sign(event.deltaY)));
  }, { passive: false });
  canvas.addEventListener('dblclick', () => { harness.setViewAngles(DEFAULT_ORBIT); });

  lookSwitch.addEventListener('click', () => {
    harness.setEdges(!session.edges);
    refresh();
  });
  depthToggle.addEventListener('click', () => { setDepth(!depthOn); });

  /**
   * Swapping cameras means rebuilding the drawing session around the other
   * one; the model, notes, playback position, and edges choice all stay.
   */
  function setDepth(on: boolean): boolean {
    if (on === depthOn) return depthOn;
    depthOn = on;
    camera = depthOn ? depthCamera : flatCamera;
    applyOrbit(camera, orbit, viewW, viewH);
    const model = session.model;
    const edges = session.edges;
    session.dispose();
    session = new StudioSession(model, { canvas, width: viewW, height: viewH, camera });
    session.setEdges(edges);
    refresh();
    return depthOn;
  }

  // ---- wiring: notes and requests ----
  pinPlaceButton.addEventListener('click', () => {
    armedForPlace = !armedForPlace;
    pinPlaceButton.classList.toggle('armed', armedForPlace);
    if (armedForPlace) {
      showTab('edit');
      noteHint.hidden = false;
      noteHint.textContent = 'Now click a floor square in the Edit tab.';
    } else {
      noteHint.textContent = 'Pause and click the picture to pin a note to that moment.';
    }
  });
  noteSave.addEventListener('click', () => {
    if (!pending) return;
    const text = noteInput.value;
    try {
      if (pending.kind === 'moment') {
        harness.addMomentNote(pending.timeMs, { u: pending.u, v: pending.v }, text);
      } else {
        harness.addPlaceNote({ x: pending.x, y: pending.y, z: pending.z }, text);
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
  requestShortcut.addEventListener('click', () => {
    showTab('notes');
    requestBox.focus();
  });

  // ---- wiring: examine ----
  sweepButton.addEventListener('click', () => {
    const summary = harness.sweep({ samplesPerPeriod: SWEEP_SAMPLES });
    verdict.dataset.tone = summary.ok ? 'ok' : 'bad';
    verdict.textContent = summary.ok
      ? `The movement is steady: ${String(summary.frameCount)} frames checked, `
        + `${String(summary.distinctFrames)} different poses, and it repeats exactly.`
      : summary.issues.map((issue) => issue.message).join(' ');
    drawFrame(lastShownMs);
  });
  sheetButton.addEventListener('click', () => {
    void (async () => {
      const sheet = await harness.spriteSheet({ samplesPerPeriod: SWEEP_SAMPLES });
      sheetImage.src = sheet.dataUrl;
      sheetImage.hidden = false;
    })();
  });

  // ---- wiring: edit (open/copy/new) ----
  openButton.addEventListener('click', () => {
    showTab('edit');
    modelText.focus();
    modelStatus.dataset.tone = 'idle';
    modelStatus.textContent = 'Paste a model file below, then press "Open this model".';
  });
  const loadButton = element('button');
  loadButton.textContent = 'Open this model';
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
  copyButton.addEventListener('click', () => {
    showTab('edit');
    modelText.value = JSON.stringify(harness.model(), null, 2);
    modelText.select();
    modelStatus.dataset.tone = 'idle';
    modelStatus.textContent = 'The model is in the box, ready to copy or edit.';
  });
  newButton.addEventListener('click', () => {
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

  // ---- wiring: motion ----
  styleSelect.addEventListener('change', () => {
    harness.animate({ rotationStyle: styleSelect.value === 'turn' ? 'turn' : 'swing' });
  });
  periodInput.addEventListener('input', () => { harness.animate({ periodMs: Number(periodInput.value) }); });
  phaseInput.addEventListener('input', () => {
    harness.animate({ phaseRadians: (Number(phaseInput.value) * Math.PI) / 180 });
  });
  colorInput.addEventListener('input', () => {
    if (selectedSlot > 0) harness.recolor(selectedSlot, hexRgb(colorInput.value));
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && (pending || armedForPlace)) closeNoteEditor();
    const typing = event.target instanceof HTMLInputElement
      || event.target instanceof HTMLTextAreaElement;
    if (typing) return;
    if (event.key === 'ArrowLeft') { harness.step(-1); syncPlayButton(); }
    if (event.key === 'ArrowRight') { harness.step(1); syncPlayButton(); }
  });

  // ---- assembly ----
  const topBar = element('div', 'top');
  const grow = element('span', 'grow');
  topBar.append(modelName, statusChip, grow, openButton, newButton, copyButton, requestShortcut);

  const rail = element('div', 'rail');
  const railTitle = element('h2');
  railTitle.textContent = "This studio's shelf";
  rail.append(railTitle, shelf);

  const playerBar = element('div', 'player');
  const transport = element('div', 'transport');
  transport.append(stepBack, playButton, stepForward, speedSelect);
  playerBar.append(transport, timelineWrap, timeLabel);

  // Watching a model get made. Its previews go through the harness, so the
  // agent walks the same construction the panel shows.
  const construction = createConstructionPanel({
    harness,
    onChanged: () => {
      refresh();
      drawFrame(lastShownMs);
    },
  });

  const tabNames = ['examine', 'build', 'edit', 'motion', 'notes'] as const;
  const tabButtons = new Map<string, HTMLElement>();
  const tabPanes = new Map<string, HTMLElement>();
  const tabsRow = element('div', 'tabs');
  for (const name of tabNames) {
    const tab = element('button', 'tab');
    tab.textContent = name.charAt(0).toUpperCase() + name.slice(1);
    tab.addEventListener('click', () => { showTab(name); });
    tabButtons.set(name, tab);
    tabsRow.appendChild(tab);
  }
  function showTab(name: string): void {
    // Leaving the Build tab puts the finished model back, so no other tab can
    // ever be looking at a half-built preview -- editing or sending a request
    // against a partial model would be a silent trap.
    if (name !== 'build') construction.leave();
    for (const [key, tab] of tabButtons) tab.classList.toggle('active', key === name);
    for (const [key, pane] of tabPanes) pane.hidden = key !== name;
    if (name === 'build') construction.refresh();
  }

  const examinePane = element('div', 'pane');
  const checkRow = element('div', 'row');
  checkRow.append(sweepButton, sheetButton);
  examinePane.append(motionText, modelLine, engineWarning, checkRow, verdict, sheetImage);

  const editPane = element('div', 'pane');
  const modelButtons = element('div', 'row');
  modelButtons.append(loadButton);
  editPane.append(
    swatches,
    labelled('Colour', colorInput, 'Recolours every voxel using this swatch.'),
    stackHint, stack, layerLabel, grid,
    labelled('New model size', sizeInput, 'Used by the New button in the top bar.'),
    modelButtons, modelText, modelStatus,
  );

  const motionPane = element('div', 'pane');
  motionPane.append(
    labelled('Movement style', styleSelect,
      'Swinging goes out and comes back; turning goes all the way around, using the Turn amounts as how far.'),
    labelled('Period', periodInput, 'How long one full round trip takes. Zero is still.'),
    labelled('Phase', phaseInput, 'Where in the cycle time zero starts.'),
  );
  let currentGroup = '';
  for (const { spec, input } of amplitudeInputs) {
    if (spec.group !== currentGroup) {
      currentGroup = spec.group;
      const head = element('p', 'grouphead');
      head.textContent = spec.group;
      motionPane.appendChild(head);
    }
    motionPane.append(labelled(`${spec.label} (${spec.unit})`, input));
  }

  const notesPane = element('div', 'pane');
  notesPane.append(noteHint, noteEditor, notesList, pinPlaceButton, requestBox, sendButton, requestStatus);

  const inspector = element('div', 'inspector');
  inspector.append(tabsRow, examinePane, construction.element, editPane, motionPane, notesPane);
  tabPanes.set('examine', examinePane);
  tabPanes.set('build', construction.element);
  tabPanes.set('edit', editPane);
  tabPanes.set('motion', motionPane);
  tabPanes.set('notes', notesPane);

  const app = element('div', 'app');
  app.append(topBar, rail, stage, playerBar, inspector);
  root.appendChild(app);

  // The picture fills the stage and follows the window, so zooming meets the
  // window's edge, never an invisible border in the middle of the screen —
  // which is exactly how the owner found it: "top and bottom clip".
  function resizeStage(width: number, height: number): { width: number; height: number } {
    viewW = Math.max(2, Math.floor(width));
    viewH = Math.max(2, Math.floor(height));
    session.resize(viewW, viewH);
    applyOrbit(camera, orbit, viewW, viewH);
    drawFrame(lastShownMs);
    return { width: canvas.width, height: canvas.height };
  }
  // Followed from the frame loop rather than a ResizeObserver: observers never
  // fire in some embedded browsers (measured — a fresh observer on a laid-out
  // element stayed silent), and a follow that only works in some browsers is
  // not a follow. One rectangle read per frame is cheap; resizing only happens
  // on real drift.
  function followStage(): void {
    const rect = stage.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    if (Math.floor(rect.width) === viewW && Math.floor(rect.height) === viewH) return;
    resizeStage(rect.width, rect.height);
  }

  // Held so disposal can stop the loop. A mount that kept drawing after its
  // host tore it down would keep a disposed runtime alive and throw on the
  // next frame, which is exactly the leak the engine refuses to ship.
  let frameHandle = 0;
  let disposed = false;

  function tick(): void {
    if (disposed) return;
    followStage();
    if (player.playing) drawFrame(player.timeAt(performance.now()));
    frameHandle = requestAnimationFrame(tick);
  }

  showTab('examine');
  renderNotes();
  refresh();
  // Sized once immediately and on every window resize, besides the frame
  // loop: the loop is throttled to nothing in background tabs, and the first
  // paint must be sharp everywhere.
  followStage();
  window.addEventListener('resize', followStage);
  frameHandle = requestAnimationFrame(tick);

  return {
    harness,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frameHandle);
      construction.dispose();
      window.removeEventListener('resize', followStage);
      session.dispose();
      if (options.publishHarness !== false && window.voxelStudio === harness) {
        delete window.voxelStudio;
      }
      root.replaceChildren();
    },
  };
}
