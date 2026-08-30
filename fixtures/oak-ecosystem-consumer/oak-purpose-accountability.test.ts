import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { buildOakRenderFrameV1 } from './oak-render-adapter.js';
import { createOakSimulationV1 } from './oak-simulation.js';
import { OAK_PURPOSE_ACCOUNTABILITY_V1 } from './oak-purpose-accountability.js';

function flatCoverage(
  field: 'resourceKeys' | 'batchKeys' | 'browserCommands' | 'cameraViews',
): readonly string[] {
  return OAK_PURPOSE_ACCOUNTABILITY_V1.flatMap((record) => record.coverage[field] ?? []);
}

function duplicates(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value)) return true;
    seen.add(value);
    return false;
  });
}

describe('oak visible-purpose accountability', () => {
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

  it('owns every live render resource and batch exactly once', () => {
    const frame = buildOakRenderFrameV1(createOakSimulationV1().projection());
    const resourceKeys = frame.snapshot.resources.map(({ key }) => key).sort();
    const batchKeys = frame.snapshot.batches.map(({ key }) => key).sort();
    const coveredResources = flatCoverage('resourceKeys').slice().sort();
    const coveredBatches = flatCoverage('batchKeys').slice().sort();

    expect(duplicates(coveredResources)).toEqual([]);
    expect(duplicates(coveredBatches)).toEqual([]);
    expect(coveredResources).toEqual(resourceKeys);
    expect(coveredBatches).toEqual(batchKeys);

    for (const record of OAK_PURPOSE_ACCOUNTABILITY_V1) {
      for (const key of record.coverage.resourceKeys ?? []) {
        const subtracted = frame.snapshot.resources.filter((resource) => resource.key !== key);
        expect(subtracted, `${record.id} subtraction ${key}`).toHaveLength(frame.snapshot.resources.length - 1);
      }
      for (const key of record.coverage.batchKeys ?? []) {
        const subtracted = frame.snapshot.batches.filter((batch) => batch.key !== key);
        expect(subtracted, `${record.id} subtraction ${key}`).toHaveLength(frame.snapshot.batches.length - 1);
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
      const url = fileName === 'oak-ecosystem.spec.ts'
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
