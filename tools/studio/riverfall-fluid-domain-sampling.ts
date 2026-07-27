import {
  MAX_RIVERFALL_FLUID_COORDINATE_V1,
  MAX_RIVERFALL_FLUID_HALF_WIDTH_V1,
  MAX_RIVERFALL_FLUID_REACHES_V1,
  RIVERFALL_FLUID_DOMAIN_SCHEMA_V1,
  type MappedRiverfallFluidCoordinateV1,
  type RiverfallFluidDomainIssueCodeV1,
  type RiverfallFluidDomainIssueV1,
  type RiverfallFluidDomainV1,
  type RiverfallFluidReachV1,
  type RiverfallFluidVec3V1,
  type SampledRiverfallFluidDomainV1,
} from './riverfall-fluid-domain-data.js';

type UnknownRecord = Record<string, unknown>;

interface ParsedReachV1 {
  readonly index: number;
  readonly start: RiverfallFluidVec3V1;
  readonly end: RiverfallFluidVec3V1;
  readonly halfWidths: readonly [number, number];
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unexpectedFields(
  value: UnknownRecord,
  allowed: readonly string[],
  path: string,
  code: Extract<
  RiverfallFluidDomainIssueCodeV1,
  'domain.unexpected-field' | 'reach.unexpected-field'
  >,
  issues: RiverfallFluidDomainIssueV1[],
): void {
  const expected = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) {
      issues.push({
        code,
        path: `${path}.${key}`,
        message: `Unexpected field '${key}'; allowed fields are ${allowed.join(', ')}.`,
      });
    }
  }
}

function point(
  value: unknown,
  path: string,
  issues: RiverfallFluidDomainIssueV1[],
  code: Extract<
  RiverfallFluidDomainIssueCodeV1,
  'domain.lateral-axis' | 'reach.point'
  > = 'reach.point',
): RiverfallFluidVec3V1 | null {
  if (!Array.isArray(value) || value.length !== 3
    || value.some((component) => typeof component !== 'number'
      || !Number.isFinite(component)
      || Math.abs(component) > MAX_RIVERFALL_FLUID_COORDINATE_V1)) {
    issues.push({
      code,
      path,
      message: `Expected exactly three finite world coordinates within +/-${
        String(MAX_RIVERFALL_FLUID_COORDINATE_V1)
      }; received ${JSON.stringify(value)}.`,
    });
    return null;
  }
  return [value[0] as number, value[1] as number, value[2] as number];
}

function halfWidths(
  value: unknown,
  path: string,
  issues: RiverfallFluidDomainIssueV1[],
): readonly [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2
    || value.some((width) => typeof width !== 'number'
      || !Number.isFinite(width)
      || width <= 0
      || width > MAX_RIVERFALL_FLUID_HALF_WIDTH_V1)) {
    issues.push({
      code: 'reach.half-widths',
      path,
      message: `Expected two finite half-widths greater than 0 and at most ${
        String(MAX_RIVERFALL_FLUID_HALF_WIDTH_V1)
      }; received ${JSON.stringify(value)}.`,
    });
    return null;
  }
  return [value[0] as number, value[1] as number];
}

function distance(
  left: RiverfallFluidVec3V1,
  right: RiverfallFluidVec3V1,
): number {
  return Math.hypot(
    right[0] - left[0],
    right[1] - left[1],
    right[2] - left[2],
  );
}

function samePoint(
  left: RiverfallFluidVec3V1,
  right: RiverfallFluidVec3V1,
): boolean {
  return distance(left, right) <= 1e-9;
}

function describePoint(value: RiverfallFluidVec3V1): string {
  return `[${value.map((component) => String(component)).join(', ')}]`;
}

export function validateRiverfallFluidDomainV1(
  value: unknown,
): readonly RiverfallFluidDomainIssueV1[] {
  const issues: RiverfallFluidDomainIssueV1[] = [];
  if (!isRecord(value)) {
    return [{
      code: 'domain.expected-object',
      path: '$',
      message: 'Expected a Riverfall fluid-domain object.',
    }];
  }
  unexpectedFields(
    value,
    ['schemaVersion', 'visualClearance', 'lateralAxis', 'reaches'],
    '$',
    'domain.unexpected-field',
    issues,
  );
  if (value.schemaVersion !== RIVERFALL_FLUID_DOMAIN_SCHEMA_V1) {
    issues.push({
      code: 'domain.schema',
      path: '$.schemaVersion',
      message: `Expected '${RIVERFALL_FLUID_DOMAIN_SCHEMA_V1}'; received ${
        String(value.schemaVersion)
      }.`,
    });
  }
  if (typeof value.visualClearance !== 'number'
    || !Number.isFinite(value.visualClearance)
    || value.visualClearance <= 0
    || value.visualClearance > 1) {
    issues.push({
      code: 'domain.visual-clearance',
      path: '$.visualClearance',
      message: `Expected a finite visual clearance greater than 0 and at most 1; received ${
        String(value.visualClearance)
      }.`,
    });
  }

  const lateralAxis = point(
    value.lateralAxis,
    '$.lateralAxis',
    issues,
    'domain.lateral-axis',
  );
  if (lateralAxis !== null
    && Math.abs(Math.hypot(...lateralAxis) - 1) > 1e-6) {
    issues.push({
      code: 'domain.lateral-axis',
      path: '$.lateralAxis',
      message: `Expected a unit cross-stream axis; length was ${
        String(Math.hypot(...lateralAxis))
      }.`,
    });
  }

  if (!Array.isArray(value.reaches)
    || value.reaches.length < 1
    || value.reaches.length > MAX_RIVERFALL_FLUID_REACHES_V1) {
    issues.push({
      code: 'domain.reaches',
      path: '$.reaches',
      message: `Expected 1 through ${String(MAX_RIVERFALL_FLUID_REACHES_V1)} reaches; received ${
        Array.isArray(value.reaches) ? String(value.reaches.length) : String(value.reaches)
      }.`,
    });
    return issues;
  }

  const parsed: (ParsedReachV1 | null)[] = [];
  const ids = new Set<string>();
  value.reaches.forEach((candidate, index) => {
    const path = `$.reaches[${String(index)}]`;
    if (!isRecord(candidate)) {
      issues.push({
        code: 'reach.expected-object',
        path,
        message: 'Expected a Riverfall fluid reach object.',
      });
      parsed.push(null);
      return;
    }
    unexpectedFields(
      candidate,
      ['id', 'visualPlacementId', 'visibility', 'start', 'end', 'halfWidths'],
      path,
      'reach.unexpected-field',
      issues,
    );
    if (typeof candidate.id !== 'string'
      || candidate.id.length === 0
      || candidate.id.trim() !== candidate.id
      || candidate.id.length > 128) {
      issues.push({
        code: 'reach.id',
        path: `${path}.id`,
        message: 'Expected a non-empty trimmed reach id of at most 128 characters.',
      });
    } else if (ids.has(candidate.id)) {
      issues.push({
        code: 'reach.id-duplicate',
        path: `${path}.id`,
        message: `Duplicate reach id '${candidate.id}' is not allowed.`,
      });
    } else {
      ids.add(candidate.id);
    }
    if (typeof candidate.visualPlacementId !== 'string'
      || candidate.visualPlacementId.length === 0
      || candidate.visualPlacementId.trim() !== candidate.visualPlacementId
      || candidate.visualPlacementId.length > 128) {
      issues.push({
        code: 'reach.visual-placement',
        path: `${path}.visualPlacementId`,
        message: 'Expected a non-empty trimmed visual placement id of at most 128 characters.',
      });
    }
    if (candidate.visibility !== 'visible' && candidate.visibility !== 'hidden') {
      issues.push({
        code: 'reach.visibility',
        path: `${path}.visibility`,
        message: `Expected visible or hidden; received ${String(candidate.visibility)}.`,
      });
    }
    const start = point(candidate.start, `${path}.start`, issues);
    const end = point(candidate.end, `${path}.end`, issues);
    const widths = halfWidths(candidate.halfWidths, `${path}.halfWidths`, issues);
    if (start === null || end === null || widths === null) {
      parsed.push(null);
      return;
    }
    const length = distance(start, end);
    if (!(length > 1e-9)) {
      issues.push({
        code: 'reach.zero-length',
        path: `${path}.end`,
        message: `Reach '${String(candidate.id)}' has zero length at ${describePoint(start)}; `
          + 'move one endpoint so the solver has a finite longitudinal interval.',
      });
    }
    if (lateralAxis !== null && length > 1e-9) {
      const delta: RiverfallFluidVec3V1 = [
        end[0] - start[0],
        end[1] - start[1],
        end[2] - start[2],
      ];
      const dot = delta[0] * lateralAxis[0]
        + delta[1] * lateralAxis[1]
        + delta[2] * lateralAxis[2];
      if (Math.abs(dot) > length * 1e-6) {
        issues.push({
          code: 'reach.axis-not-perpendicular',
          path: `${path}.end`,
          message: `Reach '${String(candidate.id)}' advances ${String(dot)} world units along `
            + 'the lateral axis; endpoints must describe only longitudinal travel.',
        });
      }
    }
    parsed.push({ index, start, end, halfWidths: widths });
  });

  parsed.forEach((current, index) => {
    if (current === null) return;
    const previousIndex = (index + parsed.length - 1) % parsed.length;
    const previous = parsed[previousIndex];
    if (previous === null || previous === undefined) return;
    if (!samePoint(previous.end, current.start)) {
      issues.push({
        code: 'reach.disconnected',
        path: `$.reaches[${String(current.index)}].start`,
        message: `Reach ${String(current.index)} must start at previous reach ${
          String(previous.index)
        } end ${describePoint(previous.end)}; received ${describePoint(current.start)}.`,
      });
    }
    if (Math.abs(previous.halfWidths[1] - current.halfWidths[0]) > 1e-9) {
      issues.push({
        code: 'reach.width-disconnected',
        path: `$.reaches[${String(current.index)}].halfWidths[0]`,
        message: `Reach ${String(current.index)} starts at half-width ${
          String(current.halfWidths[0])
        }, but previous reach ${String(previous.index)} ends at ${
          String(previous.halfWidths[1])
        }. Match the boundary widths so particles do not cross a discontinuous wall.`,
      });
    }
  });
  return issues;
}

export class RiverfallFluidDomainError extends Error {
  constructor(
    message: string,
    readonly issues: readonly RiverfallFluidDomainIssueV1[] = [],
  ) {
    super(message);
    this.name = 'RiverfallFluidDomainError';
  }
}

function assertValidDomain(domain: RiverfallFluidDomainV1, action: string): void {
  const issues = validateRiverfallFluidDomainV1(domain);
  if (issues.length === 0) return;
  const shown = issues.slice(0, 8)
    .map((issue) => `${issue.path} ${issue.message}`)
    .join('; ');
  const omitted = issues.length > 8
    ? `; plus ${String(issues.length - 8)} more issue(s)`
    : '';
  throw new RiverfallFluidDomainError(
    `Cannot ${action} Riverfall fluid domain because its sidecar is invalid: ${shown}${omitted}`,
    issues,
  );
}

function reachLength(reach: RiverfallFluidReachV1): number {
  return distance(reach.start, reach.end);
}

export function riverfallFluidDomainLengthV1(
  domain: RiverfallFluidDomainV1,
): number {
  return domain.reaches.reduce((total, reach) => total + reachLength(reach), 0);
}

/** Samples a domain already accepted by `validateRiverfallFluidDomainV1`. */
export function sampleValidatedRiverfallFluidDomainV1(
  domain: RiverfallFluidDomainV1,
  longitudinalDistance: number,
): SampledRiverfallFluidDomainV1 {
  if (!Number.isFinite(longitudinalDistance)) {
    throw new RiverfallFluidDomainError(
      `Cannot sample Riverfall fluid domain at longitudinal distance ${
        String(longitudinalDistance)
      }; expected a finite world-unit distance.`,
    );
  }
  const totalLength = riverfallFluidDomainLengthV1(domain);
  if (!(totalLength > 0) || !Number.isFinite(totalLength)) {
    throw new RiverfallFluidDomainError(
      `Cannot sample Riverfall fluid domain with total length ${String(totalLength)}; `
      + 'validate the sidecar and give every reach a finite nonzero length.',
    );
  }
  const remainder = longitudinalDistance % totalLength;
  const wrappedDistance = remainder < 0
    ? remainder + totalLength
    : remainder === 0 ? 0 : remainder;
  let remaining = wrappedDistance;
  let reachIndex = domain.reaches.length - 1;
  for (let index = 0; index < domain.reaches.length; index += 1) {
    const length = reachLength(domain.reaches[index]!);
    if (remaining < length || index === domain.reaches.length - 1) {
      reachIndex = index;
      break;
    }
    remaining -= length;
  }
  const reach = domain.reaches[reachIndex]!;
  const length = reachLength(reach);
  const progress = Math.max(0, Math.min(1, remaining / length));
  const delta: RiverfallFluidVec3V1 = [
    reach.end[0] - reach.start[0],
    reach.end[1] - reach.start[1],
    reach.end[2] - reach.start[2],
  ];
  return {
    longitudinalDistance,
    wrappedDistance,
    totalLength,
    reachIndex,
    reachId: reach.id,
    visualPlacementId: reach.visualPlacementId,
    visibility: reach.visibility,
    localDistance: remaining,
    progress,
    center: [
      reach.start[0] + delta[0] * progress,
      reach.start[1] + delta[1] * progress,
      reach.start[2] + delta[2] * progress,
    ],
    tangent: [delta[0] / length, delta[1] / length, delta[2] / length],
    lateralAxis: [...domain.lateralAxis],
    halfWidth: reach.halfWidths[0]
      + (reach.halfWidths[1] - reach.halfWidths[0]) * progress,
  };
}

/** Validates once for one-off callers; solver loops should use the validated sampler. */
export function sampleRiverfallFluidDomainV1(
  domain: RiverfallFluidDomainV1,
  longitudinalDistance: number,
): SampledRiverfallFluidDomainV1 {
  assertValidDomain(domain, 'sample');
  return sampleValidatedRiverfallFluidDomainV1(domain, longitudinalDistance);
}

export function mapValidatedRiverfallFluidCoordinateV1(
  domain: RiverfallFluidDomainV1,
  longitudinalDistance: number,
  lateralOffset: number,
): MappedRiverfallFluidCoordinateV1 {
  if (!Number.isFinite(lateralOffset)) {
    throw new RiverfallFluidDomainError(
      `Cannot map Riverfall fluid coordinate with lateral offset ${String(lateralOffset)}; `
      + 'expected a finite world-unit offset.',
    );
  }
  const sample = sampleValidatedRiverfallFluidDomainV1(
    domain,
    longitudinalDistance,
  );
  if (Math.abs(lateralOffset) > sample.halfWidth + 1e-9) {
    throw new RiverfallFluidDomainError(
      `Cannot map Riverfall fluid coordinate at wrapped distance ${
        String(sample.wrappedDistance)
      } on reach '${sample.reachId}': lateral offset ${String(lateralOffset)} exceeds `
      + `half-width ${String(sample.halfWidth)}. Keep the 2D particle inside [-${
        String(sample.halfWidth)
      }, ${String(sample.halfWidth)}].`,
    );
  }
  return {
    ...sample,
    lateralOffset,
    position: [
      sample.center[0] + sample.lateralAxis[0] * lateralOffset,
      sample.center[1] + sample.lateralAxis[1] * lateralOffset,
      sample.center[2] + sample.lateralAxis[2] * lateralOffset,
    ],
  };
}

export function mapRiverfallFluidCoordinateV1(
  domain: RiverfallFluidDomainV1,
  longitudinalDistance: number,
  lateralOffset: number,
): MappedRiverfallFluidCoordinateV1 {
  assertValidDomain(domain, 'map a coordinate through');
  return mapValidatedRiverfallFluidCoordinateV1(
    domain,
    longitudinalDistance,
    lateralOffset,
  );
}
