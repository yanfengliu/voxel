import { createStarterGenome, createStudioHarness, type VoxelStudioHarnessV1 } from './harness.js';
import type { VoxelGenomeV1 } from './genome.js';
import { voxelIndex } from './genome.js';
import { StudioSession } from './session.js';

/**
 * Mounts the studio. Every control here calls the harness rather than reaching
 * into the session, so anything a person can do, the agent can do and check.
 * A control with no harness equivalent would be a claim about the model that
 * only a human could verify, which is the thing this studio exists to remove.
 */

declare global {
  interface Window {
    voxelStudio?: VoxelStudioHarnessV1;
  }
}

const VIEW_WIDTH = 480;
const VIEW_HEIGHT = 360;
const SWEEP_SAMPLES = 24;

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function labelled(text: string, control: HTMLElement): HTMLLabelElement {
  const label = element('label', 'field');
  const span = element('span');
  span.textContent = text;
  label.append(span, control);
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

function mount(): void {
  const root = document.getElementById('studio');
  if (!root) throw new Error('The studio needs a #studio host element.');

  const canvas = element('canvas');
  canvas.width = VIEW_WIDTH;
  canvas.height = VIEW_HEIGHT;
  const stage = element('div', 'stage');
  stage.appendChild(canvas);

  let session = new StudioSession(createStarterGenome(), {
    canvas,
    width: VIEW_WIDTH,
    height: VIEW_HEIGHT,
    zoom: 1,
  });
  let selectedSlot = 1;
  let layer = 0;
  let times: number[] = [];

  const readout = element('pre', 'readout');
  const verdict = element('p', 'verdict');
  const grid = element('div', 'grid');
  const swatches = element('div', 'swatches');
  const colorInput = element('input');
  colorInput.type = 'color';
  // Seeded from the slot that is actually selected, or the picker claims the
  // model is black while a green swatch shows as chosen.
  colorInput.value = rgbHex(session.genome.palette[selectedSlot] ?? { r: 0, g: 0, b: 0 });
  const layerInput = element('input', 'slider');
  layerInput.type = 'range';
  layerInput.min = '0';
  const scrub = element('input', 'slider');
  scrub.type = 'range';
  scrub.min = '0';
  scrub.step = '1';
  scrub.value = '0';
  const periodInput = element('input', 'slider');
  periodInput.type = 'range';
  periodInput.min = '0';
  periodInput.max = '3000';
  periodInput.step = '100';
  const spinInput = element('input', 'slider');
  spinInput.type = 'range';
  spinInput.min = '0';
  spinInput.max = '180';
  const riseInput = element('input', 'slider');
  riseInput.type = 'range';
  riseInput.min = '0';
  riseInput.max = '30';

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
  });
  window.voxelStudio = harness;

  function drawFrame(): void {
    const nowMs = times[Number(scrub.value)] ?? 0;
    session.sampleAt(nowMs);
    const described = session.describe();
    readout.textContent = [
      `time      ${String(nowMs)} ms of ${String(described.periodMs)}`,
      `model     ${described.label}`,
      `size      ${described.size.join(' x ')}`,
      `voxels    ${String(described.filledVoxels)} filled`,
      `palette   ${String(described.paletteEntries)} entries`,
      `revision  ${String(described.revision)}`,
      `state     ${described.state}`,
    ].join('\n');
  }

  function buildSwatches(): void {
    const genome = harness.genome();
    swatches.replaceChildren();
    genome.palette.forEach((color, index) => {
      const swatch = element('button', 'swatch');
      // Slot 0 is the grid's empty marker: selecting it is how you erase, so
      // it belongs in the palette rather than behind a separate mode.
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

  function buildGrid(): void {
    const genome = harness.genome();
    const [sx, , sz] = genome.size;
    grid.replaceChildren();
    grid.style.gridTemplateColumns = `repeat(${String(sx)}, 1fr)`;
    // One horizontal slice at a time. A 3D model edited through a flat grid is
    // the oldest voxel-editor idea there is, and it needs no raycast to be
    // exact about which cell you meant.
    for (let z = sz - 1; z >= 0; z -= 1) {
      for (let x = 0; x < sx; x += 1) {
        const slot = genome.voxels[voxelIndex(genome, x, layer, z)] ?? 0;
        const cell = element('button', 'cell');
        cell.style.background = slot === 0 ? 'transparent' : rgbHex(
          genome.palette[slot] ?? { r: 0, g: 0, b: 0 },
        );
        cell.title = `${String(x)}, ${String(layer)}, ${String(z)}`;
        cell.addEventListener('click', () => {
          // Painting the selected slot, including the empty one, so erasing is
          // the same gesture rather than a mode.
          harness.paint(x, layer, z, selectedSlot);
        });
        grid.appendChild(cell);
      }
    }
  }

  function refresh(): void {
    const genome = harness.genome();
    const period = genome.motion.periodMs;
    times = period > 0
      ? Array.from({ length: SWEEP_SAMPLES }, (_, i) => Math.round((i * period) / SWEEP_SAMPLES))
      : [0];
    scrub.max = String(times.length - 1);
    if (Number(scrub.value) > times.length - 1) scrub.value = '0';
    if (selectedSlot > 0) {
      colorInput.value = rgbHex(genome.palette[selectedSlot] ?? { r: 0, g: 0, b: 0 });
    }
    layerInput.max = String(genome.size[1] - 1);
    if (Number(layerInput.value) !== layer) layerInput.value = String(layer);
    periodInput.value = String(period);
    spinInput.value = String(Math.round((genome.motion.rotationRadians[1] * 180) / Math.PI));
    riseInput.value = String(Math.round(genome.motion.translation[1] * 10));
    buildSwatches();
    buildGrid();
    drawFrame();
    verdict.dataset.tone = 'idle';
    verdict.textContent = 'Sweep to judge this animation.';
  }

  const sweepButton = element('button', 'primary');
  sweepButton.textContent = 'Sweep and judge';
  sweepButton.addEventListener('click', () => {
    const summary = harness.sweep({ samplesPerPeriod: SWEEP_SAMPLES });
    verdict.dataset.tone = summary.ok ? 'ok' : 'bad';
    verdict.textContent = summary.ok
      ? `Sound. ${String(summary.frameCount)} frames, ${String(summary.distinctFrames)} distinct, `
        + `${String(summary.mirroredFrames)} mirrored across the half period.`
      : summary.issues.map((issue) => issue.message).join(' ');
    drawFrame();
  });

  colorInput.addEventListener('input', () => {
    if (selectedSlot > 0) harness.recolor(selectedSlot, hexRgb(colorInput.value));
  });
  layerInput.addEventListener('input', () => {
    layer = Number(layerInput.value);
    buildGrid();
  });
  scrub.addEventListener('input', drawFrame);
  periodInput.addEventListener('input', () => {
    harness.animate({ periodMs: Number(periodInput.value) });
  });
  spinInput.addEventListener('input', () => {
    harness.animate({
      rotationRadians: [0, (Number(spinInput.value) * Math.PI) / 180, 0],
    });
  });
  riseInput.addEventListener('input', () => {
    harness.animate({ translation: [0, Number(riseInput.value) / 10, 0] });
  });

  const editor = element('div', 'card');
  const editorTitle = element('h2');
  editorTitle.textContent = 'Model';
  editor.append(editorTitle, swatches, labelled('Colour', colorInput),
    labelled('Layer (y)', layerInput), grid);

  const motion = element('div', 'card');
  const motionTitle = element('h2');
  motionTitle.textContent = 'Motion';
  motion.append(motionTitle, labelled('Period (ms)', periodInput),
    labelled('Spin (deg)', spinInput), labelled('Rise (voxels x10)', riseInput));

  const inspect = element('div', 'card');
  const inspectTitle = element('h2');
  inspectTitle.textContent = 'Frame';
  inspect.append(inspectTitle, labelled('Time', scrub), sweepButton, verdict, readout);

  const columns = element('div', 'columns');
  columns.append(editor, motion, inspect);
  root.append(stage, columns);
  refresh();
}

mount();
