import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  OAK_PARAMETER_PROVENANCE_V1,
  OAK_PARAMETERS_V1,
} from './oak-parameters.js';

const ASSUMPTION_GROUPS = [
  'seed',
  'soil',
  'forcing',
  'physiology',
  'roots',
  'biogeochemistry',
  'growth',
  'leafGeometry',
  'mechanics',
] as const;

function numericLeaves(value: unknown, path = 'OAK_PARAMETERS_V1'): string[] {
  if (typeof value === 'number') {
    expect(Number.isFinite(value), path).toBe(true);
    return [path];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => numericLeaves(item, `${path}[${String(index)}]`));
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) =>
      numericLeaves(item, `${path}.${key}`));
  }
  return [];
}

function implementationNumericLiterals(source: string): readonly string[] {
  const withoutCommentsAndStrings = source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/\/\/.*$/gmu, '')
    .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/gu, '');
  return withoutCommentsAndStrings.match(/\b(?:\d+\.\d+|\d+(?:e|E)[+-]?\d+)\b/gu) ?? [];
}

describe('oak numeric-assumption registry', () => {
  it('anchors every model group to the explicit early-slice calibration provenance', () => {
    const registered = new Set(OAK_PARAMETER_PROVENANCE_V1.map(({ id }) => id));
    for (const groupName of ASSUMPTION_GROUPS) {
      const group = OAK_PARAMETERS_V1[groupName];
      expect('parameterProvenanceId' in group, groupName).toBe(true);
      expect(registered.has(group.parameterProvenanceId), groupName).toBe(true);
      expect(group.parameterProvenanceId, groupName).toBe('early-slice-calibration');
      expect(numericLeaves(group).length, groupName).toBeGreaterThan(0);
    }
    expect(numericLeaves(OAK_PARAMETERS_V1).length).toBeGreaterThan(100);
  });

  it('keeps model-defining decimal and scientific literals out of process code', () => {
    const implementationFiles = [
      './oak-biogeochemistry.ts',
      './oak-physiology.ts',
      './oak-growth.ts',
      './oak-development.ts',
      './oak-leaf-shape.ts',
      './oak-mechanics.ts',
      './oak-state.ts',
    ];
    for (const file of implementationFiles) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      const literals = implementationNumericLiterals(source);
      // 0.5 is retained only as the exact midpoint/one-half identity used by
      // geometry, random centering, trapezoids and the aerodynamic formula.
      expect(literals.filter((literal) => literal !== '0.5'), file).toEqual([]);
    }
  });

  it('separates source-shaped mechanisms from fixture-fitted values', () => {
    const mechanisms = OAK_PARAMETER_PROVENANCE_V1.filter(({ class: provenanceClass }) =>
      provenanceClass === 'published-model' || provenanceClass === 'species-observation');
    expect(mechanisms.length).toBeGreaterThanOrEqual(8);
    expect(mechanisms.every(({ sourceUrl }) => sourceUrl.startsWith('https://'))).toBe(true);
    expect(OAK_PARAMETER_PROVENANCE_V1.find(({ id }) => id === 'oak-leaf-form'))
      .toEqual(expect.objectContaining({
        class: 'species-observation',
        sourceUrl: 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:304293-2/general-information',
      }));
    expect(OAK_PARAMETERS_V1.leafGeometry.formProvenanceId).toBe('oak-leaf-form');
    expect(OAK_PARAMETER_PROVENANCE_V1.find(({ id }) => id === 'early-slice-calibration'))
      .toEqual(expect.objectContaining({ class: 'fixture-assumption' }));
  });
});
