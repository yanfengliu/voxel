export type WindmillVectorV1 = readonly [number, number, number];

export interface WindmillPitchedPlateWindRuleV1 {
  readonly airDensityKilogramsPerCubicMeter: number;
  readonly dragCoefficient: number;
  readonly windVelocityWorldMetersPerSecond: WindmillVectorV1;
}

export interface WindmillPitchedPlateLoadV1 {
  readonly forceWorldNewtons: WindmillVectorV1;
  readonly relativeFlowWorldMetersPerSecond: WindmillVectorV1;
  readonly normalRelativeSpeedMetersPerSecond: number;
  readonly bodyPowerWatts: number;
  readonly prescribedFlowPowerWatts: number;
  readonly slipDissipationWatts: number;
}

function finiteVector(
  value: WindmillVectorV1,
  label: string,
): void {
  if (value.some((entry) => !Number.isFinite(entry))) {
    throw new Error(
      `Cannot evaluate pitched-plate wind load: ${label} `
      + `[${value.join(', ')}] contains a non-finite component.`,
    );
  }
}

function dot(left: WindmillVectorV1, right: WindmillVectorV1): number {
  return left.reduce((sum, value, axis) =>
    sum + value * right[axis]!, 0);
}

/**
 * Quasi-steady, two-sided normal drag on one declared flat plate.
 *
 * This is a bounded blade-element surrogate, not CFD: it has no wake,
 * turbulence, induced flow, stall history, elasticity, or blade interaction.
 * The visible candidate owns the plate centroid, area, and pitched unit normal.
 */
export function windmillPitchedPlateLoadV1(
  rule: WindmillPitchedPlateWindRuleV1,
  plateAreaSquareMeters: number,
  plateNormalWorld: WindmillVectorV1,
  platePointVelocityWorldMetersPerSecond: WindmillVectorV1,
): WindmillPitchedPlateLoadV1 {
  const density = rule.airDensityKilogramsPerCubicMeter;
  const coefficient = rule.dragCoefficient;
  if (!Number.isFinite(density) || density <= 0) {
    throw new Error(
      `Cannot evaluate pitched-plate wind load with air density `
      + `${String(density)} kg/m^3; expected a finite value above zero.`,
    );
  }
  if (!Number.isFinite(coefficient) || coefficient <= 0) {
    throw new Error(
      `Cannot evaluate pitched-plate wind load with drag coefficient `
      + `${String(coefficient)}; expected a finite dimensionless value above zero.`,
    );
  }
  if (!Number.isFinite(plateAreaSquareMeters)
    || plateAreaSquareMeters <= 0) {
    throw new Error(
      `Cannot evaluate pitched-plate wind load with plate area `
      + `${String(plateAreaSquareMeters)} m^2; expected a finite value above zero.`,
    );
  }
  finiteVector(rule.windVelocityWorldMetersPerSecond, 'world wind velocity');
  finiteVector(plateNormalWorld, 'plate normal');
  finiteVector(
    platePointVelocityWorldMetersPerSecond,
    'plate-point velocity',
  );
  const normalLength = Math.hypot(...plateNormalWorld);
  if (Math.abs(normalLength - 1) > 1e-9) {
    throw new Error(
      `Cannot evaluate pitched-plate wind load with normal length `
      + `${String(normalLength)}; the visible plate frame must provide an exact `
      + 'unit normal within 1e-9.',
    );
  }
  const relativeFlow = rule.windVelocityWorldMetersPerSecond.map(
    (value, axis) => value - platePointVelocityWorldMetersPerSecond[axis]!,
  ) as [number, number, number];
  const normalSpeed = dot(relativeFlow, plateNormalWorld);
  const scalarForce = 0.5 * density * coefficient
    * plateAreaSquareMeters * normalSpeed * Math.abs(normalSpeed);
  const force = plateNormalWorld.map(
    (value) => value * scalarForce,
  ) as [number, number, number];
  const bodyPower = dot(force, platePointVelocityWorldMetersPerSecond);
  const flowPower = dot(force, rule.windVelocityWorldMetersPerSecond);
  const slipDissipation = dot(force, relativeFlow);
  if (slipDissipation < -1e-9) {
    throw new Error(
      `Pitched-plate wind law produced ${String(slipDissipation)} W of negative `
      + 'slip dissipation; check the two-sided drag sign and unit normal.',
    );
  }
  return {
    forceWorldNewtons: force,
    relativeFlowWorldMetersPerSecond: relativeFlow,
    normalRelativeSpeedMetersPerSecond: normalSpeed,
    bodyPowerWatts: bodyPower,
    prescribedFlowPowerWatts: flowPower,
    slipDissipationWatts: Math.max(0, slipDissipation),
  };
}
