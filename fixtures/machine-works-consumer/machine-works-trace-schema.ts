import type { MachineWorksTrackIdV1 } from './machine-works-fixture-config.js';
import type { MachineWorksBeltCounterfactualV1 } from './machine-works-conveyor-counterfactual.js';
import type { MachineWorksOutputDockHandoffEvidenceV1 } from './machine-works-output-dock-sweep.js';

export type MachineWorksEventKindV1 = 'assembled' | 'released' | 'contact' | 'collected';

interface MachineWorksEventBaseV1 {
  readonly tick: number;
  readonly bodyIds: readonly string[];
}

export type MachineWorksEventV1 =
  | (MachineWorksEventBaseV1 & { readonly kind: 'assembled' | 'released' | 'collected' })
  | (MachineWorksEventBaseV1 & {
      readonly kind: 'contact';
      readonly point: readonly [number, number, number];
      readonly normal: readonly [number, number, number];
      readonly normalImpulse: number;
    });

export interface MachineWorksTraceProvenanceV1 {
  readonly solver: { readonly name: string; readonly version: string };
  readonly fixedTimestepMs: number;
  readonly gravity: readonly [number, number, number];
  readonly inputHash: string;
  readonly finalHash: string;
  readonly lawLabels: readonly string[];
  readonly capabilityLabels: readonly string[];
}

export interface MachineWorksAttachmentEvidenceV1 {
  readonly attachment: 'core-to-base' | 'cap-to-core';
  readonly mergeTick: number;
  readonly qualifyingTicks: number;
  readonly requiredTicks: number;
  /** World-space translation applied when replacing the live body with canonical colliders. */
  readonly positionCorrection: number;
  /** Shortest quaternion angle applied at replacement, in radians. */
  readonly orientationCorrection: number;
  readonly maximumPenetration: number;
  readonly allowedPenetration: number;
}

export interface MachineWorksTraceV1 {
  readonly fixedStepMs: number;
  readonly durationMs: number;
  readonly frameCount: number;
  readonly placementIds: readonly MachineWorksTrackIdV1[];
  readonly translations: Float32Array;
  readonly rotations: Float32Array;
  readonly linearVelocities: Float32Array;
  readonly angularVelocities: Float32Array;
  readonly assemblyStates: Uint8Array;
  /** One when Rapier reports an active solver contact between carriage and product. */
  readonly supportContacts: Uint8Array;
  /** One when the dynamic carrier touches at least one exact moving belt slat. */
  readonly beltContacts: Uint8Array;
  /** Integrated closed-loop belt distance and commanded speed for each fixed frame. */
  readonly beltTravel: Float32Array;
  readonly beltSpeeds: Float32Array;
  /** Same conveyor, carrier, and load geometry with the named cause removed. */
  readonly zeroDriveCounterfactual: MachineWorksBeltCounterfactualV1;
  readonly zeroFrictionCounterfactual: MachineWorksBeltCounterfactualV1;
  /** Consecutive in-tolerance fixed ticks observed before each compound merge. */
  readonly attachmentEvidence: readonly MachineWorksAttachmentEvidenceV1[];
  readonly outputDockEvidence: MachineWorksOutputDockHandoffEvidenceV1;
  readonly events: readonly MachineWorksEventV1[];
  readonly provenance: MachineWorksTraceProvenanceV1;
  readonly inputHash: string;
  readonly finalHash: string;
}
