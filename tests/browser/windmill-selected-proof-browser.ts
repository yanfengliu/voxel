import { expect, type Page } from '@playwright/test';

import {
  WINDMILL_COMPACT_EVALUATOR_DECLARATION_V1,
} from '../../fixtures/windmill-consumer/windmill-compact-evaluator-config.js';
import {
  WINDMILL_COMPACT_SELECTION_ENUMERATION_FINGERPRINT_V1,
  WINDMILL_COMPACT_SELECTION_MANIFEST_SHA256_V1,
  WINDMILL_COMPACT_SELECTION_SEARCH_EVIDENCE_SHA256_V1,
  WINDMILL_COMPACT_SELECTION_SHA256_V1,
  WINDMILL_COMPACT_SELECTED_PARAMETER_KEY_V1,
  WINDMILL_COMPACT_SELECTED_PROOF_NOMINAL_EVALUATION_SHA256_V1,
  WINDMILL_COMPACT_SELECTED_PROOF_SHA256_V1,
  WINDMILL_COMPACT_SELECTED_SEARCH_EVALUATION_SHA256_V1,
} from '../../tools/studio/windmill-compact-selection.js';
import {
  WINDMILL_RECIPE_IDS_V1,
  WINDMILL_REPLAY_DURATION_MS,
  WINDMILL_REPLAY_FRAME_COUNT,
  WINDMILL_SIMULATION_DURATION_MS,
} from '../../tools/studio/windmill-layout.js';
import {
  WINDMILL_INTENDED_VIEW_PROOF_V1,
} from '../../tools/studio/windmill-intended-view-proof.js';
import {
  WINDMILL_REPLAY_ID,
  WINDMILL_SCENE_ID,
  WINDMILL_TRACK_IDS,
  inspectWindmillPurposeEvidence,
  mountWindmillStudio,
  readGeneratedWindmillEvidence,
  setWindmillViewCenter,
} from './windmill-browser-support.js';

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const LAW_LABELS = [
  'gravity:uniform-newtonian',
  'wind:two-sided-relative-velocity-flat-plate-drag',
  'joint:passive-revolute-constraint',
  'contact:rapier-impulse-manifold',
] as const;
const CAPABILITY_LABELS = [
  'two-sail-pitched-wind-rotor',
  'dual-cam-trip-hammer',
  'finite-deterministic-observation',
] as const;

export async function verifyWindmillSelectedPhysicalProof(
  page: Page,
  studioOrigin: string,
): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const mounted = await mountWindmillStudio(page, studioOrigin);
  const generated = await readGeneratedWindmillEvidence(page);
  const purpose = await inspectWindmillPurposeEvidence(page);

  expect(mounted.scene).toMatchObject({
    schemaVersion: 'studio.scene/4',
    id: WINDMILL_SCENE_ID,
    label: 'Wind-powered trip mill',
    poseReplay: {
      id: WINDMILL_REPLAY_ID,
      durationMs: WINDMILL_REPLAY_DURATION_MS,
    },
  });
  expect(mounted.placementIds).toEqual(WINDMILL_TRACK_IDS);
  expect(mounted.trackIds).toEqual(WINDMILL_TRACK_IDS);
  expect(mounted.privateCanvases).toBe(2);
  expect(mounted.defaultCamera.center[1]).toBe(0);
  const movedCenter = await setWindmillViewCenter(page, [
    mounted.defaultCamera.center[0] + 0.25,
    0,
    mounted.defaultCamera.center[2] - 0.25,
  ]);
  expect(movedCenter).toEqual([
    mounted.defaultCamera.center[0] + 0.25,
    0,
    mounted.defaultCamera.center[2] - 0.25,
  ]);
  expect(mounted.initial.sceneRender).toMatchObject({
    instances: 4,
    animatedBatches: 0,
    animatedInstances: 0,
  });
  expect(mounted.initial.sceneRender?.drawCalls).toBeGreaterThan(0);
  expect(mounted.initial.sceneRender?.triangles).toBeGreaterThan(0);

  expect(generated).toMatchObject({
    replayId: WINDMILL_REPLAY_ID,
    sceneId: WINDMILL_SCENE_ID,
    playback: 'once',
    frameCount: WINDMILL_REPLAY_FRAME_COUNT,
    durationMs: WINDMILL_REPLAY_DURATION_MS,
    trackIds: WINDMILL_TRACK_IDS,
    provenance: {
      solver: { name: '@dimforge/rapier3d-compat', version: '0.19.3' },
      fixedTimestepMs: 1000 / 60,
      gravity: [0, -9.81, 0],
      inputHash: expect.stringMatching(HASH_PATTERN),
      finalHash: expect.stringMatching(HASH_PATTERN),
      lawLabels: LAW_LABELS,
      capabilityLabels: CAPABILITY_LABELS,
    },
    selection: {
      candidateParameterKey: WINDMILL_COMPACT_SELECTED_PARAMETER_KEY_V1,
      enumerationFingerprint:
        WINDMILL_COMPACT_SELECTION_ENUMERATION_FINGERPRINT_V1,
      selectionManifestSha256:
        WINDMILL_COMPACT_SELECTION_MANIFEST_SHA256_V1,
      searchEvidenceSha256:
        WINDMILL_COMPACT_SELECTION_SEARCH_EVIDENCE_SHA256_V1,
      selectedSearchEvaluationSha256:
        WINDMILL_COMPACT_SELECTED_SEARCH_EVALUATION_SHA256_V1,
      selectedProofNominalEvaluationSha256:
        WINDMILL_COMPACT_SELECTED_PROOF_NOMINAL_EVALUATION_SHA256_V1,
      selectedProofSha256:
        WINDMILL_COMPACT_SELECTED_PROOF_SHA256_V1,
      selectionSha256: WINDMILL_COMPACT_SELECTION_SHA256_V1,
    },
    recordProfile: {
      solverStepSeconds: 1 / 960,
      recordStepSeconds: 1 / 60,
      solverTicksPerRecordedFrame: 16,
      physicalDurationSeconds: WINDMILL_SIMULATION_DURATION_MS / 1_000,
      presentationDurationMs: WINDMILL_REPLAY_DURATION_MS,
      frameCount: WINDMILL_REPLAY_FRAME_COUNT,
    },
  });
  expect(generated.candidateResult.parameterKey)
    .toBe(WINDMILL_COMPACT_SELECTED_PARAMETER_KEY_V1);
  expect(generated.candidateResult.provenance.combinedEvaluationSha256)
    .toBe(WINDMILL_COMPACT_SELECTED_PROOF_NOMINAL_EVALUATION_SHA256_V1);
  expect(generated.provenance.inputHash)
    .toBe(`sha256:${generated.candidateResult.provenance.effectiveInputSha256}`);
  expect(generated.candidateResult.diagnostics.output).toEqual({
    failedGateIds: [],
    minimumCycles:
      WINDMILL_COMPACT_EVALUATOR_DECLARATION_V1.gates.minimumCausalCycles,
    qualifyingCycles: 5,
  });

  expect(generated.evidence.failedGateIds).toEqual([]);
  expect(generated.evidence.completedCausalCycles).toBe(5);
  expect(generated.evidence.cycleRecords).toHaveLength(5);
  expect(generated.evidence.qualifiedCausalCyclesByNose).toEqual({
    'rotor-cam-nose': 2,
    'rotor-opposed-cam-nose': 3,
  });
  expect(generated.evidence.effectiveRun).toMatchObject({
    durationSeconds: 12,
    gravityMultiplier: 1,
    windEnabled: true,
    camContactEnabled: true,
    anvilContactEnabled: true,
    numericalProfile: {
      id: 'dt960-f45-o8-p2-c1',
      fixedStepSeconds: 1 / 960,
    },
  });
  const gates = WINDMILL_COMPACT_EVALUATOR_DECLARATION_V1.gates;
  expect(generated.evidence.maximumHeadLiftMeters)
    .toBeGreaterThanOrEqual(gates.minimumHeadLiftMeters);
  expect(generated.evidence.maximumRotorAngularSpeedRadiansPerSecond)
    .toBeLessThanOrEqual(gates.maximumRotorAngularSpeedRadiansPerSecond);
  expect(generated.evidence.maximumCamFollowerPenetrationMeters)
    .toBeLessThanOrEqual(gates.maximumCamFollowerPenetrationMeters);
  expect(generated.evidence.maximumHeadAnvilPenetrationMeters)
    .toBeLessThanOrEqual(gates.maximumHeadAnvilPenetrationMeters);
  expect(generated.evidence.maximumUnaccountedEnergyCreationJoules)
    .toBeLessThanOrEqual(
      gates.maximumUnaccountedEnergyCreationAbsoluteJoules,
    );
  expect(generated.contacts).toHaveLength(10);
  expect(generated.contacts.filter(({ kind }) => kind === 'cam-contact'))
    .toHaveLength(5);
  expect(generated.contacts.filter(({ kind }) => kind === 'anvil-impact'))
    .toHaveLength(5);
  expect(generated.contacts.every(({ normalImpulse }) => normalImpulse > 0))
    .toBe(true);
  expect(generated.events.map(({ id }) => id))
    .toEqual(generated.contacts.map(({ id }) => id));

  expect(purpose.summary).toMatch(/two opposite pitched stepped sail plates/i);
  expect([
    purpose.frame.label,
    purpose.rotor.label,
    purpose.hammer.label,
    purpose.anvil.label,
  ]).toEqual([
    'Windmill bearing frame',
    'Two-sail pitched wind rotor',
    'Gravity trip hammer',
    'Grounded anvil',
  ]);
  expect(purpose.frame.bodies).toEqual([
    expect.objectContaining({ type: 'fixed' }),
  ]);
  expect(purpose.rotor.bodies).toEqual([
    expect.objectContaining({ type: 'dynamic' }),
  ]);
  expect(purpose.hammer.bodies).toEqual([
    expect.objectContaining({ type: 'dynamic' }),
  ]);
  expect(purpose.anvil.bodies).toEqual([
    expect.objectContaining({ type: 'fixed' }),
  ]);
  expect(purpose.frame.minimumOccupiedWorldY).toBe(0);
  expect(purpose.anvil.minimumOccupiedWorldY).toBe(0);
  expect(purpose.frame.bearingVoxels).toBeGreaterThan(0);
  expect(purpose.rotor.sailComponents).toBe(2);
  expect(purpose.rotor.sailVoxels).toBeGreaterThan(0);
  expect(purpose.hammer.hammerHeadVoxels).toBeGreaterThan(0);
  expect(purpose.anvil.anvilFaceVoxels).toBeGreaterThan(0);

  const assets = [
    purpose.frame,
    purpose.rotor,
    purpose.hammer,
    purpose.anvil,
  ];
  for (const asset of assets) {
    expect(asset.colliderCount).toBe(asset.boxKeys.length);
    expect(asset.colliders.every(({ boxKey }) => boxKey !== null)).toBe(true);
    expect(new Set(asset.colliders.map(({ boxKey }) => boxKey)))
      .toEqual(new Set(asset.boxKeys));
  }
  const allBoxKeys = assets.flatMap(({ boxKeys }) => boxKeys);
  expect(new Set(purpose.purposeLedger.map(({ boxKey }) => boxKey)))
    .toEqual(new Set(allBoxKeys));
  expect(purpose.purposeLedger).toHaveLength(allBoxKeys.length);
  expect(new Set(purpose.purposeLedger.map(({ id }) => id)).size)
    .toBe(purpose.purposeLedger.length);
  for (const entry of purpose.purposeLedger) {
    expect(entry.id).toBe(`windmill:purpose-record:${entry.boxKey}`);
    expect(entry.needId).toMatch(/^windmill:purpose:/);
    for (const field of [
      'beneficiary',
      'job',
      'locationDatum',
      'removalFailure',
      'relocationFailure',
      'smallestAdequateForm',
      'evidence',
      'honestyBoundary',
    ] as const) {
      expect(entry[field].trim().length, `${entry.boxKey}:${field}`)
        .toBeGreaterThan(20);
    }
    expect(entry.selectedDynamicProof, entry.boxKey).toBeNull();
    expect(entry.boxes, entry.boxKey).toHaveLength(1);
    expect(entry.boxes[0]?.boxKey, entry.boxKey).toBe(entry.boxKey);
    expect(entry.appearance.intendedViewProof, entry.boxKey)
      .toEqual(WINDMILL_INTENDED_VIEW_PROOF_V1);
    expect(
      entry.appearance.intendedViewProof?.browserTestFile,
      entry.boxKey,
    ).toBe('tests/browser/model-studio-windmill-assets.spec.ts');
    expect(
      entry.appearance.intendedViewProof?.minimumChangedPixelFraction,
      entry.boxKey,
    ).toBe(WINDMILL_INTENDED_VIEW_PROOF_V1.minimumChangedPixelFraction);
    expect(
      entry.appearance.intendedViewProof?.minimumChangedChannelDelta,
      entry.boxKey,
    ).toBe(WINDMILL_INTENDED_VIEW_PROOF_V1.minimumChangedChannelDelta);
  }
  expect(purpose.systemPurposeLedger.length).toBeGreaterThanOrEqual(7);
  expect(purpose.systemPurposeLedger.every((entry) =>
    entry.beneficiary.length > 20
    && entry.job.length > 20
    && entry.locationDatum.length > 20
    && entry.removalFailure.length > 20
    && entry.relocationFailure.length > 20
    && entry.smallestAdequateForm.length > 20
    && entry.evidence.length > 20
    && entry.honestyBoundary.length > 20
    && entry.selectedDynamicProof === null)).toBe(true);
  expect(purpose.systemDynamicProofBinding).toMatchObject({
    candidateParameterKey: WINDMILL_COMPACT_SELECTED_PARAMETER_KEY_V1,
    nominalEvaluationSha256:
      WINDMILL_COMPACT_SELECTED_PROOF_NOMINAL_EVALUATION_SHA256_V1,
    proofSha256: WINDMILL_COMPACT_SELECTED_PROOF_SHA256_V1,
    selectionSha256: WINDMILL_COMPACT_SELECTION_SHA256_V1,
  });
  expect(purpose.systemDynamicProofBinding.establishes.length)
    .toBeGreaterThanOrEqual(3);
  expect(purpose.systemDynamicProofBinding.honestyBoundary.length)
    .toBeGreaterThan(80);
  expect(JSON.stringify(purpose).toLowerCase())
    .not.toMatch(/counterweight|ornament|four[- ]sail/);
  expect(purpose.frame.ports.map(({ key }) => key))
    .toEqual(expect.arrayContaining([
      'frame-rotor-axis',
      'frame-hammer-axis',
    ]));
  expect(purpose.rotor.ports.map(({ key }) => key))
    .toEqual(expect.arrayContaining([
      'rotor-axis',
      'north-sail-load',
      'south-sail-load',
    ]));
  expect(purpose.hammer.ports.map(({ key }) => key))
    .toContain('hammer-axis');
  expect(purpose.contactEvents).toHaveLength(10);
  expect(purpose.contactEvents.every((event) =>
    event.type === 'contact' && event.normalImpulse > 0)).toBe(true);
  for (const contact of generated.contacts) {
    const replayEvent = purpose.contactEvents.find(
      ({ id }) => id === contact.id,
    );
    expect(replayEvent).toEqual({
      id: contact.id,
      timeMs:
        contact.tick * generated.recordProfile.solverStepSeconds * 1_000,
      type: 'contact',
      placementId: contact.primaryPlacementId,
      otherPlacementId: contact.otherPlacementId,
      point: contact.point,
      normal: contact.normal,
      normalImpulse: contact.normalImpulse,
    });
  }

  expect(new Set(assets.map(({ recipeId }) => recipeId))).toEqual(new Set(
    Object.values(WINDMILL_RECIPE_IDS_V1),
  ));

  const root = page.locator('[data-windmill-focused]');
  await root.locator('[data-studio-tab="edit"]').click();
  await expect(root.getByText(
    'This scene is driven by a consumer-supplied pose replay and is read-only in Studio.',
    { exact: false },
  )).toBeVisible();
  await expect(root.locator('.scene-editor')).toBeHidden();
  const rejected = await page.evaluate(() => {
    const focused = window as Window & {
      windmillFocused?: {
        readonly harness: NonNullable<Window['voxelStudio']>;
      };
    };
    const harness = focused.windmillFocused?.harness;
    if (harness === undefined) {
      throw new Error('the focused Windmill mount disappeared');
    }
    const before = structuredClone(harness.sceneState());
    if (before === null) {
      throw new Error('the focused Windmill scene state is absent');
    }
    let selectError = '';
    let editError = '';
    try {
      harness.selectPlacement('windmill-rotor');
    } catch (error) {
      selectError = String(error);
    }
    try {
      harness.editScene({
        ...before,
        placements: before.placements.map((placement) =>
          placement.id === 'windmill-rotor'
            ? {
                ...placement,
                at: [
                  placement.at[0] + 1,
                  placement.at[1],
                  placement.at[2],
                ],
              }
            : placement),
      });
    } catch (error) {
      editError = String(error);
    }
    return {
      before,
      after: harness.sceneState(),
      selected: harness.selectedPlacement(),
      selectError,
      editError,
      status:
        document.querySelector('[data-windmill-focused] .status')
          ?.textContent ?? '',
      statusTitle: document.querySelector<HTMLElement>(
        '[data-windmill-focused] .status',
      )?.title ?? '',
    };
  });
  expect(rejected.after).toEqual(rejected.before);
  expect(rejected.selected).toBeNull();
  expect(rejected.selectError).toContain('is read-only in Studio');
  expect(rejected.editError)
    .toContain('would diverge authored scene data or selection');
  expect(rejected.status).toContain('consumer replay');
  expect(rejected.status).toContain('read-only');
  expect(rejected.statusTitle).toContain('@dimforge/rapier3d-compat 0.19.3');
  expect(rejected.statusTitle).toContain('input sha256:');
  expect(rejected.statusTitle).toContain('final sha256:');
  expect(errors).toEqual([]);
}
