import { describe, expect, it } from 'vitest';
import { OrthographicCamera, Vector3 } from 'three';

import {
  applyOrbit,
  clampOrbit,
  DEFAULT_ORBIT,
  describeOrbit,
  dragOrbit,
  zoomOrbit,
} from './orbit.js';

describe('the stage camera', () => {
  it('always looks at the model, from every angle', () => {
    const camera = new OrthographicCamera();
    for (const yaw of [0, 90, 180, 270, 37]) {
      for (const pitch of [-60, 0, 30, 80]) {
        applyOrbit(camera, { yawDegrees: yaw, pitchDegrees: pitch, viewHeight: 14 }, 800, 600);
        // The camera's forward direction must point from its position to the
        // origin — that is what "looking at the model" means.
        const forward = camera.getWorldDirection(new Vector3());
        const toOrigin = camera.position.clone().negate().normalize();
        expect(forward.x).toBeCloseTo(toOrigin.x, 5);
        expect(forward.y).toBeCloseTo(toOrigin.y, 5);
        expect(forward.z).toBeCloseTo(toOrigin.z, 5);
      }
    }
  });

  it('is the same camera for the same angles, every time', () => {
    const a = new OrthographicCamera();
    const b = new OrthographicCamera();
    applyOrbit(a, { yawDegrees: 123, pitchDegrees: 21, viewHeight: 10 }, 640, 480);
    applyOrbit(b, { yawDegrees: 123, pitchDegrees: 21, viewHeight: 10 }, 640, 480);
    expect(a.position.toArray()).toEqual(b.position.toArray());
    expect(a.projectionMatrix.toArray()).toEqual(b.projectionMatrix.toArray());
  });

  it('never lets the view flip over the top or under the floor', () => {
    expect(clampOrbit({ yawDegrees: 0, pitchDegrees: 200, viewHeight: 14 }).pitchDegrees).toBe(85);
    expect(clampOrbit({ yawDegrees: 0, pitchDegrees: -200, viewHeight: 14 }).pitchDegrees).toBe(-85);
  });

  it('wraps a full turn of dragging back around', () => {
    expect(clampOrbit({ yawDegrees: 725, pitchDegrees: 0, viewHeight: 14 }).yawDegrees).toBe(5);
    expect(clampOrbit({ yawDegrees: -90, pitchDegrees: 0, viewHeight: 14 }).yawDegrees).toBe(270);
  });

  it('drags right to look around, up to look higher', () => {
    const dragged = dragOrbit(DEFAULT_ORBIT, -40, 20);
    expect(dragged.yawDegrees).toBeGreaterThan(DEFAULT_ORBIT.yawDegrees);
    expect(dragged.pitchDegrees).toBeGreaterThan(DEFAULT_ORBIT.pitchDegrees);
  });

  it('zooms within sane bounds', () => {
    const closest = zoomOrbit({ ...DEFAULT_ORBIT, viewHeight: 4 }, -30);
    const farthest = zoomOrbit({ ...DEFAULT_ORBIT, viewHeight: 60 }, 30);
    expect(closest.viewHeight).toBe(3);
    expect(farthest.viewHeight).toBe(80);
  });

  it('names the view in words for the corner chip', () => {
    expect(describeOrbit({ yawDegrees: 45, pitchDegrees: 30, viewHeight: 14 }))
      .toBe('front-left · 30° up');
    expect(describeOrbit({ yawDegrees: 180, pitchDegrees: -15, viewHeight: 14 }))
      .toBe('back · 15° down');
  });
});
