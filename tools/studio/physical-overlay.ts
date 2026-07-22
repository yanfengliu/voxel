import type { PhysicalPoseV1, PhysicalShapeV1 } from './physical-asset.js';
import type { CompiledPhysicalModelV1 } from './physical-compile.js';

/**
 * Turns a compiled physical model into plain line segments the viewer can
 * draw over the picture: wireframe outlines for every collider and a small
 * three-axis cross for every port. Everything here is deterministic grid
 * geometry with no DOM, no Three.js, and no camera — the view projects
 * these points; this module only says where the shapes are.
 *
 * Segments are in the model's own grid coordinates. Bodies are drawn at
 * their authored rest pose on purpose: visual-only animation must never
 * move a collider, so the outline standing still while the picture sways
 * is the invariant shown honestly, not a shortcut.
 */
export interface PhysicalOverlaySegmentV1 {
  readonly kind: 'collider' | 'sensor' | 'port';
  readonly a: readonly [number, number, number];
  readonly b: readonly [number, number, number];
}

/** Straight segments per full circle; enough to read as round at studio sizes. */
const CIRCLE_STEPS = 16;
/** Half the drawn length of each port axis line, in voxel units. */
const PORT_ARM = 0.35;

type Vec3 = readonly [number, number, number];
type Quat = readonly [number, number, number, number];

const IDENTITY_QUAT: Quat = [0, 0, 0, 1];

function rotate(q: Quat, v: Vec3): Vec3 {
  // v' = v + 2q×(q×v + w·v), the standard unit-quaternion rotation.
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;
  const cx = qy * vz - qz * vy + qw * vx;
  const cy = qz * vx - qx * vz + qw * vy;
  const cz = qx * vy - qy * vx + qw * vz;
  return [
    vx + 2 * (qy * cz - qz * cy),
    vy + 2 * (qz * cx - qx * cz),
    vz + 2 * (qx * cy - qy * cx),
  ];
}

function multiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

interface Frame {
  readonly position: Vec3;
  readonly rotation: Quat;
}

function frameOf(pose: PhysicalPoseV1): Frame {
  return { position: pose.position, rotation: pose.rotation ?? IDENTITY_QUAT };
}

/** outer ∘ inner: the inner frame expressed through the outer one. */
function compose(outer: Frame, inner: Frame): Frame {
  const moved = rotate(outer.rotation, inner.position);
  return {
    position: [
      outer.position[0] + moved[0],
      outer.position[1] + moved[1],
      outer.position[2] + moved[2],
    ],
    rotation: multiply(outer.rotation, inner.rotation),
  };
}

function place(frame: Frame, point: Vec3): Vec3 {
  const turned = rotate(frame.rotation, point);
  return [
    frame.position[0] + turned[0],
    frame.position[1] + turned[1],
    frame.position[2] + turned[2],
  ];
}

/** Local-space endpoint pairs for one shape's wireframe. */
function shapeWireframe(shape: PhysicalShapeV1): [Vec3, Vec3][] {
  if (shape.kind === 'box') {
    const [hx, hy, hz] = shape.halfExtents;
    const corner = (sx: number, sy: number, sz: number): Vec3 => [sx * hx, sy * hy, sz * hz];
    const edges: [Vec3, Vec3][] = [];
    for (const sy of [-1, 1]) {
      edges.push(
        [corner(-1, sy, -1), corner(1, sy, -1)],
        [corner(1, sy, -1), corner(1, sy, 1)],
        [corner(1, sy, 1), corner(-1, sy, 1)],
        [corner(-1, sy, 1), corner(-1, sy, -1)],
      );
    }
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) edges.push([corner(sx, -1, sz), corner(sx, 1, sz)]);
    }
    return edges;
  }
  if (shape.kind === 'sphere') {
    const r = shape.radius;
    return [
      ...ring((a) => [r * Math.cos(a), r * Math.sin(a), 0]),
      ...ring((a) => [0, r * Math.cos(a), r * Math.sin(a)]),
      ...ring((a) => [r * Math.cos(a), 0, r * Math.sin(a)]),
    ];
  }
  // Capsule and cylinder both stand along local Y: two rims and four
  // uprights; the capsule adds a half-circle cap arc in each axis plane.
  const { halfHeight, radius } = shape;
  const edges: [Vec3, Vec3][] = [
    ...ring((a) => [radius * Math.cos(a), halfHeight, radius * Math.sin(a)]),
    ...ring((a) => [radius * Math.cos(a), -halfHeight, radius * Math.sin(a)]),
  ];
  for (const [x, z] of [[radius, 0], [-radius, 0], [0, radius], [0, -radius]] as const) {
    edges.push([[x, -halfHeight, z], [x, halfHeight, z]]);
  }
  if (shape.kind === 'capsule') {
    for (const top of [1, -1]) {
      edges.push(
        ...arc((a) => [radius * Math.cos(a), top * (halfHeight + radius * Math.sin(a)), 0]),
        ...arc((a) => [0, top * (halfHeight + radius * Math.sin(a)), radius * Math.cos(a)]),
      );
    }
  }
  return edges;
}

function ring(at: (angle: number) => Vec3): [Vec3, Vec3][] {
  const edges: [Vec3, Vec3][] = [];
  for (let step = 0; step < CIRCLE_STEPS; step += 1) {
    const a = (step / CIRCLE_STEPS) * Math.PI * 2;
    const b = ((step + 1) / CIRCLE_STEPS) * Math.PI * 2;
    edges.push([at(a), at(b)]);
  }
  return edges;
}

/** Half a ring, over angles 0..π — used for capsule cap profiles. */
function arc(at: (angle: number) => Vec3): [Vec3, Vec3][] {
  const steps = CIRCLE_STEPS / 2;
  const edges: [Vec3, Vec3][] = [];
  for (let step = 0; step < steps; step += 1) {
    const a = (step / steps) * Math.PI;
    const b = ((step + 1) / steps) * Math.PI;
    edges.push([at(a), at(b)]);
  }
  return edges;
}

/**
 * Every collider outline and port cross of one compiled model, in grid
 * coordinates, deterministic and in compile order. The view subtracts the
 * drawn frame's middle and projects; nothing here depends on the camera.
 */
export function physicalOverlaySegmentsV1(
  compiled: CompiledPhysicalModelV1,
): readonly PhysicalOverlaySegmentV1[] {
  const bodies = new Map(compiled.bodies.map((body) => [body.key, frameOf(body.pose)]));
  const segments: PhysicalOverlaySegmentV1[] = [];
  for (const collider of compiled.colliders) {
    const body = bodies.get(collider.body);
    if (!body) continue;
    const frame = compose(body, frameOf(collider.pose));
    const kind = collider.role === 'sensor' ? 'sensor' : 'collider';
    for (const [a, b] of shapeWireframe(collider.shape)) {
      segments.push({ kind, a: place(frame, a), b: place(frame, b) });
    }
  }
  for (const port of compiled.ports) {
    const body = bodies.get(port.body);
    if (!body) continue;
    const frame = compose(body, frameOf(port.frame));
    for (const axis of [[1, 0, 0], [0, 1, 0], [0, 0, 1]] as const) {
      const arm: Vec3 = [axis[0] * PORT_ARM, axis[1] * PORT_ARM, axis[2] * PORT_ARM];
      segments.push({
        kind: 'port',
        a: place(frame, [-arm[0], -arm[1], -arm[2]]),
        b: place(frame, arm),
      });
    }
  }
  return segments;
}
