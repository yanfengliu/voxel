// Private fixture predicate on actual binary64 half edges; no normalization.
// Scalar domain: nonzero inputs in [2^-100, 2^100]. Degree-four intermediates
// lie on a 2^-608 grid and remain normal. With u=2^-53, error bounds are
// |dN| <= 601u B^3 + 184u C B^2; |dQ| <= 183u B^4;
// |dAABB| <= 43u B + 5u C. The factors below dominate these bounds.
// Ambiguity and inputs outside that domain use interval/exact arithmetic.
// Independent derivation and regression provenance: docs/learning/gate-proofs.md.
import { validate, classifyValidated, classifySolids as fallback, EPSILON_M, type Solid, type Counts } from './oak-affine-fallback.js';
import { up, down, isub, isquare, imul, isqrt, idiv, point, type Interval } from './oak-affine-arithmetic.js';
export { EPSILON_M, type Solid, type Counts } from './oak-affine-fallback.js';
const LOW = 7.888609052210118e-31, HIGH = 1.2676506002282294e30;
const ESQUARED = point(EPSILON_M * EPSILON_M);
const AXES: readonly (readonly [
    number,
    number,
    number,
    number
])[] = [[0, 1, 0, 2], [0, 2, 0, 0], [0, 0, 0, 1], [1, 1, 1, 2], [1, 2, 1, 0], [1, 0, 1, 1],
    ...[0, 1, 2].flatMap(i => [0, 1, 2].map(j => [0, i, 1, j] as const))];
function dot(a: readonly number[], x: number, y: number, z: number): number { return (a[0]! * x + a[1]! * y) + a[2]! * z; }
function inRange(v: number): boolean { const n = Math.abs(v); return n === 0 || (n >= LOW && n <= HIGH); }
// This complete entry point validates each input exactly once. Metric results
// enclose the physical value; unresolved axes use the interval/exact path.
export function classifySolids(a: Solid, b: Solid, options: {
    metric?: boolean;
    forceExact?: boolean;
} = {}) {
    if (options.forceExact)
        return { ...fallback(a, b, options), path: 'fallback' as const };
    validate(a);
    validate(b);
    const counts: Counts = { aabbAxes: 0, satAxes: 0, fastDecisions: 0, exactFallbacks: 0, exactZeroAxes: 0, metricFallbacks: 0, structuralZeroAxes: 0 };
    const decision = filterValidated(a, b, counts, options.metric === true);
    if (decision !== undefined)
        return { ...(typeof decision === 'boolean' ? { overlap: decision, depthIntervalM: null, depthApproxM: null } : decision), counts, path: 'scalar' as const };
    const result = classifyValidated(a, b, options);
    for (const key of Object.keys(counts) as (keyof Counts)[])
        result.counts[key]! += counts[key]!;
    return { ...result, path: 'fallback' as const };
}
function filterValidated(a: Solid, b: Solid, counts: Counts, metric: boolean): boolean | {
    overlap: boolean;
    depthIntervalM: Interval;
    depthApproxM: number;
} | undefined {
    const edges = [...a.edges, ...b.edges];
    let B = 0, C = 0;
    for (let i = 0; i < 3; i++) {
        if (!inRange(a.center[i]!) || !inRange(b.center[i]!))
            return undefined;
        C = Math.max(C, Math.abs(a.center[i]!), Math.abs(b.center[i]!));
        for (const e of edges) {
            if (!inRange(e[i]!))
                return undefined;
            B = Math.max(B, Math.abs(e[i]!));
        }
    }
    const delta = [b.center[0]! - a.center[0]!, b.center[1]! - a.center[1]!, b.center[2]! - a.center[2]!];
    const scale = up(B + C), b2 = up(B * B);
    // Upper-rounded positive expressions dominate the proved error bounds.
    const aabbError = up(256 * (Number.EPSILON / 2) * scale);
    const numeratorError = up(2048 * (Number.EPSILON / 2) * up(b2 * scale));
    const normError = up(512 * (Number.EPSILON / 2) * up(b2 * b2));
    for (let i = 0; !metric && i < 3; i++) {
        counts.aabbAxes++;
        let radius = 0;
        for (const edge of edges)
            radius += Math.abs(edge[i]!);
        const n = radius - Math.abs(delta[i]!);
        if (up(n + aabbError) <= EPSILON_M) {
            counts.fastDecisions++;
            return false;
        }
        if (down(n - aabbError) <= EPSILON_M)
            return undefined;
        counts.fastDecisions++;
    }
    let minLower = Infinity, minUpper = Infinity;
    for (const [s1, e1, s2, e2] of AXES) {
        counts.satAxes++;
        const v = (s1 === 0 ? a : b).edges[e1]!, w = (s2 === 0 ? a : b).edges[e2]!;
        if ((v[0] === w[0] && v[1] === w[1] && v[2] === w[2]) || (v[0] === -w[0]! && v[1] === -w[1]! && v[2] === -w[2]!)) {
            counts.exactZeroAxes++;
            counts.structuralZeroAxes++;
            continue;
        }
        const x = v[1]! * w[2]! - v[2]! * w[1]!, y = v[2]! * w[0]! - v[0]! * w[2]!, z = v[0]! * w[1]! - v[1]! * w[0]!;
        const q = (x * x + y * y) + z * z;
        const qInterval: Interval = [Math.max(0, down(q - normError)), up(q + normError)];
        // A computed zero or ill-conditioned raw axis is never omitted.
        if (qInterval[0]! <= 0)
            return undefined;
        let radius = 0;
        for (const e of edges)
            radius += Math.abs(dot(e, x, y, z));
        const n = radius - Math.abs(dot(delta, x, y, z));
        const nInterval: Interval = [down(n - numeratorError), up(n + numeratorError)];
        if (metric) {
            // N/sqrt(Q) uses the same proved errors as the decision filter.
            // Outward operations and componentwise minima enclose all axes.
            const depth = idiv(nInterval, isqrt(qInterval));
            if (!Number.isFinite(depth[0]) || !Number.isFinite(depth[1]))
                return undefined;
            minLower = Math.min(minLower, depth[0]);
            minUpper = Math.min(minUpper, depth[1]);
            counts.fastDecisions++;
            continue;
        }
        if (nInterval[1]! <= 0) {
            counts.fastDecisions++;
            return false;
        }
        if (nInterval[0]! <= 0)
            return undefined;
        const polynomial = isub(isquare(nInterval), imul(ESQUARED, qInterval));
        if (polynomial[1]! <= 0) {
            counts.fastDecisions++;
            return false;
        }
        if (polynomial[0]! <= 0)
            return undefined;
        counts.fastDecisions++;
    }
    if (!metric) return true;
    // Preserve the existing receipt precision and exact strict threshold.
    if (up(minUpper - minLower) > EPSILON_M / 16
        || (minLower <= EPSILON_M && minUpper > EPSILON_M)) return undefined;
    return { overlap: minLower > EPSILON_M, depthIntervalM: [minLower, minUpper],
        depthApproxM: minLower / 2 + minUpper / 2 };
}
