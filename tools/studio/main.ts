import { createStarterGenome, createStudioHarness, type VoxelStudioHarnessV1 } from './harness.js';
import type { VoxelGenomeV1 } from './genome.js';
import { StudioSession } from './session.js';

/**
 * Mounts the studio. The UI and the harness share one session, so anything a
 * person can see, the agent can report, and neither has its own render path.
 */

declare global {
  interface Window {
    voxelStudio?: VoxelStudioHarnessV1;
  }
}

const VIEW_WIDTH = 480;
const VIEW_HEIGHT = 360;

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
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

  const readout = element('pre', 'readout');
  const verdict = element('p', 'verdict');
  const scrub = element('input', 'scrub');
  scrub.type = 'range';
  scrub.min = '0';
  scrub.step = '1';

  let times: number[] = [];
  const refreshTimes = (): void => {
    const period = session.genome.motion.periodMs;
    times = period > 0
      ? Array.from({ length: 24 }, (_, i) => Math.round((i * period) / 24))
      : [0];
    scrub.max = String(times.length - 1);
    if (Number(scrub.value) > times.length - 1) scrub.value = '0';
  };

  const draw = (): void => {
    const nowMs = times[Number(scrub.value)] ?? 0;
    session.sampleAt(nowMs);
    const described = session.describe();
    readout.textContent = [
      `time      ${String(nowMs)} ms of ${String(described.periodMs)}`,
      `model     ${described.label} (${described.id})`,
      `size      ${described.size.join(' x ')}`,
      `voxels    ${String(described.filledVoxels)} filled`,
      `palette   ${String(described.paletteEntries)} entries`,
      `revision  ${String(described.revision)}`,
      `state     ${described.state}`,
    ].join('\n');
  };

  const rerender = (): void => {
    refreshTimes();
    draw();
    verdict.textContent = 'Sweep to judge this animation.';
    verdict.dataset.tone = 'idle';
  };

  const harness = createStudioHarness({
    session: () => session,
    replace(genome: VoxelGenomeV1) {
      session.dispose();
      session = new StudioSession(genome, {
        canvas,
        width: VIEW_WIDTH,
        height: VIEW_HEIGHT,
        zoom: 1,
      });
      rerender();
    },
    update(genome: VoxelGenomeV1) {
      session.setGenome(genome);
      rerender();
    },
  });
  window.voxelStudio = harness;

  const sweepButton = element('button');
  sweepButton.textContent = 'Sweep and judge';
  sweepButton.addEventListener('click', () => {
    // Deliberately the harness's own method rather than a parallel UI path: if
    // this button could reach a verdict the agent cannot, the studio would be
    // telling two different stories about one model.
    const summary = harness.sweep();
    verdict.dataset.tone = summary.ok ? 'ok' : 'bad';
    verdict.textContent = summary.ok
      ? `Sound. ${String(summary.frameCount)} frames, ${String(summary.distinctFrames)} distinct, `
        + `${String(summary.mirroredFrames)} mirrored across the half period.`
      : summary.issues.map((issue) => issue.message).join(' ');
    draw();
  });

  const stopButton = element('button');
  stopButton.textContent = 'Stop motion';
  stopButton.addEventListener('click', () => { harness.stop(); });

  const spinButton = element('button');
  spinButton.textContent = 'Spin';
  spinButton.addEventListener('click', () => {
    harness.animate({ periodMs: 1_000, rotationRadians: [0, Math.PI / 2, 0] });
  });

  scrub.addEventListener('input', draw);

  const controls = element('div', 'controls');
  controls.append(sweepButton, spinButton, stopButton, scrub);

  const panel = element('div', 'panel');
  panel.append(readout, verdict);

  root.append(stage, controls, panel);
  rerender();
}

mount();
