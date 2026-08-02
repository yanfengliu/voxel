import {
  canonicalRiverfallFluidInputJsonV1,
  type RiverfallFluidConfigV1,
} from './riverfall-fluid-config.js';
import type { RiverfallFluidStateV1 } from './riverfall-pbf.js';
import { decodeFloat32LittleEndianV1 } from './scene-pose-replay-codec.js';

export interface EncodedRiverfallFluidWarmStateV1 {
  readonly schemaVersion: string;
  readonly solver: {
    readonly name: string;
    readonly version: string;
    readonly numericMode: string;
  };
  readonly particleCount: number;
  readonly burnInSubsteps: number;
  readonly inputHash: string;
  readonly canonicalInputJson: string;
  readonly longitudinalBase64: string;
  readonly lateralBase64: string;
  readonly longitudinalVelocityBase64: string;
  readonly lateralVelocityBase64: string;
}

/**
 * Restores the solver's deterministic frame-zero state.
 *
 * This is an initial condition, not a motion trace: the browser owns a fresh
 * copy and every later state is produced by live PBF steps. Baking the fixed
 * 16-second warm-up keeps scene opening from doing 3,200 solver steps on the
 * main thread while the generation pin still proves where the state came from.
 */
export function decodeRiverfallFluidWarmStateV1(
  encoded: EncodedRiverfallFluidWarmStateV1,
  config: RiverfallFluidConfigV1,
): RiverfallFluidStateV1 {
  const failures: string[] = [];
  if (encoded.schemaVersion !== 'studio.riverfall-fluid-warm-state/1') {
    failures.push(`schema ${JSON.stringify(encoded.schemaVersion)}`);
  }
  if (encoded.solver.name !== config.solver.name
    || encoded.solver.version !== config.solver.version
    || encoded.solver.numericMode !== config.solver.numericMode) {
    failures.push(
      `solver ${encoded.solver.name} ${encoded.solver.version} ${encoded.solver.numericMode}`,
    );
  }
  if (encoded.particleCount !== config.particles.count) {
    failures.push(
      `${String(encoded.particleCount)} particles instead of ${String(config.particles.count)}`,
    );
  }
  if (encoded.burnInSubsteps !== config.recording.burnInSubsteps) {
    failures.push(
      `${String(encoded.burnInSubsteps)} burn-in substeps instead of ${String(config.recording.burnInSubsteps)}`,
    );
  }
  if (!/^sha256:[0-9a-f]{64}$/u.test(encoded.inputHash)) {
    failures.push(`input hash ${JSON.stringify(encoded.inputHash)}`);
  }
  if (encoded.canonicalInputJson
    !== canonicalRiverfallFluidInputJsonV1(config)) {
    failures.push('canonical input JSON differs from the live configuration');
  }
  if (failures.length > 0) {
    throw new Error(
      'Cannot restore the generated Riverfall warm state because it does not match the live solver: '
      + `${failures.join('; ')}. Regenerate it from the canonical consumer fixture.`,
    );
  }
  const count = config.particles.count;
  return {
    longitudinal: decodeFloat32LittleEndianV1(
      encoded.longitudinalBase64,
      count,
      'Riverfall warm-state longitudinalBase64',
    ),
    lateral: decodeFloat32LittleEndianV1(
      encoded.lateralBase64,
      count,
      'Riverfall warm-state lateralBase64',
    ),
    longitudinalVelocity: decodeFloat32LittleEndianV1(
      encoded.longitudinalVelocityBase64,
      count,
      'Riverfall warm-state longitudinalVelocityBase64',
    ),
    lateralVelocity: decodeFloat32LittleEndianV1(
      encoded.lateralVelocityBase64,
      count,
      'Riverfall warm-state lateralVelocityBase64',
    ),
  };
}
