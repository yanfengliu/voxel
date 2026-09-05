import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { buildOakRenderFrameV1 } from './oak-render-adapter.js';
import { OAK_FALLEN_LITTER_VOXEL_RULE_IDS_V1 } from './oak-fallen-litter-voxel.js';
import { createOakSimulationV1 } from './oak-simulation.js';
import { OAK_PURPOSE_ACCOUNTABILITY_V1 } from './oak-purpose-accountability.js';
import { OAK_SOIL_VOXEL_RULE_IDS_V1 } from './oak-soil-voxel.js';
import { OAK_TISSUE_VOXEL_RULE_IDS_V1 } from './oak-tissue-voxel-projection.js';
import { OAK_WEATHER_VOXEL_RULE_IDS_V1 } from './oak-weather-voxel-presentation.js';

function flatCoverage(
  field:
    | 'resourceKeys'
    | 'batchKeys'
    | 'chunkKeys'
    | 'voxelRuleIds'
    | 'browserCommands'
    | 'cameraViews',
): readonly string[] {
  return OAK_PURPOSE_ACCOUNTABILITY_V1.flatMap((record) => record.coverage[field] ?? []);
}

const EXPECTED_HYBRID_RESOURCES = Object.freeze([
  'geometry:oak:tissue-voxel',
  'material:oak:fallen-litter-voxel',
  'material:oak:leaf-voxel',
  'material:oak:root-voxel',
  'material:oak:seed-bud-voxel',
  'material:oak:soil-voxel',
  'material:oak:weather-voxel',
  'material:oak:wood-voxel',
  'palette:oak:soil-voxel',
]);

const EXPECTED_HYBRID_BATCHES = Object.freeze([
  'batch:oak:fallen-litter-voxels',
  'batch:oak:leaf-voxels',
  'batch:oak:root-voxels',
  'batch:oak:seed-bud-voxels',
  'batch:oak:soil-contact-voxels',
  'batch:oak:weather-voxels',
  'batch:oak:wood-voxels',
]);

const EXPECTED_HYBRID_CHUNKS = Object.freeze(['chunk:oak:soil-field']);

const EXPECTED_VOXEL_RULES = Object.freeze([
  'declared-port-fused-paths',
  'development-front-prefixes',
  'fallen-leaf-lobed-litter-mask',
  'leaf-anatomical-senescence-order',
  'leaf-lobed-area-mask',
  'leaf-petiole-midrib-mask',
  'leaf-secondary-vein-material-rhythm',
  'leaf-transverse-camber-mask',
  'litter-living-tissue-disjoint',
  'litter-soil-face-contact',
  'organ-local-float32-clearance',
  'organ-state-palette-quantization',
  'rain-cue-fall-impact-expiry',
  'rain-cue-retained-surface-contact',
  'rain-cue-shared-wind-drift',
  'root-aggregate-legibility-mask',
  'seed-bud-port-masks',
  'shared-dyadic-tissue-lattice',
  'shared-mechanics-airflow-direction',
  'soil-connected-relief-surface',
  'soil-cutaway-cross-section',
  'soil-litter-transfer',
  'soil-state-ordered-dither',
  'soil-tissue-clearance',
  'soil-top-boundary',
  'source-claim-preservation',
  'tissue-voxel-primitives',
  'weather-cue-scene-occupancy-clearance',
  'weather-cue-voxel-material',
  'wood-cylindrical-connected-mask',
]);

function duplicates(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value)) return true;
    seen.add(value);
    return false;
  });
}

describe('oak visible-purpose accountability', () => {
  it('pins the agreed hybrid voxel lattice and forbids stale smooth oak resources', () => {
    expect(flatCoverage('resourceKeys').slice().sort()).toEqual(EXPECTED_HYBRID_RESOURCES);
    expect(flatCoverage('batchKeys').slice().sort()).toEqual(EXPECTED_HYBRID_BATCHES);
    expect(flatCoverage('chunkKeys').slice().sort()).toEqual(EXPECTED_HYBRID_CHUNKS);
    expect(flatCoverage('voxelRuleIds').slice().sort()).toEqual(EXPECTED_VOXEL_RULES);

    const authoredScope = OAK_PURPOSE_ACCOUNTABILITY_V1
      .map(({ artifactAndExactAuthoredScope }) => artifactAndExactAuthoredScope)
      .join(' ');
    expect(authoredScope).not.toMatch(/geometry:oak:(?:frustum|leaf:|soil-cube)/u);
    expect(authoredScope).not.toMatch(
      /batch:oak:(?:wood:|root:|leaf:|buds-and-acorns|soil(?!-)\b)/u,
    );
  });

  it('gives every record the full non-boilerplate purpose and control contract', () => {
    expect(OAK_PURPOSE_ACCOUNTABILITY_V1.length).toBeGreaterThanOrEqual(15);
    expect(new Set(OAK_PURPOSE_ACCOUNTABILITY_V1.map(({ id }) => id)).size)
      .toBe(OAK_PURPOSE_ACCOUNTABILITY_V1.length);
    for (const record of OAK_PURPOSE_ACCOUNTABILITY_V1) {
      const fields = [
        record.artifactAndExactAuthoredScope,
        record.requiredBy,
        record.jobPerformed,
        record.locationOrRelationshipDatum,
        record.failureWhenRemoved,
        record.failureWhenRelocated,
        record.smallestAdequateForm,
        record.honestyBoundary,
      ];
      expect(fields.every((field) => field.length >= 35), record.id).toBe(true);
      expect(new Set(fields).size, record.id).toBe(fields.length);
      expect(fields.join(' '), record.id)
        .not.toMatch(/looks? cool|visual interest|adds detail|breaks up|decoration/i);
      expect(record.failureWhenRemoved, record.id).toMatch(/remov|erases|loses|hides|leaves|blackens|freezes/i);
      expect(record.failureWhenRelocated, record.id).toMatch(/relocat|moving|misreport|breaks|contradicts|clips|disconnect/i);
      expect(record.evidence.length, record.id).toBeGreaterThan(0);
      expect(record.evidence.every((item) => item.includes('/') || item.endsWith('.png')), record.id).toBe(true);
    }
  });

  it('owns every live hybrid render resource batch chunk and voxel rule exactly once', () => {
    const frame = buildOakRenderFrameV1(createOakSimulationV1().projection());
    const resourceKeys = frame.snapshot.resources.map(({ key }) => key).sort();
    const batchKeys = frame.snapshot.batches.map(({ key }) => key).sort();
    const chunkKeys = frame.snapshot.chunks.map(({ key }) => key).sort();
    const coveredResources = flatCoverage('resourceKeys').slice().sort();
    const coveredBatches = flatCoverage('batchKeys').slice().sort();
    const coveredChunks = flatCoverage('chunkKeys').slice().sort();
    const coveredVoxelRules = flatCoverage('voxelRuleIds').slice().sort();

    expect(duplicates(coveredResources)).toEqual([]);
    expect(duplicates(coveredBatches)).toEqual([]);
    expect(duplicates(coveredChunks)).toEqual([]);
    expect(duplicates(coveredVoxelRules)).toEqual([]);
    expect(coveredResources).toEqual(resourceKeys);
    expect(coveredBatches).toEqual(batchKeys);
    expect(coveredChunks).toEqual(chunkKeys);
    expect(coveredVoxelRules).toEqual(EXPECTED_VOXEL_RULES);
    expect([
      ...OAK_SOIL_VOXEL_RULE_IDS_V1,
      ...OAK_TISSUE_VOXEL_RULE_IDS_V1,
      ...OAK_FALLEN_LITTER_VOXEL_RULE_IDS_V1,
      ...OAK_WEATHER_VOXEL_RULE_IDS_V1,
    ].sort()).toEqual(EXPECTED_VOXEL_RULES);

    for (const record of OAK_PURPOSE_ACCOUNTABILITY_V1) {
      for (const key of record.coverage.resourceKeys ?? []) {
        const subtracted = frame.snapshot.resources.filter((resource) => resource.key !== key);
        expect(subtracted, `${record.id} subtraction ${key}`).toHaveLength(frame.snapshot.resources.length - 1);
      }
      for (const key of record.coverage.batchKeys ?? []) {
        const subtracted = frame.snapshot.batches.filter((batch) => batch.key !== key);
        expect(subtracted, `${record.id} subtraction ${key}`).toHaveLength(frame.snapshot.batches.length - 1);
      }
      for (const key of record.coverage.chunkKeys ?? []) {
        const subtracted = frame.snapshot.chunks.filter((chunk) => chunk.key !== key);
        expect(subtracted, `${record.id} subtraction ${key}`).toHaveLength(frame.snapshot.chunks.length - 1);
      }
    }
  });

  it('resolves every evidence anchor to an exact executable title or baseline', () => {
    const anchors = OAK_PURPOSE_ACCOUNTABILITY_V1.flatMap(({ evidence }) => evidence);
    for (const anchor of anchors) {
      if (anchor.endsWith('.png')) {
        expect(existsSync(new URL(`../../tests/browser/baselines/${anchor}`, import.meta.url)), anchor)
          .toBe(true);
        continue;
      }
      const separator = anchor.indexOf('/');
      const fileName = anchor.slice(0, separator);
      const title = anchor.slice(separator + 1);
      const url = fileName.endsWith('.spec.ts')
        ? new URL(`../../tests/browser/${fileName}`, import.meta.url)
        : new URL(`./${fileName}`, import.meta.url);
      expect(readFileSync(url, 'utf8'), anchor).toContain(`'${title}'`);
    }
  });

  it('matches every authored HTML command and view with no stale purpose scope', () => {
    const html = readFileSync(new URL('./oak-browser-host.html', import.meta.url), 'utf8');
    const commands = [...html.matchAll(/data-command="([^"]+)"/g)].map((match) => match[1]!).sort();
    const views = [...html.matchAll(/data-view="([^"]+)"/g)].map((match) => match[1]!).sort();
    const coveredCommands = flatCoverage('browserCommands').slice().sort();
    const coveredViews = [...new Set(flatCoverage('cameraViews'))].sort();

    expect(duplicates(coveredCommands)).toEqual([]);
    expect(coveredCommands).toEqual(commands);
    expect(coveredViews).toEqual(views);
  });
});
