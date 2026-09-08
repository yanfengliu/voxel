// Private fixture interval/exact fallback. Structural equality proves selected
// exact-zero crosses; unresolved raw axes are evaluated with exact dyadics.
import { type Interval, type Dyadic, point, iadd, isub, imul, iabs, isquare, isqrt, idiv, idot, icross, inormSquared, exact, dadd, dsub, dmul, dabs, ddot, dcross, dcompare, zero, exactDepthInterval, dyadicInterval, } from './oak-affine-arithmetic.js';
export const EPSILON_M = Number.EPSILON * 8192;
export interface Solid {
    id?: string;
    center: readonly number[];
    edges: readonly (readonly number[])[];
}
export interface Counts {
    aabbAxes: number;
    satAxes: number;
    fastDecisions: number;
    exactFallbacks: number;
    exactZeroAxes: number;
    metricFallbacks: number;
    structuralZeroAxes: number;
}
export interface ExactShape {
    center: Dyadic[];
    edges: Dyadic[][];
}
type AxisIndex = readonly [
    number,
    number,
    number,
    number
];
const AXES: AxisIndex[] = [
    [0, 1, 0, 2], [0, 2, 0, 0], [0, 0, 0, 1],
    [1, 1, 1, 2], [1, 2, 1, 0], [1, 0, 1, 1],
    ...[0, 1, 2].flatMap(i => [0, 1, 2].map(j => [0, i, 1, j] as const)),
];
const eSquared = imul(point(EPSILON_M), point(EPSILON_M));
const exactESquared = dmul(exact(EPSILON_M), exact(EPSILON_M));
const exactE = exact(EPSILON_M);
const vector = (v: readonly number[]): Interval[] => v.map(point);
const exactShape = (s: Solid): ExactShape => ({ center: s.center.map(exact), edges: s.edges.map(e => e.map(exact)) });
export function validate(s: Solid): void {
    if (s.center.length !== 3 || s.edges.length !== 3 || s.edges.some(e => e.length !== 3)
        || [...s.center, ...s.edges.flat()].some(v => !Number.isFinite(v)))
        throw new RangeError('Affine SAT requires finite three-component centers and three half edges.');
    if (s.edges.some(e => e.every(v => v === 0)))
        throw new RangeError('Affine SAT requires three nonzero half edges.');
    const vectors = s.edges.map(vector), determinant = idot(vectors[0]!, icross(vectors[1]!, vectors[2]!));
    if (determinant[0]! <= 0 && determinant[1]! >= 0) {
        const edges = s.edges.map(e => e.map(exact));
        if (ddot(edges[0]!, dcross(edges[1]!, edges[2]!)).n === 0n)
            throw new RangeError('Affine SAT requires nondegenerate solids.');
    }
}
export function classifySolids(a: Solid, b: Solid, options: {
    metric?: boolean;
    forceExact?: boolean;
} = {}) {
    validate(a);
    validate(b);
    return classifyValidated(a, b, options);
}
export function classifyValidated(a: Solid, b: Solid, options: {
    metric?: boolean;
    forceExact?: boolean;
} = {}) {
    return classifyPrepared([a, b], options);
}
/** Exact operand preparation for matrix halves and direct OBB products. */
export function classifyExactSolids(a: ExactShape, b: ExactShape, options: {
    metric?: boolean;
    forceExact?: boolean;
} = {}) {
    for (const shape of [a, b]) {
        if (shape.center.length !== 3 || shape.edges.length !== 3 || shape.edges.some(edge => edge.length !== 3))
            throw new RangeError('Exact affine SAT requires three-component centers and three half edges.');
        if (ddot(shape.edges[0]!, dcross(shape.edges[1]!, shape.edges[2]!)).n === 0n)
            throw new RangeError('Affine SAT requires nondegenerate solids.');
    }
    return classifyPrepared(undefined, options, [a, b]);
}
function classifyPrepared(rawShapes: readonly Solid[] | undefined, options: {
    metric?: boolean;
    forceExact?: boolean;
}, preparedExact?: ExactShape[]) {
    const counts: Counts = { aabbAxes: 0, satAxes: 0, fastDecisions: 0, exactFallbacks: 0, exactZeroAxes: 0, metricFallbacks: 0, structuralZeroAxes: 0 };
    const metric = options.metric === true;
    const intervalShapes = rawShapes !== undefined
        ? rawShapes.map(s => ({ center: vector(s.center), edges: s.edges.map(vector) }))
        : preparedExact!.map(s => ({ center: s.center.map(dyadicInterval), edges: s.edges.map(edge => edge.map(dyadicInterval)) }));
    const delta = intervalShapes[1]!.center.map((v, i) => isub(v, intervalShapes[0]!.center[i]!));
    let exactShapes: ExactShape[] | undefined = preparedExact;
    const exactInputs = (): ExactShape[] => exactShapes ??= rawShapes!.map(exactShape);
    let overlap = true;
    // AABB rejection is a necessary metric condition. Ambiguous rounded bounds
    // are resolved exactly; ordinary far separation never pays for full SAT.
    if (!metric)
        for (let i = 0; i < 3; i++) {
            counts.aabbAxes++;
            const radius = intervalShapes.flatMap(s => s.edges).reduce((sum, e) => iadd(sum, iabs(e[i]!)), point(0));
            const depth = isub(radius, iabs(delta[i]!));
            if (!options.forceExact && depth[1]! <= EPSILON_M) {
                counts.fastDecisions++;
                return { overlap: false, depthIntervalM: null, depthApproxM: null, counts };
            }
            if (!options.forceExact && depth[0]! > EPSILON_M) {
                counts.fastDecisions++;
                continue;
            }
            counts.exactFallbacks++;
            const inputs = exactInputs();
            const r = inputs.flatMap(s => s.edges).reduce((sum, e) => dadd(sum, dabs(e[i]!)), zero);
            const n = dsub(r, dabs(dsub(inputs[1]!.center[i]!, inputs[0]!.center[i]!)));
            if (dcompare(n, exactE) <= 0)
                return { overlap: false, depthIntervalM: null, depthApproxM: null, counts };
        }
    let minLower = Infinity, minUpper = Infinity, nonzeroAxes = 0;
    for (const [s1, e1, s2, e2] of AXES) {
        counts.satAxes++;
        const first = rawShapes?.[s1]!.edges[e1], second = rawShapes?.[s2]!.edges[e2];
        // Equality (including exact negatives) of supplied finite operands proves
        // their real cross is zero. No closeness or normalized-angle test is used.
        if (!options.forceExact && first !== undefined && second !== undefined
            && (first.every((v, i) => v === second[i]!) || first.every((v, i) => v === -second[i]!))) {
            counts.exactZeroAxes++;
            counts.structuralZeroAxes++;
            continue;
        }
        const axis = icross(intervalShapes[s1]!.edges[e1]!, intervalShapes[s2]!.edges[e2]!);
        const q = inormSquared(axis);
        const r = intervalShapes.flatMap(s => s.edges).reduce((sum, e) => iadd(sum, iabs(idot(e, axis))), point(0));
        const n = isub(r, iabs(idot(delta, axis)));
        let decision: boolean | undefined;
        let depth: Interval | undefined;
        let exactAxis: {
            n: Dyadic;
            q: Dyadic;
        } | undefined;
        const resolveExact = () => {
            if (exactAxis)
                return exactAxis;
            const inputs = exactInputs(), normal = dcross(inputs[s1]!.edges[e1]!, inputs[s2]!.edges[e2]!);
            const square = ddot(normal, normal);
            const separation = inputs[1]!.center.map((v, i) => dsub(v, inputs[0]!.center[i]!));
            const support = inputs.flatMap(s => s.edges).reduce((sum, e) => dadd(sum, dabs(ddot(e, normal))), zero);
            exactAxis = { n: dsub(support, dabs(ddot(separation, normal))), q: square };
            return exactAxis;
        };
        if (!options.forceExact && q[0]! > 0) {
            if (n[1]! <= 0)
                decision = false;
            else if (n[0]! > 0) {
                const polynomial = isub(isquare(n), imul(eSquared, q));
                if (polynomial[0]! > 0)
                    decision = true;
                else if (polynomial[1]! <= 0)
                    decision = false;
            }
        }
        if (decision === undefined) {
            counts.exactFallbacks++;
            const value = resolveExact();
            if (value.q.n === 0n) {
                counts.exactZeroAxes++;
                continue;
            }
            decision = value.n.n > 0n && dcompare(dmul(value.n, value.n), dmul(exactESquared, value.q)) > 0;
            if (metric)
                depth = exactDepthInterval(value.n, value.q);
        }
        else
            counts.fastDecisions++;
        nonzeroAxes++;
        overlap &&= decision;
        if (!metric && !overlap)
            return { overlap: false, depthIntervalM: null, depthApproxM: null, counts };
        if (metric) {
            depth ??= idiv(n, isqrt(q));
            // A wide enclosure stays mathematically valid but is unhelpful for
            // contact receipts. Tighten with the same exact arithmetic, never epsilon.
            if (!Number.isFinite(depth[0]!) || !Number.isFinite(depth[1]!) || depth[1]! - depth[0]! > EPSILON_M / 16) {
                counts.metricFallbacks++;
                const value = resolveExact();
                depth = exactDepthInterval(value.n, value.q);
            }
            minLower = Math.min(minLower, depth[0]!);
            minUpper = Math.min(minUpper, depth[1]!);
        }
    }
    if (!nonzeroAxes)
        throw new RangeError('Affine SAT requires nondegenerate solids.');
    const depthIntervalM: Interval | null = metric ? [minLower, minUpper] : null;
    const depthApproxM = metric ? minLower / 2 + minUpper / 2 : null;
    return { overlap, depthIntervalM, depthApproxM, counts };
}
