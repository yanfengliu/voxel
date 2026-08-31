import { expect, type Page } from '@playwright/test';

import type { OakBrowserEvidenceV1 } from '../../fixtures/oak-ecosystem-consumer/oak-browser-contract.js';

interface OakAtomicResourceGaugesV1 {
  readonly authoredResources: number;
  readonly authoredBatches: number;
  readonly authoredChunks: number;
  readonly materialResources: number;
  readonly geometryResources: number;
  readonly instanceBatches: number;
  readonly loadedChunks: number;
  readonly nonemptyChunks: number;
  readonly inFrustumChunks: number;
  readonly liveWorkers: number;
  readonly preparedTargets: number;
  readonly cpuStagingBytes: number;
  readonly gpuStagingBytes: number;
  readonly pendingRetiredBundles: number;
  readonly pendingRetirements: number;
  readonly queuedJobs: number;
  readonly queuedBytes: number;
  readonly queuedWorkerEvents: number;
  readonly failedTargets: number;
  readonly rendererGeometries: number;
  readonly rendererTextures: number;
}

function oakAtomicResourceGauges(
  evidence: OakBrowserEvidenceV1,
): OakAtomicResourceGaugesV1 {
  const atomic = evidence.runtime.atomic;
  if (atomic === null) throw new Error('Oak resource evidence requires its atomic worker metrics.');
  return {
    authoredResources: evidence.render.resourceCount,
    authoredBatches: evidence.render.batchCount,
    authoredChunks: evidence.render.chunkCount,
    materialResources: atomic.materialResources,
    geometryResources: atomic.geometryResources,
    instanceBatches: atomic.instanceBatches,
    loadedChunks: atomic.loadedChunks,
    nonemptyChunks: atomic.nonemptyChunks,
    inFrustumChunks: atomic.inFrustumChunks,
    liveWorkers: atomic.liveWorkers,
    preparedTargets: atomic.preparedTargets,
    cpuStagingBytes: atomic.cpuStagingBytes,
    gpuStagingBytes: atomic.gpuStagingBytes,
    pendingRetiredBundles: atomic.pendingRetiredBundles,
    pendingRetirements: atomic.pendingRetirements,
    queuedJobs: atomic.queuedJobs,
    queuedBytes: atomic.queuedBytes,
    queuedWorkerEvents: atomic.queuedWorkerEvents,
    failedTargets: atomic.failedTargets,
    rendererGeometries: evidence.runtime.rendererGeometries,
    rendererTextures: evidence.runtime.rendererTextures,
  };
}

function expectOakAtomicResourceGaugesLive(gauges: OakAtomicResourceGaugesV1): void {
  expect([
    gauges.authoredResources,
    gauges.authoredBatches,
    gauges.authoredChunks,
    gauges.materialResources,
    gauges.geometryResources,
    gauges.instanceBatches,
    gauges.loadedChunks,
    gauges.nonemptyChunks,
    gauges.inFrustumChunks,
    gauges.liveWorkers,
    gauges.rendererGeometries,
  ].every((value) => value > 0)).toBe(true);
  expect(gauges).toMatchObject({
    preparedTargets: 0,
    cpuStagingBytes: 0,
    gpuStagingBytes: 0,
    pendingRetiredBundles: 0,
    pendingRetirements: 0,
    queuedJobs: 0,
    queuedBytes: 0,
    queuedWorkerEvents: 0,
    failedTargets: 0,
  });
}

export async function expectOakAtomicResourceChurnV1(
  page: Page,
  grown: OakBrowserEvidenceV1,
): Promise<void> {
  const baseline = oakAtomicResourceGauges(grown);
  expectOakAtomicResourceGaugesLive(baseline);
  const samples = await page.evaluate(async (count) => {
    const harness = window.oakEcosystem;
    if (harness === undefined) throw new Error('Oak resource evidence needs its harness.');
    const values = [];
    for (let index = 0; index < count; index += 1) {
      let evidence = harness.advanceBiologicalTicks(1);
      while (!evidence.ready) {
        await new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()));
        evidence = harness.evidence();
      }
      if (index % 20 !== 19) continue;
      const atomic = evidence.runtime.atomic;
      if (atomic === null) throw new Error('Oak churn lost its atomic worker metrics.');
      values.push({
        authoredResources: evidence.render.resourceCount,
        authoredBatches: evidence.render.batchCount,
        authoredChunks: evidence.render.chunkCount,
        materialResources: atomic.materialResources,
        geometryResources: atomic.geometryResources,
        instanceBatches: atomic.instanceBatches,
        loadedChunks: atomic.loadedChunks,
        nonemptyChunks: atomic.nonemptyChunks,
        inFrustumChunks: atomic.inFrustumChunks,
        liveWorkers: atomic.liveWorkers,
        preparedTargets: atomic.preparedTargets,
        cpuStagingBytes: atomic.cpuStagingBytes,
        gpuStagingBytes: atomic.gpuStagingBytes,
        pendingRetiredBundles: atomic.pendingRetiredBundles,
        pendingRetirements: atomic.pendingRetirements,
        queuedJobs: atomic.queuedJobs,
        queuedBytes: atomic.queuedBytes,
        queuedWorkerEvents: atomic.queuedWorkerEvents,
        failedTargets: atomic.failedTargets,
        rendererGeometries: evidence.runtime.rendererGeometries,
        rendererTextures: evidence.runtime.rendererTextures,
      });
    }
    return values;
  }, 120);
  expect(samples).toHaveLength(6);
  const settled = samples[0]!;
  expectOakAtomicResourceGaugesLive(settled);
  // Three registers the first successor bundle's renderer geometry lazily. The
  // atomic ownership gauges must not move at all; renderer memory must plateau
  // exactly after that one measured warm-up sample.
  expect(settled).toEqual({
    ...baseline,
    rendererGeometries: settled.rendererGeometries,
    rendererTextures: settled.rendererTextures,
  });
  expect(samples).toEqual(Array.from({ length: samples.length }, () => settled));
}

export function expectOakAtomicResourceTeardownV1(
  before: OakBrowserEvidenceV1,
  after: OakBrowserEvidenceV1,
): void {
  expectOakAtomicResourceGaugesLive(oakAtomicResourceGauges(before));
  expect(after.runtime.atomic).toMatchObject({
    materialResources: 0,
    geometryResources: 0,
    instanceBatches: 0,
    loadedChunks: 0,
    nonemptyChunks: 0,
    inFrustumChunks: 0,
    liveWorkers: 0,
    preparedTargets: 0,
    cpuStagingBytes: 0,
    gpuStagingBytes: 0,
    pendingRetiredBundles: 0,
    pendingRetirements: 0,
    queuedJobs: 0,
    queuedBytes: 0,
    queuedWorkerEvents: 0,
    failedTargets: 0,
  });
  expect(after.runtime.rendererGeometries).toBe(0);
  expect(after.runtime.rendererTextures).toBe(0);
}
