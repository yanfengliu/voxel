import { createStarterGenome, createStudioHarness, type VoxelStudioHarnessV1 } from './harness.js';
import type { VoxelGenomeV1 } from './genome.js';
import { voxelIndex } from './genome.js';
import { describeMotion, describePoseAt } from './describe.js';
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
  const layerLabel = element('span', 'layer-label');
  const scrub = element('input', 'slider');
  scrub.type = 'range';
  scrub.min = '0';
  scrub.step = '1';
  scrub.value = '0';
  const periodInput = element('input', 'slider');
  periodInput.type = 'range';
  periodInput.min = '0';
  periodInput.max = '4000';
  periodInput.step = '50';
  const phaseInput = element('input', 'slider');
  phaseInput.type = 'range';
  phaseInput.min = '-180';
  phaseInput.max = '180';
  const motionText = element('p', 'verdict');

  /**
   * Every amplitude the genome carries, not the two the first version happened
   * to expose. A model that pitches, rolls, slides sideways, or pulses is not
   * an exotic case; it was simply unreachable, and hardcoding y meant the tool
   * knew about one model rather than about models.
   */
  const AMPLITUDES = [
    { kind: 'rotationRadians', axis: 0, label: 'Pitch', unit: '°', max: 180, scale: Math.PI / 180 },
    { kind: 'rotationRadians', axis: 1, label: 'Rock', unit: '°', max: 180, scale: Math.PI / 180 },
    { kind: 'rotationRadians', axis: 2, label: 'Roll', unit: '°', max: 180, scale: Math.PI / 180 },
    { kind: 'translation', axis: 0, label: 'Slide x', unit: '', max: 40, scale: 0.1 },
    { kind: 'translation', axis: 1, label: 'Bob', unit: '', max: 40, scale: 0.1 },
    { kind: 'translation', axis: 2, label: 'Slide z', unit: '', max: 40, scale: 0.1 },
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
      `time      ${String(nowMs)} ms of ${String(described.periodMs)} `
        + `(${describePoseAt(harness.genome().motion, nowMs)})`,
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

  function updateLayerLabel(): void {
    const size = harness.genome().size;
    const ground = layer === 0 ? ' (ground)' : '';
    layerLabel.textContent =
      `Level ${String(layer + 1)} of ${String(size[1])}${ground} · `
      + `${String(size[0])} × ${String(size[2])} looking down`;
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
        // Named the way the label reads, not the way the array is indexed.
        cell.title = slot === 0
          ? `Empty · level ${String(layer + 1)}`
          : `Colour ${String(slot)} · level ${String(layer + 1)}`;
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
    updateLayerLabel();
    periodInput.value = String(period);
    phaseInput.value = String(Math.round((genome.motion.phaseRadians * 180) / Math.PI));
    for (const { spec, input } of amplitudeInputs) {
      input.value = String(Math.round(genome.motion[spec.kind][spec.axis] / spec.scale));
    }
    // The tool states the intent it is being judged against, rather than
    // leaving the person to infer it from nine sliders.
    motionText.textContent = describeMotion(genome.motion);
    buildSwatches();
    buildGrid();
    drawFrame();
    verdict.dataset.tone = 'idle';
    verdict.textContent = 'Sweep to judge this animation.';
    // The old sheet describes the model before this edit, so it is stale the
    // moment anything changes.
    sheetImage.hidden = true;
  }

  /**
   * Opening and keeping models. Without these the studio inspects whichever
   * model it was built with, which makes it a demo of one model rather than a
   * tool for models. The genome is plain JSON precisely so this is a text box
   * and not an import pipeline.
   */
  const genomeText = element('textarea', 'genome');
  genomeText.rows = 6;
  genomeText.spellcheck = false;
  const genomeStatus = element('p', 'verdict');

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
    // Reported as a list, because someone fixing a hand-written model wants
    // every problem rather than the first one.
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
    genomeStatus.textContent = 'Empty model. Paint a level to begin.';
  });

  const starterButton = element('button');
  starterButton.textContent = 'Starter';
  starterButton.addEventListener('click', () => { harness.load(createStarterGenome()); });

  const sizeInput = element('input', 'slider');
  sizeInput.type = 'range';
  sizeInput.min = '2';
  sizeInput.max = '24';
  sizeInput.value = '8';

  const sheetImage = element('img', 'sheet');
  sheetImage.alt = 'Every frame of the period, in time order';
  sheetImage.hidden = true;
  const sheetButton = element('button');
  sheetButton.textContent = 'Show every frame';
  sheetButton.addEventListener('click', () => {
    void (async () => {
      // The studio's own sheet, so the page and the agent are looking at the
      // same image rather than two tilings that could disagree.
      const sheet = await harness.spriteSheet({ samplesPerPeriod: SWEEP_SAMPLES });
      sheetImage.src = sheet.dataUrl;
      sheetImage.hidden = false;
    })();
  });

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
    updateLayerLabel();
    buildGrid();
  });
  scrub.addEventListener('input', drawFrame);
  periodInput.addEventListener('input', () => {
    harness.animate({ periodMs: Number(periodInput.value) });
  });
  phaseInput.addEventListener('input', () => {
    harness.animate({ phaseRadians: (Number(phaseInput.value) * Math.PI) / 180 });
  });

  const editor = element('div', 'card');
  const editorTitle = element('h2');
  editorTitle.textContent = 'Model';
  editor.append(
    editorTitle,
    swatches,
    labelled('Colour', colorInput, 'Recolours every voxel using this swatch.'),
    labelled('Height', layerInput, 'The grid below is one level of the model, seen from above.'),
    layerLabel,
    grid,
  );

  const motion = element('div', 'card');
  const motionTitle = element('h2');
  motionTitle.textContent = 'Motion';
  motion.append(
    motionTitle,
    motionText,
    labelled('Period', periodInput, 'How long one full round trip takes. Zero is still.'),
    labelled('Phase', phaseInput, 'Where in the cycle time zero starts.'),
  );
  for (const { spec, input } of amplitudeInputs) {
    motion.append(labelled(`${spec.label}${spec.unit ? ` (${spec.unit})` : ' (levels)'}`, input));
  }

  const inspect = element('div', 'card');
  const inspectTitle = element('h2');
  inspectTitle.textContent = 'Frame';
  inspect.append(inspectTitle, labelled('Time', scrub), sweepButton, sheetButton,
    verdict, readout);

  const models = element('div', 'card');
  const modelsTitle = element('h2');
  modelsTitle.textContent = 'Models';
  const modelButtons = element('div', 'row');
  modelButtons.append(starterButton, newButton, copyButton, loadButton);
  models.append(
    modelsTitle,
    labelled('New model size', sizeInput, 'Cubes, for now. Any size a genome declares will open.'),
    modelButtons,
    genomeText,
    genomeStatus,
  );

  const columns = element('div', 'columns');
  columns.append(editor, motion, inspect);
  root.append(stage, columns, models, sheetImage);
  refresh();
}

mount();
