import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  createWindmillCompactCycleTrackerV1,
  type WindmillCompactCycleObservationV1,
} from './windmill-compact-cycle-tracker.js';

function observation(
  tick: number,
  overrides: Partial<WindmillCompactCycleObservationV1> = {},
): WindmillCompactCycleObservationV1 {
  return {
    tick,
    activeCamNoseKey: null,
    headLiftMeters: 0,
    previousHeadSpeedMetersPerSecond: 0,
    headSpeedMetersPerSecond: 0,
    impactImpulseNewtonSeconds: 0,
    ...overrides,
  };
}

describe('compact windmill causal-cycle tracker', () => {
  it('abandons an unlifted contact instead of joining later revolutions', () => {
    const tracker = createWindmillCompactCycleTrackerV1();
    tracker.observe(observation(1, {
      activeCamNoseKey: 'rotor-cam-nose',
    }));
    tracker.observe(observation(2));
    tracker.observe(observation(3, { headLiftMeters: 0.4 }));
    expect(tracker.activeAttempt()).toBeNull();
    tracker.observe(observation(4, {
      activeCamNoseKey: 'rotor-opposed-cam-nose',
      headLiftMeters: 0.4,
      headSpeedMetersPerSecond: 0.3,
    }));
    expect(tracker.activeAttempt()).toBeNull();
    tracker.observe(observation(5, { headLiftMeters: 0.1 }));
    tracker.observe(observation(6, {
      activeCamNoseKey: 'rotor-opposed-cam-nose',
      headLiftMeters: 0.1,
    }));
    tracker.observe(observation(7, {
      activeCamNoseKey: 'rotor-opposed-cam-nose',
      headLiftMeters: 0.4,
      headSpeedMetersPerSecond: 0.3,
    }));
    expect(tracker.activeAttempt()).toMatchObject({
      camContactTick: 6,
      camNoseKey: 'rotor-opposed-cam-nose',
      preContactHeadLiftMeters: 0.1,
      liftTick: 7,
    });
  });

  it('invalidates a released attempt if the cam recontacts before impact', () => {
    const tracker = createWindmillCompactCycleTrackerV1();
    tracker.observe(observation(1, {
      activeCamNoseKey: 'rotor-cam-nose',
    }));
    const raisedContact = tracker.observe(observation(2, {
      activeCamNoseKey: 'rotor-cam-nose',
      headLiftMeters: 0.4,
      headSpeedMetersPerSecond: 1,
    }));
    expect(raisedContact.qualifyingCamCausedLift).toBe(true);
    tracker.observe(observation(3, {
      headLiftMeters: 0.5,
      previousHeadSpeedMetersPerSecond: 1,
      headSpeedMetersPerSecond: 0.8,
    }));
    tracker.observe(observation(4, {
      activeCamNoseKey: 'rotor-opposed-cam-nose',
      headLiftMeters: 0.5,
      previousHeadSpeedMetersPerSecond: 0.8,
      headSpeedMetersPerSecond: 0.6,
    }));
    expect(tracker.records()).toEqual([]);
    expect(tracker.activeAttempt()).toBeNull();
  });

  it('does not credit a newly contacting cam for an already raised head', () => {
    const tracker = createWindmillCompactCycleTrackerV1();
    tracker.observe(observation(1, {
      headLiftMeters: 0.4,
      headSpeedMetersPerSecond: 0.2,
    }));
    const raisedContact = tracker.observe(observation(2, {
      activeCamNoseKey: 'rotor-cam-nose',
      headLiftMeters: 0.45,
      headSpeedMetersPerSecond: 0.2,
    }));
    expect(raisedContact.qualifyingCamCausedLift).toBe(false);
    tracker.observe(observation(3, {
      activeCamNoseKey: 'rotor-cam-nose',
      headLiftMeters: 0.6,
      headSpeedMetersPerSecond: 0.2,
    }));
    expect(tracker.activeAttempt()).toBeNull();
    expect(tracker.records()).toEqual([]);
  });

  it('attributes completed work independently to both opposed noses', () => {
    const tracker = createWindmillCompactCycleTrackerV1();
    const completeCycle = (
      firstTick: number,
      activeCamNoseKey:
        'rotor-cam-nose' | 'rotor-opposed-cam-nose',
    ) => {
      tracker.observe(observation(firstTick, { activeCamNoseKey }));
      tracker.observe(observation(firstTick + 1, {
        activeCamNoseKey,
        headLiftMeters: 0.3,
        headSpeedMetersPerSecond: 0.3,
      }));
      tracker.observe(observation(firstTick + 2, {
        headLiftMeters: 0.5,
        previousHeadSpeedMetersPerSecond: 0.3,
        headSpeedMetersPerSecond: 0.2,
      }));
      tracker.observe(observation(firstTick + 3, {
        headLiftMeters: 0.6,
        previousHeadSpeedMetersPerSecond: 0.2,
      }));
      tracker.observe(observation(firstTick + 4, {
        headLiftMeters: 0.4,
        headSpeedMetersPerSecond: -0.2,
      }));
      tracker.observe(observation(firstTick + 5, {
        headSpeedMetersPerSecond: -0.3,
        impactImpulseNewtonSeconds: 0.01,
      }));
    };
    completeCycle(1, 'rotor-cam-nose');
    completeCycle(7, 'rotor-opposed-cam-nose');
    expect(tracker.records().map(({ camNoseKey }) => camNoseKey)).toEqual([
      'rotor-cam-nose',
      'rotor-opposed-cam-nose',
    ]);
  });
});
