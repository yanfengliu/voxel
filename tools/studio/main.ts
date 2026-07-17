import { createStarterGenome, createStudioHarness, type VoxelStudioHarnessV1 } from './harness.js';
import type { VoxelGenomeV1 } from './genome.js';
import { voxelIndex } from './genome.js';
import { describeMotion, describePoseAt } from './describe.js';
import { NoteStore, type StudioNoteV1 } from './notes.js';
import { StudioPlayer } from './player.js';
import { StudioSession } from './session.js';

/**
 * The studio, player first. Its resting state is watching: a big picture with
 * play, pause, speed, and a timeline under it. Notes pin the owner's words to
 * a moment or a place; a request bundles words, notes, and the model into a
 * file an agent picks up. Editing lives in a panel that opens when wanted.
 *
 * Every control calls the harness rather than reaching into the session, so
 * anything a person can do here, the agent can do and check. A control with no
 * harness equivalent would be a claim about the model only a human could
 * verify, which is the thing this studio exists to remove.
 */

declare global {
  interface Window {
    voxelStudio?: VoxelStudioHarnessV1;
  }
}

const VIEW_WIDTH = 560;
const VIEW_HEIGHT = 400;
const SWEEP_SAMPLES = 24;

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

function mount(): void {
  const root = document.getElementById('studio');
  if (!root) throw new Error('The studio needs a #studio host element.');

  // ---- the picture ----
  const canvas = element('canvas');
  canvas.width = VIEW_WIDTH;
  canvas.height = VIEW_HEIGHT;
  const marks = element('div', 'marks');
  const canvasWrap = element('div', 'canvas-wrap');
  canvasWrap.append(canvas, marks);
  const stage = element('div', 'stage');
  stage.appendChild(canvasWrap);

  let session = new StudioSession(createStarterGenome(), {
    canvas,
    width: VIEW_WIDTH,
    height: VIEW_HEIGHT,
    zoom: 1,
  });
  const player = new StudioPlayer(session.genome.motion.periodMs);
  const noteStore = new NoteStore();
  let selectedSlot = 1;
  let layer = 0;
  let pending: PendingAnchor | null = null;
  let armedForPlace = false;
  let lastShownMs = 0;

  // ---- player bar ----
  const playButton = element('button', 'primary play');
  playButton.textContent = '▶ Play';
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

  const motionText = element('p', 'motion');
  const modelLine = element('p', 'hint');
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

  // ---- notes and requests ----
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

  // ---- editing panel (existing editors, out of the way while judging) ----
  const swatches = element('div', 'swatches');
  const colorInput = element('input');
  colorInput.type = 'color';
  const stack = element('div', 'stack');
  const layerLabel = element('span', 'layer-label');
  const grid = element('div', 'grid');
  const stackHint = element('p', 'hint');
  stackHint.textContent = 'Your model is a stack of floors, shown top to bottom. Pick one to edit below.';

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
    { kind: 'rotationRadians', axis: 0, label: 'Pitch', unit: '°', max: 180, scale: Math.PI / 180 },
    { kind: 'rotationRadians', axis: 1, label: 'Rock', unit: '°', max: 180, scale: Math.PI / 180 },
    { kind: 'rotationRadians', axis: 2, label: 'Roll', unit: '°', max: 180, scale: Math.PI / 180 },
    { kind: 'translation', axis: 0, label: 'Slide x', unit: 'levels', max: 40, scale: 0.1 },
    { kind: 'translation', axis: 1, label: 'Bob', unit: 'levels', max: 40, scale: 0.1 },
    { kind: 'translation', axis: 2, label: 'Slide z', unit: 'levels', max: 40, scale: 0.1 },
    { kind: 'scale', axis: 0, label: 'Stretch x', unit: '%', max: 100, scale: 0.01 },
    { kind: 'scale', axis: 1, label: 'Stretch y', unit: '%', max: 100, scale: 0.01 },
    { kind: 'scale', axis: 2, label: 'Stretch z', unit: '%', max: 100, scale: 0.01 },
  ] as const;

  const amplitudeInputs = AMPLITUDES.map((spec) => {
    const input = element('input', 'slider');
    input.type = 'range';
    input.min = String(-spec.max);
    input.max = String(spec.max);
    input.addEventListener('input', () => {
      const motion = harness.genome().motion;
      const next: [number, number, number] = [...motion[spec.kind]];
      next[spec.axis] = Number(input.value) * spec.scale;
      harness.animate({ [spec.kind]: next });
    });
    return { spec, input };
  });

  const genomeText = element('textarea', 'genome');
  genomeText.rows = 6;
  genomeText.spellcheck = false;
  const genomeStatus = element('p', 'verdict');
  const sizeInput = element('input', 'slider');
  sizeInput.type = 'range';
  sizeInput.min = '2';
  sizeInput.max = '24';
  sizeInput.value = '8';

  // ---- the harness: the one surface both the buttons and the agent use ----
  const harness = createStudioHarness({
    session: () => session,
    replace(genome: VoxelGenomeV1) {
      session.dispose();
      session = new StudioSession(genome, {
        canvas, width: VIEW_WIDTH, height: VIEW_HEIGHT, zoom: 1,
      });
      refresh();
    },
    update(genome: VoxelGenomeV1) {
      session.setGenome(genome);
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
  });
  window.voxelStudio = harness;

  // ---- drawing and readouts ----
  function drawFrame(timeMs: number): void {
    lastShownMs = timeMs;
    session.showAt(timeMs);
    const period = player.periodMs;
    timeLabel.textContent = period > 0
      ? `${String(Math.round(timeMs))} ms of ${String(period)} · ${describePoseAt(harness.genome().motion, timeMs)}`
      : 'still';
    if (document.activeElement !== timeline) timeline.value = String(Math.round(timeMs));
    positionRings();
  }

  function syncPlayButton(): void {
    playButton.textContent = player.playing ? '⏸ Pause' : '▶ Play';
  }

  /** Rings on the picture: the pending anchor, plus saved notes near this moment. */
  function positionRings(): void {
    marks.replaceChildren();
    const nearMs = 40;
    for (const note of noteStore.list()) {
      if (note.kind !== 'moment') continue;
      if (Math.abs(note.timeMs - lastShownMs) > nearMs) continue;
      marks.appendChild(ringAt(note.spot.u, note.spot.v, false));
    }
    if (pending?.kind === 'moment') {
      marks.appendChild(ringAt(pending.u, pending.v, true));
    }
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
    editPanel.open = true;
    if (layer !== note.voxel.y) {
      layer = note.voxel.y;
      buildStack();
      updateLayerLabel();
      buildGrid();
    }
    const [sx, , sz] = harness.genome().size;
    const index = (sz - 1 - note.voxel.z) * sx + note.voxel.x;
    const cell = grid.children.item(index);
    if (cell instanceof HTMLElement) {
      cell.classList.add('flash');
      window.setTimeout(() => { cell.classList.remove('flash'); }, 1600);
      cell.scrollIntoView({ block: 'nearest' });
    }
  }

  function openNoteEditor(hint: string): void {
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

  // ---- swatches, floors, grid (the editors, unchanged in spirit) ----
  function buildSwatches(): void {
    const genome = harness.genome();
    swatches.replaceChildren();
    genome.palette.forEach((color, index) => {
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
    const genome = harness.genome();
    const [sx, sy, sz] = genome.size;
    let filled = 0;
    for (let x = 0; x < sx; x += 1) {
      for (let z = 0; z < sz; z += 1) {
        if ((genome.voxels[voxelIndex(genome, x, layer, z)] ?? 0) !== 0) filled += 1;
      }
    }
    const ground = layer === 0 ? ', the ground' : '';
    layerLabel.textContent =
      `Editing floor ${String(layer + 1)} of ${String(sy)}${ground} · `
      + `${String(filled)} of ${String(sx * sz)} squares filled`;
  }

  function buildStack(): void {
    const genome = harness.genome();
    const [sx, sy, sz] = genome.size;
    stack.replaceChildren();
    for (let y = sy - 1; y >= 0; y -= 1) {
      const row = element('button', 'floor');
      row.setAttribute('aria-current', String(y === layer));
      const mini = element('div', 'mini');
      mini.style.gridTemplateColumns = `repeat(${String(sx)}, 1fr)`;
      let filled = 0;
      for (let z = sz - 1; z >= 0; z -= 1) {
        for (let x = 0; x < sx; x += 1) {
          const slot = genome.voxels[voxelIndex(genome, x, y, z)] ?? 0;
          if (slot !== 0) filled += 1;
          const dot = element('i');
          dot.style.background = slot === 0
            ? 'transparent'
            : rgbHex(genome.palette[slot] ?? { r: 0, g: 0, b: 0 });
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
    const genome = harness.genome();
    const [sx, , sz] = genome.size;
    grid.replaceChildren();
    grid.style.gridTemplateColumns = `repeat(${String(sx)}, 1fr)`;
    for (let z = sz - 1; z >= 0; z -= 1) {
      for (let x = 0; x < sx; x += 1) {
        const slot = genome.voxels[voxelIndex(genome, x, layer, z)] ?? 0;
        const cell = element('button', 'cell');
        cell.style.background = slot === 0 ? 'transparent' : rgbHex(
          genome.palette[slot] ?? { r: 0, g: 0, b: 0 },
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

  // ---- refresh: one place where the page catches up with the model ----
  function refresh(): void {
    const genome = harness.genome();
    const described = harness.describe();
    player.setPeriod(genome.motion.periodMs, performance.now());
    syncPlayButton();
    const period = player.periodMs;
    playButton.disabled = period <= 0;
    timeline.disabled = period <= 0;
    timeline.max = String(Math.max(period - 1, 0));
    motionText.textContent = describeMotion(genome.motion);
    modelLine.textContent =
      `${described.label} · ${described.size.join('×')} · `
      + `${String(described.filledVoxels)} cubes · ${String(described.paletteEntries - 1)} colours`;
    engineWarning.hidden = described.state === 'running';
    engineWarning.dataset.tone = 'bad';
    engineWarning.textContent = `Something is wrong underneath: the engine reports "${described.state}".`;
    if (selectedSlot > 0) {
      colorInput.value = rgbHex(genome.palette[selectedSlot] ?? { r: 0, g: 0, b: 0 });
    }
    if (layer > genome.size[1] - 1) layer = 0;
    periodInput.value = String(genome.motion.periodMs);
    phaseInput.value = String(Math.round((genome.motion.phaseRadians * 180) / Math.PI));
    for (const { spec, input } of amplitudeInputs) {
      input.value = String(Math.round(genome.motion[spec.kind][spec.axis] / spec.scale));
    }
    buildSwatches();
    buildStack();
    updateLayerLabel();
    buildGrid();
    renderDots();
    // The old sheet describes the model before this change.
    sheetImage.hidden = true;
    verdict.dataset.tone = 'idle';
    verdict.textContent = '';
    drawFrame(Math.min(lastShownMs, Math.max(period - 1, 0)));
  }

  // ---- wiring ----
  playButton.addEventListener('click', () => {
    if (player.playing) harness.pause(); else harness.play();
    syncPlayButton();
  });
  speedSelect.addEventListener('change', () => {
    harness.setSpeed(Number(speedSelect.value));
  });
  timeline.addEventListener('input', () => {
    harness.seek(Number(timeline.value));
  });

  canvas.addEventListener('click', (event) => {
    // Clicking the picture is pointing at something seen; freeze that moment.
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

  pinPlaceButton.addEventListener('click', () => {
    armedForPlace = !armedForPlace;
    pinPlaceButton.classList.toggle('armed', armedForPlace);
    if (armedForPlace) {
      editPanel.open = true;
      noteHint.hidden = false;
      noteHint.textContent = 'Now click a floor square in the editing panel below.';
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

  // ---- model open/copy/new ----
  const loadButton = element('button');
  loadButton.textContent = 'Open this model';
  loadButton.addEventListener('click', () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(genomeText.value);
    } catch (error) {
      genomeStatus.dataset.tone = 'bad';
      genomeStatus.textContent = `That is not JSON: ${String(error)}`;
      return;
    }
    const issues = harness.validate(parsed);
    if (issues.length > 0) {
      genomeStatus.dataset.tone = 'bad';
      genomeStatus.textContent = issues.map((i) => `${i.path} ${i.message}`).join(' · ');
      return;
    }
    harness.load(parsed as VoxelGenomeV1);
    genomeStatus.dataset.tone = 'ok';
    genomeStatus.textContent = `Opened ${harness.genome().label}.`;
  });
  const copyButton = element('button');
  copyButton.textContent = 'Copy this model';
  copyButton.addEventListener('click', () => {
    genomeText.value = JSON.stringify(harness.genome(), null, 2);
    genomeText.select();
    genomeStatus.dataset.tone = 'idle';
    genomeStatus.textContent = 'The model is in the box, ready to copy or edit.';
  });
  const newButton = element('button');
  newButton.textContent = 'New empty model';
  newButton.addEventListener('click', () => {
    const size = Number(sizeInput.value);
    harness.load({
      schemaVersion: 'maker.voxel-genome/1',
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
    genomeStatus.dataset.tone = 'idle';
    genomeStatus.textContent = 'Empty model. Paint a floor to begin.';
  });
  const starterButton = element('button');
  starterButton.textContent = 'Starter';
  starterButton.addEventListener('click', () => { harness.load(createStarterGenome()); });

  periodInput.addEventListener('input', () => {
    harness.animate({ periodMs: Number(periodInput.value) });
  });
  phaseInput.addEventListener('input', () => {
    harness.animate({ phaseRadians: (Number(phaseInput.value) * Math.PI) / 180 });
  });
  colorInput.addEventListener('input', () => {
    if (selectedSlot > 0) harness.recolor(selectedSlot, hexRgb(colorInput.value));
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && (pending || armedForPlace)) closeNoteEditor();
  });

  // ---- assembly ----
  const playerBar = element('div', 'playerbar');
  playerBar.append(playButton, speedSelect, timelineWrap, timeLabel);
  const checkRow = element('div', 'row');
  checkRow.append(sweepButton, sheetButton);
  const playerCard = element('div', 'card');
  playerCard.append(playerBar, motionText, modelLine, engineWarning, checkRow, verdict);

  const notesCard = element('div', 'card');
  const notesTitle = element('h2');
  notesTitle.textContent = 'Notes & requests';
  notesCard.append(notesTitle, noteHint, noteEditor, notesList, pinPlaceButton,
    requestBox, sendButton, requestStatus);

  const editPanel = element('details', 'card edit');
  const editSummary = element('summary');
  editSummary.textContent = 'Edit the model';
  const editBody = element('div', 'edit-body');
  const modelButtons = element('div', 'row');
  modelButtons.append(starterButton, newButton, copyButton, loadButton);
  const motionFields = element('div', 'motion-fields');
  motionFields.append(
    labelled('Period', periodInput, 'How long one full round trip takes. Zero is still.'),
    labelled('Phase', phaseInput, 'Where in the cycle time zero starts.'),
  );
  for (const { spec, input } of amplitudeInputs) {
    motionFields.append(labelled(`${spec.label} (${spec.unit})`, input));
  }
  editBody.append(
    swatches,
    labelled('Colour', colorInput, 'Recolours every voxel using this swatch.'),
    stackHint,
    stack,
    layerLabel,
    grid,
    motionFields,
    labelled('New model size', sizeInput, 'Cubes, for now. Any size a genome declares will open.'),
    modelButtons,
    genomeText,
    genomeStatus,
  );
  editPanel.append(editSummary, editBody);

  const columns = element('div', 'columns');
  columns.append(notesCard, editPanel);
  root.append(stage, playerCard, columns, sheetImage);

  // ---- the loop: while playing, follow the clock ----
  function tick(): void {
    if (player.playing) drawFrame(player.timeAt(performance.now()));
    requestAnimationFrame(tick);
  }

  renderNotes();
  refresh();
  requestAnimationFrame(tick);
}

mount();
