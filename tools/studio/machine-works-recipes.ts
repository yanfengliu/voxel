import { partStepV1 } from './contrast-recipe-steps.js';
import type {
  PartSettingsV1,
  PartStepV1,
  RecipeBookV1,
  RecipeStepV1,
  RecipeV1,
} from './recipe.js';
import type {
  MachineWorksMechanicalRelationshipV1,
  MachineWorksRelationshipVerbV1,
} from './machine-works-purpose.js';

/**
 * Game-neutral pieces for composing an assembly-line study. These recipes
 * describe visible construction only; scene or game code remains responsible
 * for movement, contact, gravity, and assembly state.
 */

const MACHINE_COLORS = {
  empty: { r: 0, g: 0, b: 0 },
  structure: { r: 105, g: 124, b: 137 },
  wear: { r: 42, g: 48, b: 53 },
  safety: { r: 229, g: 145, b: 43 },
  product: { r: 70, g: 151, b: 165 },
  detail: { r: 218, g: 213, b: 190 },
} as const;

type MachineRole = keyof typeof MACHINE_COLORS;

interface MachineRecipeSpec {
  readonly id: string;
  readonly label: string;
  readonly seed: number;
  readonly size: readonly [number, number, number];
  readonly summary: string;
  readonly tags: readonly string[];
  readonly roles: readonly MachineRole[];
  readonly steps: readonly RecipeStepV1[];
}

export type MachineWorksStepPurposeIdV1 =
  `machine-works:step-purpose:${string}`;

export interface MachineWorksRecipeStepPurposeV1 {
  readonly id: MachineWorksStepPurposeIdV1;
  readonly recipeId: string;
  readonly stepIndex: number;
  readonly exactStep: PartStepV1;
  readonly purpose: string;
  readonly removalConsequence: string;
  readonly mechanicalRelationship: MachineWorksMechanicalRelationshipV1;
}

interface MachineWorksStepPurposeDraftV1 {
  readonly id: MachineWorksStepPurposeIdV1;
  readonly removalConsequence: string;
  readonly mechanicalRelationship: MachineWorksMechanicalRelationshipV1;
}

const STEP_PURPOSE_DRAFTS = new WeakMap<RecipeStepV1, MachineWorksStepPurposeDraftV1>();
const RECIPE_STEP_PURPOSES =
  new WeakMap<RecipeV1, readonly MachineWorksRecipeStepPurposeV1[]>();

function purpose(
  id: string,
  removalConsequence: string,
  verb: MachineWorksRelationshipVerbV1,
  object: string,
  evidence: string,
): MachineWorksStepPurposeDraftV1 {
  const value: MachineWorksStepPurposeDraftV1 = {
    id: `machine-works:step-purpose:${id}`,
    removalConsequence,
    mechanicalRelationship: { verb, object, evidence },
  };
  if (!/\b(?:loses|breaks|cannot|no longer|opens|falls|becomes|removes|leaves|disconnects|lowers|makes)\b/i
    .test(removalConsequence)
    || object.trim().length < 3
    || evidence.trim().length < 20
    || /\b(?:looks? cool|decorate|decoration|ornament|flourish|visual interest)\b/i
      .test(`${removalConsequence} ${evidence}`)) {
    throw new Error(
      `Machine Works step purpose '${value.id}' needs a concrete removal failure and mechanical evidence.`,
    );
  }
  return Object.freeze({
    ...value,
    mechanicalRelationship: Object.freeze({ ...value.mechanicalRelationship }),
  });
}

function purposefulPartStep(
  part: string,
  at: readonly [number, number, number],
  settings: PartSettingsV1,
  note: string,
  stepPurpose: MachineWorksStepPurposeDraftV1,
): RecipeStepV1 {
  const step = partStepV1(part, at, settings, note);
  STEP_PURPOSE_DRAFTS.set(step, stepPurpose);
  return step;
}

function machineBoxStep(
  at: readonly [number, number, number],
  size: readonly [number, number, number],
  role: MachineRole,
  note: string,
  stepPurpose: MachineWorksStepPurposeDraftV1,
): RecipeStepV1 {
  return purposefulPartStep('box', at, {
    sizeX: size[0],
    sizeY: size[1],
    sizeZ: size[2],
    role,
  }, note, stepPurpose);
}

function exactPartStep(step: RecipeStepV1, recipeId: string, stepIndex: number): PartStepV1 {
  if (step.kind !== 'part') {
    throw new Error(
      `Machine Works purpose coverage for '${recipeId}' step ${String(stepIndex)} `
      + `supports exact part steps; received '${step.kind}'. Add an exact clone path before authoring it.`,
    );
  }
  return Object.freeze({
    ...step,
    at: Object.freeze([...step.at] as [number, number, number]),
    settings: Object.freeze({ ...step.settings }),
  });
}

function defineMachineRecipe(spec: MachineRecipeSpec): RecipeV1 {
  const recipe: RecipeV1 = {
    schemaVersion: 'studio.voxel-recipe/1',
    id: `studio:machine-works:${spec.id}`,
    label: spec.label,
    seed: spec.seed,
    size: spec.size,
    summary: spec.summary,
    tags: ['machine-works', 'assembly-line', ...spec.tags],
    roles: [...spec.roles],
    palette: spec.roles.map((role) => ({ ...MACHINE_COLORS[role] })),
    steps: spec.steps,
    motion: {
      periodMs: 0,
      phaseRadians: 0,
      translation: [0, 0, 0],
      rotationRadians: [0, 0, 0],
      scale: [0, 0, 0],
    },
  };
  const ids = new Set<string>();
  const purposes = spec.steps.map((step, stepIndex) => {
    const draft = STEP_PURPOSE_DRAFTS.get(step);
    if (draft === undefined) {
      throw new Error(
        `Cannot define Machine Works recipe '${recipe.id}': step ${String(stepIndex)} `
        + `'${step.note ?? '(unnamed)'}' has no purpose, removal consequence, and mechanical relation.`,
      );
    }
    const purposeText = step.note?.trim() ?? '';
    if (purposeText.length < 11
      || /\b(?:looks? cool|decorate|decoration|ornament|flourish|visual interest)\b/i
        .test(purposeText)) {
      throw new Error(
        `Cannot define Machine Works recipe '${recipe.id}': step ${String(stepIndex)} `
        + `'${purposeText || '(unnamed)'}' needs a concrete, non-ornamental purpose.`,
      );
    }
    if (ids.has(draft.id)) {
      throw new Error(
        `Cannot define Machine Works recipe '${recipe.id}': step-purpose id '${draft.id}' is repeated.`,
      );
    }
    ids.add(draft.id);
    return Object.freeze({
      id: draft.id,
      recipeId: recipe.id,
      stepIndex,
      exactStep: exactPartStep(step, recipe.id, stepIndex),
      purpose: purposeText,
      removalConsequence: draft.removalConsequence,
      mechanicalRelationship: draft.mechanicalRelationship,
    });
  });
  RECIPE_STEP_PURPOSES.set(recipe, Object.freeze(purposes));
  return recipe;
}

export function machineWorksStepPurposesForRecipeV1(
  recipe: RecipeV1,
): readonly MachineWorksRecipeStepPurposeV1[] {
  const purposes = RECIPE_STEP_PURPOSES.get(recipe);
  if (purposes === undefined) {
    throw new Error(
      `Cannot read Machine Works purpose coverage for '${recipe.id}': `
      + 'the recipe was not created by its purpose-enforcing authoring path.',
    );
  }
  return purposes;
}

export function createMachineWorksRailFoundationRecipe(): RecipeV1 {
  const tieStations = [5, 9, 13, 17, 21, 25] as const;
  const bridgePads = [
    ['west-front', 8, 9],
    ['west-rear', 8, 10],
    ['east-front', 21, 9],
    ['east-rear', 21, 10],
  ] as const;
  return defineMachineRecipe({
    id: 'rail-foundation',
    label: 'Conveyor underframe',
    seed: 7_101,
    size: [31, 5, 11],
    summary: 'An open trestle underframe holds repeated low cross-ties beneath twin safety-ended side guards, and both end frames stop short of the belt portal so the drum turns pass through open air.',
    tags: ['conveyor', 'underframe', 'foundation', 'return-clearance', 'side-guards'],
    roles: ['empty', 'structure', 'wear', 'safety'],
    steps: [
      machineBoxStep([0, 0, 0], [31, 1, 1], 'structure', 'Grounds the near bottom rail along the full machine length', purpose(
        'rail-foundation:near-bottom-rail',
        'Removing it leaves the near corner posts and near top rail without a grounded member to terminate on.',
        'supports', 'the near side of the underframe',
        'The full-length rail rests on the ground plane and face-connects both near corner posts and both bottom end rails.',
      )),
      machineBoxStep([0, 0, 10], [31, 1, 1], 'structure', 'Grounds the far bottom rail along the full machine length', purpose(
        'rail-foundation:far-bottom-rail',
        'Removing it leaves the far corner posts and far top rail without a grounded member to terminate on.',
        'supports', 'the far side of the underframe',
        'The full-length rail rests on the ground plane and face-connects both far corner posts and both bottom end rails.',
      )),
      machineBoxStep([0, 0, 1], [1, 1, 9], 'structure', 'Closes the grounded ring across the belt-entry end', purpose(
        'rail-foundation:entry-bottom-end-rail',
        'Removing it disconnects the near and far bottom rails at the belt-entry end and opens the grounded ring.',
        'anchors', 'the belt-entry ends of both bottom rails',
        'The end rail crosses under the west drum bay at ground level, where the rotating envelope never reaches.',
      )),
      machineBoxStep([30, 0, 1], [1, 1, 9], 'structure', 'Closes the grounded ring across the belt-exit end', purpose(
        'rail-foundation:exit-bottom-end-rail',
        'Removing it disconnects the near and far bottom rails at the belt-exit end and opens the grounded ring.',
        'anchors', 'the belt-exit ends of both bottom rails',
        'The end rail crosses under the east drum bay at ground level, where the rotating envelope never reaches.',
      )),
      machineBoxStep([0, 1, 0], [1, 2, 1], 'structure', 'Raises the entry-near corner post', purpose(
        'rail-foundation:entry-near-corner-post',
        'Removing it leaves the entry end of the near top rail without a vertical path to the grounded ring.',
        'carries', 'the entry end of the near top rail',
        'The post face-connects the grounded ring at y=1 and the near top rail at y=3 on the entry-near corner.',
      )),
      machineBoxStep([30, 1, 0], [1, 2, 1], 'structure', 'Raises the exit-near corner post', purpose(
        'rail-foundation:exit-near-corner-post',
        'Removing it leaves the exit end of the near top rail without a vertical path to the grounded ring.',
        'carries', 'the exit end of the near top rail',
        'The post face-connects the grounded ring at y=1 and the near top rail at y=3 on the exit-near corner.',
      )),
      machineBoxStep([0, 1, 10], [1, 2, 1], 'structure', 'Raises the entry-far corner post', purpose(
        'rail-foundation:entry-far-corner-post',
        'Removing it leaves the entry end of the far top rail without a vertical path to the grounded ring.',
        'carries', 'the entry end of the far top rail',
        'The post face-connects the grounded ring at y=1 and the far top rail at y=3 on the entry-far corner.',
      )),
      machineBoxStep([30, 1, 10], [1, 2, 1], 'structure', 'Raises the exit-far corner post', purpose(
        'rail-foundation:exit-far-corner-post',
        'Removing it leaves the exit end of the far top rail without a vertical path to the grounded ring.',
        'carries', 'the exit end of the far top rail',
        'The post face-connects the grounded ring at y=1 and the far top rail at y=3 on the exit-far corner.',
      )),
      machineBoxStep([0, 3, 0], [31, 1, 1], 'structure', 'Spans the near top rail between its corner posts', purpose(
        'rail-foundation:near-top-rail',
        'Removing it leaves the near guard, the cross-ties, and the near end stubs without a continuous member on the near side.',
        'carries', 'the near ends of every cross-tie and end stub',
        'The full-length rail face-connects both near corner posts, every cross-tie, and both near portal stubs.',
      )),
      machineBoxStep([0, 3, 10], [31, 1, 1], 'structure', 'Spans the far top rail between its corner posts', purpose(
        'rail-foundation:far-top-rail',
        'Removing it leaves the far guard, the cross-ties, and the far end stubs without a continuous member on the far side.',
        'carries', 'the far ends of every cross-tie and end stub',
        'The full-length rail face-connects both far corner posts, every cross-tie, and both far portal stubs.',
      )),
      machineBoxStep([0, 3, 1], [1, 1, 2], 'structure', 'Stops the entry end frame short of the belt portal on the near side', purpose(
        'rail-foundation:entry-near-portal-stub',
        'Removing it leaves the near guard entry cap unsupported and opens the near shoulder of the entry portal frame.',
        'carries', 'the near guard entry cap beside the open belt portal',
        'The stub ends at z=3, leaving the portal beyond |z|=4.5 in world units clear of the drum and turning slats.',
      )),
      machineBoxStep([0, 3, 8], [1, 1, 2], 'structure', 'Stops the entry end frame short of the belt portal on the far side', purpose(
        'rail-foundation:entry-far-portal-stub',
        'Removing it leaves the far guard entry cap unsupported and opens the far shoulder of the entry portal frame.',
        'carries', 'the far guard entry cap beside the open belt portal',
        'The stub starts at z=8, leaving the portal beyond |z|=4.5 in world units clear of the drum and turning slats.',
      )),
      machineBoxStep([30, 3, 1], [1, 1, 2], 'structure', 'Stops the exit end frame short of the belt portal on the near side', purpose(
        'rail-foundation:exit-near-portal-stub',
        'Removing it leaves the near guard exit cap unsupported and opens the near shoulder of the exit portal frame.',
        'carries', 'the near guard exit cap beside the open belt portal',
        'The stub ends at z=3, leaving the portal beyond |z|=4.5 in world units clear of the drum and turning slats.',
      )),
      machineBoxStep([30, 3, 8], [1, 1, 2], 'structure', 'Stops the exit end frame short of the belt portal on the far side', purpose(
        'rail-foundation:exit-far-portal-stub',
        'Removing it leaves the far guard exit cap unsupported and opens the far shoulder of the exit portal frame.',
        'carries', 'the far guard exit cap beside the open belt portal',
        'The stub starts at z=8, leaving the portal beyond |z|=4.5 in world units clear of the drum and turning slats.',
      )),
      ...tieStations.map((x) =>
        machineBoxStep([x, 3, 1], [1, 1, 9], 'structure', `Lays recessed cross-tie at station ${String(x)}`, purpose(
          `rail-foundation:cross-tie-${String(x).padStart(2, '0')}`,
          `Removing the tie leaves station ${String(x)} without transverse bracing between the two long foundation sides.`,
          'supports', `the foundation span at station ${String(x)}`,
          `The exact z-spanning tie face-connects both side members below the clear moving-belt lane at station ${String(x)}.`,
        ))),
      machineBoxStep([0, 4, 2], [1, 1, 1], 'safety', 'Marks the near guard entry', purpose('rail-foundation:near-guard-entry', 'Removing it makes the near moving-belt approach boundary no longer readable at the open end.', 'witnesses', 'the near guard entry', 'The safety cell terminates the near guard exactly at the belt-entry end of the foundation.')),
      machineBoxStep([1, 4, 2], [29, 1, 1], 'wear', 'Runs the near belt-side guard', purpose('rail-foundation:near-side-guard', 'Removing it leaves the moving belt without a visible near-side boundary along the work lane.', 'bounds', 'the near side of the moving belt lane', 'The long member runs parallel to the complete upper belt reach while remaining outside its swept volume.')),
      machineBoxStep([30, 4, 2], [1, 1, 1], 'safety', 'Marks the near guard exit', purpose('rail-foundation:near-guard-exit', 'Removing it makes the near moving-belt departure boundary no longer readable at the output end.', 'witnesses', 'the near guard exit', 'The safety cell terminates the near guard exactly at the belt-exit end of the foundation.')),
      machineBoxStep([0, 4, 8], [1, 1, 1], 'safety', 'Marks the far guard entry', purpose('rail-foundation:far-guard-entry', 'Removing it makes the far moving-belt approach boundary no longer readable at the open end.', 'witnesses', 'the far guard entry', 'The safety cell terminates the far guard exactly at the belt-entry end of the foundation.')),
      machineBoxStep([1, 4, 8], [29, 1, 1], 'wear', 'Runs the far belt-side guard', purpose('rail-foundation:far-side-guard', 'Removing it leaves the moving belt without a visible far-side boundary along the work lane.', 'bounds', 'the far side of the moving belt lane', 'The long member runs parallel to the complete upper belt reach while remaining outside its swept volume.')),
      machineBoxStep([30, 4, 8], [1, 1, 1], 'safety', 'Marks the far guard exit', purpose('rail-foundation:far-guard-exit', 'Removing it makes the far moving-belt departure boundary no longer readable at the output end.', 'witnesses', 'the far guard exit', 'The safety cell terminates the far guard exactly at the belt-exit end of the foundation.')),
      ...bridgePads.map(([name, x, z]) =>
        machineBoxStep([x, 4, z], [5, 1, 1], 'structure', `Lands the ${name} tower foot behind the far guard`, purpose(
          `rail-foundation:${name}-bridge-pad`,
          `Removing it leaves the ${name} bridge foot without an occupied positive-area foundation landing.`,
          'supports', `the ${name} press-bridge foot`,
          `Its top face coincides with the named ${name} bridge-foot port, behind the moving belt band the towers now clear.`,
        ))),
    ],
  });
}

export function createMachineWorksPressBridgeRecipe(): RecipeV1 {
  return defineMachineRecipe({
    id: 'press-bridge',
    label: 'Insertion press bridge',
    seed: 7_109,
    size: [25, 20, 6],
    summary: 'Four foundation feet carry two rectilinear towers standing behind the moving belt band, while fixed linear-stator blades hang from the load beam through empty moving C-yoke cavities over the head stroke.',
    tags: ['press-bridge', 'alignment-datum', 'linear-stator', 'service-bus', 'controller'],
    roles: ['empty', 'structure', 'wear', 'detail'],
    steps: [
      purposefulPartStep('open-frame', [0, 0, 2], {
        width: 5,
        height: 15,
        depth: 3,
        thickness: 1,
        role: 'structure',
      }, 'Anchors the west alignment tower to the conveyor foundation', purpose('press-bridge:west-alignment-tower', 'Removing it leaves the west stator, datum face, and beam end without a visible grounded reaction path.', 'supports', 'the west load-beam end and core actuator datum', 'Four tower feet meet the west foundation pads while the open frame reaches the common load beam.')),
      purposefulPartStep('open-frame', [20, 0, 2], {
        width: 5,
        height: 15,
        depth: 3,
        thickness: 1,
        role: 'structure',
      }, 'Anchors the east alignment tower to the conveyor foundation', purpose('press-bridge:east-alignment-tower', 'Removing it leaves the east stator, datum face, and beam end without a visible grounded reaction path.', 'supports', 'the east load-beam end and cap actuator datum', 'Four tower feet meet the east foundation pads while the open frame reaches the common load beam.')),
      machineBoxStep([7, 0, 2], [1, 15, 1], 'wear', 'Provides the core head inner visual alignment face', purpose('press-bridge:core-alignment-face', 'Removing it leaves the core-head rear pad with no straight visual datum for its prescribed stroke.', 'aligns', 'the core-head rear alignment pad', 'The named pad remains tangent to this exact straight face throughout the swept pose without claiming constraint.')),
      machineBoxStep([17, 0, 2], [1, 15, 1], 'wear', 'Provides the cap head inner visual alignment face', purpose('press-bridge:cap-alignment-face', 'Removing it leaves the cap-head rear pad with no straight visual datum for its prescribed stroke.', 'aligns', 'the cap-head rear alignment pad', 'The named pad remains tangent to this exact straight face throughout the swept pose without claiming constraint.')),
      machineBoxStep([5, 7, 0], [1, 8, 1], 'detail', 'Hangs the cream core fixed-stator blade from the load beam through the orange moving C-yoke with running clearance', purpose('press-bridge:core-fixed-stator', 'Removing it leaves the core C-yoke and vertical command without a visible fixed actuator datum.', 'engages', 'the core moving C-yoke', 'The exact stator remains inside the empty three-sided yoke cavity with hashed transverse clearance and no contact claim.')),
      machineBoxStep([19, 7, 0], [1, 8, 1], 'detail', 'Hangs the cream cap fixed-stator blade from the load beam through the orange moving C-yoke with running clearance', purpose('press-bridge:cap-fixed-stator', 'Removing it leaves the cap C-yoke and vertical command without a visible fixed actuator datum.', 'engages', 'the cap moving C-yoke', 'The exact stator remains inside the empty three-sided yoke cavity with hashed transverse clearance and no contact claim.')),
      machineBoxStep([4, 15, 0], [17, 2, 3], 'structure', 'Spans both alignment and stator pairs with a straight load beam', purpose('press-bridge:load-beam', 'Removing it leaves both stators and fixed servo housings without a common bridge to the grounded towers.', 'supports', 'both fixed linear-actuator assemblies', 'The beam face-connects both towers, both fixed housings, both stators, and the rear controller cabinet.')),
      machineBoxStep([4, 17, 0], [4, 3, 4], 'wear', 'Houses the fixed core press servo', purpose('press-bridge:core-servo-housing', 'Removing it leaves the core stator with no visible fixed actuator housing or service termination.', 'routes-service-to', 'the core fixed stator', 'The housing face-connects the overhead service bus to the load beam directly above the core stator.')),
      machineBoxStep([17, 17, 0], [4, 3, 4], 'wear', 'Houses the fixed cap press servo', purpose('press-bridge:cap-servo-housing', 'Removing it leaves the cap stator with no visible fixed actuator housing or service termination.', 'routes-service-to', 'the cap fixed stator', 'The housing face-connects the overhead service bus to the load beam directly above the cap stator.')),
      machineBoxStep([8, 19, 3], [9, 1, 1], 'detail', 'Face-connects the controller service bus to both fixed servo housings', purpose('press-bridge:face-connected-service-bus', 'Removing it leaves both fixed servo housings without one visible shared external service source.', 'routes-service-to', 'the core and cap fixed servo housings', 'The exact straight bus shares positive-area faces with the controller cabinet and both fixed housings.')),
      machineBoxStep([10, 15, 3], [5, 4, 3], 'structure', 'Bolts the press controller cabinet to the rear face of the load beam', purpose('press-bridge:service-controller', 'Removing it leaves the overhead bus and both actuator housings without a visible external service origin.', 'anchors', 'the fixed actuator service route', 'The cabinet face-connects the load beam and the center branch of the overhead service bus.')),
    ],
  });
}

export function createMachineWorksConveyorSlatRecipe(): RecipeV1 {
  return defineMachineRecipe({
    id: 'conveyor-slat',
    label: 'Conveyor belt slat',
    seed: 7_113,
    size: [8, 1, 26],
    summary: 'A short broad friction tread spans the carrier lane while contrasting end links expose the small clearances of the articulated belt.',
    tags: ['conveyor', 'belt', 'slat', 'friction-contact', 'repeated-part'],
    roles: ['empty', 'wear', 'safety'],
    steps: [
      machineBoxStep([0, 0, 0], [8, 1, 3], 'safety', 'Forms the near articulated end boundary', purpose(
        'conveyor-slat:near-articulated-end',
        'Removing it opens the near three-voxel segment of the repeated moving surface and hides that slat pitch includes a bounded end clearance.',
        'bounds', 'the near end of the slat contact tread',
        'Its full-width rear face shares a positive-area face with the tread while its outer face marks the exact near end of this slat collider.',
      )),
      machineBoxStep([0, 0, 3], [8, 1, 20], 'wear', 'Lays the broad carrier-contact tread', purpose(
        'conveyor-slat:carrier-contact-tread',
        'Removing it leaves the transfer-carriage runners without the broad slat collider surface whose friction produces transport.',
        'contacts', 'the transfer-carriage friction runners',
        'The exact eight-by-twenty top face is the Rapier contact plane retained beneath both carriage runners on the upper conveyor run.',
      )),
      machineBoxStep([0, 0, 23], [8, 1, 3], 'safety', 'Forms the far articulated end boundary', purpose(
        'conveyor-slat:far-articulated-end',
        'Removing it opens the far three-voxel segment of the repeated moving surface and hides that slat pitch includes a bounded end clearance.',
        'bounds', 'the far end of the slat contact tread',
        'Its full-width front face shares a positive-area face with the tread while its outer face marks the exact far end of this slat collider.',
      )),
    ],
  });
}

function driveDrumEndSteps(
  z: number,
  end: 'near' | 'far',
): readonly RecipeStepV1[] {
  return [
    machineBoxStep([4, 0, z], [3, 1, 2], 'safety', `Marks the ${end} lower rotating boundary`, purpose(
      `drive-drum:${end}-lower-boundary`,
      `Removing it leaves the ${end} rotating end cheek without a visible lower extent at its exact axle plane.`,
      'bounds', `the lower extent of the ${end} rotating end cheek`,
      `The three-wide cell group face-connects the ${end} lower flange at y=1 and terminates the rotating envelope at y=0.`,
    )),
    machineBoxStep([2, 1, z], [7, 1, 2], 'structure', `Forms the ${end} lower retaining-flange tier`, purpose(
      `drive-drum:${end}-lower-flange-tier`,
      `Removing it leaves a one-voxel gap between the ${end} lower boundary marker and the load-carrying end-cheek tier.`,
      'carries', `the ${end} lower rotating boundary into the end cheek`,
      `Its centered seven-wide tier shares positive-area faces with the boundary below and the nine-wide load tier above.`,
    )),
    machineBoxStep([1, 2, z], [9, 2, 2], 'structure', `Carries the ${end} lower end-cheek load into the hub band`, purpose(
      `drive-drum:${end}-lower-load-tier`,
      `Removing it disconnects the ${end} lower flange tiers from the central hub band across a two-voxel radial span.`,
      'carries', `the ${end} lower flange into the central hub band`,
      `The nine-wide two-high tier face-connects the lower flange at y=2 and the full hub band at y=4 on the same axial slab.`,
    )),
    machineBoxStep([0, 4, z], [1, 3, 2], 'safety', `Marks the ${end} left rotating boundary`, purpose(
      `drive-drum:${end}-left-boundary`,
      `Removing it leaves the ${end} end cheek without a visible left extent across the central hub height.`,
      'bounds', `the left extent of the ${end} rotating end cheek`,
      `The one-wide vertical group face-connects the hub band at x=1 and terminates the rotating envelope at x=0.`,
    )),
    machineBoxStep([1, 4, z], [9, 3, 2], 'structure', `Spans the ${end} central end-cheek hub band`, purpose(
      `drive-drum:${end}-central-hub-band`,
      `Removing it breaks the ${end} end cheek into separate upper, lower, left, and right sectors with no continuous axle-centered band.`,
      'locates', `the ${end} axial end-cheek plane`,
      `The nine-by-three band crosses the axle center and face-connects every radial tier plus the central pitch barrel.`,
    )),
    machineBoxStep([10, 4, z], [1, 3, 2], 'safety', `Marks the ${end} right rotating boundary`, purpose(
      `drive-drum:${end}-right-boundary`,
      `Removing it leaves the ${end} end cheek without a visible right extent across the central hub height.`,
      'bounds', `the right extent of the ${end} rotating end cheek`,
      `The one-wide vertical group face-connects the hub band at x=9 and terminates the rotating envelope at x=10.`,
    )),
    machineBoxStep([1, 7, z], [9, 2, 2], 'structure', `Carries the ${end} upper end-cheek load into the hub band`, purpose(
      `drive-drum:${end}-upper-load-tier`,
      `Removing it disconnects the ${end} upper flange tiers from the central hub band across a two-voxel radial span.`,
      'carries', `the ${end} upper flange into the central hub band`,
      `The nine-wide two-high tier face-connects the hub band at y=7 and the upper flange at y=9 on the same axial slab.`,
    )),
    machineBoxStep([2, 9, z], [7, 1, 2], 'structure', `Forms the ${end} upper retaining-flange tier`, purpose(
      `drive-drum:${end}-upper-flange-tier`,
      `Removing it leaves a one-voxel gap between the ${end} upper boundary marker and the load-carrying end-cheek tier.`,
      'carries', `the ${end} upper rotating boundary into the end cheek`,
      `Its centered seven-wide tier shares positive-area faces with the load tier below and the boundary above.`,
    )),
    machineBoxStep([4, 10, z], [3, 1, 2], 'safety', `Marks the ${end} upper rotating boundary`, purpose(
      `drive-drum:${end}-upper-boundary`,
      `Removing it leaves the ${end} rotating end cheek without a visible upper extent at its exact axle plane.`,
      'bounds', `the upper extent of the ${end} rotating end cheek`,
      `The three-wide cell group face-connects the ${end} upper flange at y=9 and terminates the rotating envelope at y=10.`,
    )),
  ];
}

export function createMachineWorksDriveDrumRecipe(): RecipeV1 {
  return defineMachineRecipe({
    id: 'drive-drum',
    label: 'Flanged conveyor drive drum',
    seed: 7_119,
    size: [11, 11, 17],
    summary: 'Stepped end cheeks bound the slat turn while a central pitch barrel joins them without claiming belt contact, and off-axis face stripes expose shared drive phase.',
    tags: ['conveyor', 'drive-drum', 'retaining-flange', 'axle', 'rotary'],
    roles: ['empty', 'structure', 'wear', 'safety', 'detail'],
    steps: [
      ...driveDrumEndSteps(0, 'near'),
      machineBoxStep([2, 2, 2], [7, 7, 13], 'wear', 'Joins both retaining end cheeks with a central pitch barrel that does not claim belt contact', purpose(
        'drive-drum:central-pitch-barrel',
        'Removing it leaves the two rotating end cheeks disconnected across the thirteen-voxel axle span.',
        'carries', 'the near and far retaining end cheeks on one drum body',
        'Its near and far faces contact the end-cheek slabs at z=2 and z=15 while the authored slat path retains clearance from this barrel.',
      )),
      ...driveDrumEndSteps(15, 'far'),
      machineBoxStep([5, 1, 0], [1, 4, 1], 'detail', 'Indicates the near drum angle with one asymmetric phase stripe', purpose(
        'drive-drum:near-phase-stripe',
        'Removing it makes the rotational phase of the otherwise symmetric near end cheek unreadable from that exterior face.',
        'witnesses', 'the solved near drum quaternion',
        'The off-axis one-wide stripe is coplanar with the near exterior face and copies the drum pose without contact or torque.',
      )),
      machineBoxStep([5, 1, 16], [1, 4, 1], 'detail', 'Indicates the far drum angle with one asymmetric phase stripe', purpose(
        'drive-drum:far-phase-stripe',
        'Removing it makes the rotational phase of the otherwise symmetric far end cheek unreadable from that exterior face.',
        'witnesses', 'the solved far drum quaternion',
        'The off-axis one-wide stripe is coplanar with the far exterior face and copies the drum pose without contact or torque.',
      )),
    ],
  });
}

export function createMachineWorksExposedDriveCogRecipe(): RecipeV1 {
  return defineMachineRecipe({
    id: 'drive-cog',
    label: 'Exposed axle phase flag',
    seed: 7_123,
    size: [3, 6, 3],
    summary: 'A compact axle hub and one radial flag expose drive-drum rotation without implying tooth contact or torque transfer.',
    tags: ['conveyor', 'phase-flag', 'axle', 'rotary', 'phase-indicator'],
    roles: ['empty', 'structure', 'safety'],
    steps: [
      machineBoxStep([0, 3, 0], [3, 3, 3], 'structure', 'Centers the phase witness on the visible drum axle', purpose(
        'drive-cog:axle-hub',
        'Removing it leaves the radial phase flag floating three voxels away from the drum axle it is supposed to witness.',
        'anchors', 'the radial phase flag to the solved drum axle',
        'The centered three-cube hub occupies the axle datum and shares a full three-by-three face with the flag root at y=3.',
      )),
      machineBoxStep([0, 0, 0], [3, 3, 3], 'safety', 'Indicates the drum angle with one unambiguous radial flag', purpose(
        'drive-cog:radial-phase-flag',
        'Removing it makes the copied drum quaternion visually indistinguishable around the symmetric axle hub.',
        'witnesses', 'the matching solved drive-drum quaternion',
        'The single off-axis radial block copies the hub pose outside Rapier and never contacts the belt or transmits torque.',
      )),
    ],
  });
}

export function createMachineWorksCollectionBucketRecipe(): RecipeV1 {
  return defineMachineRecipe({
    id: 'collection-bucket',
    label: 'Open collection bucket',
    seed: 7_127,
    size: [13, 10, 13],
    summary: 'A wear floor, tall sidewalls, and a low front lip form a visibly open receiving bin.',
    tags: ['bucket', 'collection', 'open-container', 'receiving'],
    roles: ['empty', 'structure', 'wear', 'safety'],
    steps: [
      machineBoxStep([1, 0, 2], [11, 1, 9], 'wear', 'Lays the replaceable bucket floor', purpose(
        'collection-bucket:receiving-floor',
        'Removing it leaves the released product with no occupied receiving surface inside the three containment walls.',
        'receives', 'the gravity-released assembled product',
        'The eleven-by-nine horizontal collision face lies directly beneath the declared bucket sensor and joins all three containment walls.',
      )),
      machineBoxStep([0, 0, 11], [13, 1, 2], 'safety', 'Extends the grounded rear heel behind the receiving floor', purpose(
        'collection-bucket:rear-heel',
        'Removing it leaves the rear edge of the receiving floor without its wider grounded footprint beyond the tall rear wall.',
        'supports', 'the rear edge of the bucket floor',
        'The thirteen-wide heel face-connects the entire rear edge of the eleven-wide floor at ground level and extends one voxel to each side.',
      )),
      machineBoxStep([1, 1, 10], [11, 8, 1], 'structure', 'Raises the rear containment wall', purpose(
        'collection-bucket:rear-wall',
        'Removing it opens the bucket directly along the released product trajectory beyond the output tipping axis.',
        'bounds', 'the rear side of the collection volume',
        'The eleven-wide wall rises from the rear row of the receiving floor and forms the closed boundary opposite the low entry lip.',
      )),
      machineBoxStep([1, 1, 2], [1, 8, 8], 'structure', 'Raises the left containment wall', purpose(
        'collection-bucket:left-wall',
        'Removing it opens the full left side of the sensor volume and removes collision containment for a laterally settling product.',
        'bounds', 'the left side of the collection volume',
        'The one-wide wall rises from the left floor edge and face-connects both the front lip and rear wall.',
      )),
      machineBoxStep([11, 1, 2], [1, 8, 8], 'structure', 'Raises the right containment wall', purpose(
        'collection-bucket:right-wall',
        'Removing it opens the full right side of the sensor volume and removes collision containment for a laterally settling product.',
        'bounds', 'the right side of the collection volume',
        'The one-wide wall rises from the right floor edge and face-connects both the front lip and rear wall.',
      )),
      machineBoxStep([2, 1, 2], [9, 3, 1], 'structure', 'Forms the low front receiving lip', purpose(
        'collection-bucket:front-lip',
        'Removing it opens the floor-level front edge so a settled product can leave the receiving volume toward the conveyor.',
        'bounds', 'the low front edge of the collection volume',
        'The nine-wide lip rises three voxels from the floor entrance while leaving the upper mouth open to the tipping trajectory.',
      )),
      machineBoxStep([0, 3, 0], [13, 1, 2], 'safety', 'Extends the front mouth datum below the low lip', purpose(
        'collection-bucket:front-mouth-datum',
        'Removing it leaves the low lip without the wider exterior collision ledge that marks the exact receiving mouth at floor height.',
        'bounds', 'the exterior edge of the bucket receiving mouth',
        'The thirteen-wide toe face-connects the low lip at its top rear edge and extends one voxel beyond both sidewalls.',
      )),
      machineBoxStep([0, 9, 10], [13, 1, 2], 'safety', 'Bounds the rear wall top edge with a collision rim', purpose(
        'collection-bucket:rear-rim',
        'Removing it lowers and narrows the rear collision boundary at the top edge of the containment wall.',
        'bounds', 'the top rear edge of the collection volume',
        'The thirteen-wide rim face-connects the rear wall top and projects one voxel beyond each sidewall to close both rear corners.',
      )),
      machineBoxStep([0, 9, 2], [2, 1, 8], 'safety', 'Bounds the left wall top edge with a collision rim', purpose(
        'collection-bucket:left-rim',
        'Removing it lowers the left collision boundary and opens the upper-left rear corner of the containment rim.',
        'bounds', 'the top left edge of the collection volume',
        'The two-wide rim face-connects the left wall top and meets the rear rim across a positive-area corner face.',
      )),
      machineBoxStep([11, 9, 2], [2, 1, 8], 'safety', 'Bounds the right wall top edge with a collision rim', purpose(
        'collection-bucket:right-rim',
        'Removing it lowers the right collision boundary and opens the upper-right rear corner of the containment rim.',
        'bounds', 'the top right edge of the collection volume',
        'The two-wide rim face-connects the right wall top and meets the rear rim across a positive-area corner face.',
      )),
    ],
  });
}

export function createMachineWorksOutputDockRecipe(): RecipeV1 {
  return defineMachineRecipe({
    id: 'output-dock',
    label: 'Motorized output trunnion dock',
    seed: 7_139,
    size: [7, 6, 28],
    summary: 'Two foundation-contacting outriggers carry clearanced C-shaped trunnion housings, while an axle-end servo housing and conduit expose the prescribed rotary drive path.',
    tags: ['output', 'dock', 'trunnion', 'bearing', 'rotary-servo'],
    roles: ['empty', 'structure', 'wear', 'safety', 'detail'],
    steps: [
      machineBoxStep([1, 0, 0], [6, 1, 3], 'wear', 'Combines the near foundation shoe and lower bearing bed outside the moving belt', purpose(
        'output-dock:near-foundation-bearing-bed',
        'Removing it leaves the near C-housing without foundation contact or a lower boundary beneath the clearanced trunnion axle.',
        'supports', 'the near clearanced C-shaped bearing cradle',
        'Its six-by-three ground face lands outside the belt sweep and its top face supports the rear upright at x=6.',
      )),
      machineBoxStep([6, 1, 1], [1, 5, 2], 'wear', 'Carries the near C-housing behind the full axle swept envelope', purpose(
        'output-dock:near-bearing-upright',
        'Removing it disconnects the near upper bearing cap from its foundation bed and opens the rear of the C-shaped cradle.',
        'carries', 'the near upper bearing cap above the axle envelope',
        'The five-high upright face-connects the lower bed at y=1 and the upper cap at y=5 while remaining behind the axle sweep.',
      )),
      machineBoxStep([2, 5, 1], [4, 1, 2], 'wear', 'Closes the near C-housing above the axle with declared running clearance', purpose(
        'output-dock:near-bearing-cap',
        'Removing it opens the near trunnion cradle above the axle and removes the visible upper extent of that bearing support.',
        'bounds', 'the upper side of the near trunnion clearance envelope',
        'The four-wide cap face-connects the rear upright and stays above the validated live axle sweep with declared clearance.',
      )),
      machineBoxStep([1, 0, 22], [6, 1, 3], 'wear', 'Combines the far foundation shoe and lower bearing bed outside the moving belt', purpose(
        'output-dock:far-foundation-bearing-bed',
        'Removing it leaves the far C-housing without foundation contact or a lower boundary beneath the clearanced trunnion axle.',
        'supports', 'the far clearanced C-shaped bearing cradle',
        'Its six-by-three ground face lands outside the belt sweep and its top face supports the rear upright at x=6.',
      )),
      machineBoxStep([6, 1, 22], [1, 5, 2], 'wear', 'Carries the far C-housing behind the same swept envelope', purpose(
        'output-dock:far-bearing-upright',
        'Removing it disconnects the far upper bearing cap from its foundation bed and opens the rear of the C-shaped cradle.',
        'carries', 'the far upper bearing cap above the axle envelope',
        'The five-high upright face-connects the lower bed at y=1 and the upper cap at y=5 while remaining behind the axle sweep.',
      )),
      machineBoxStep([2, 5, 22], [4, 1, 2], 'wear', 'Closes the far C-housing above the axle with declared running clearance', purpose(
        'output-dock:far-bearing-cap',
        'Removing it opens the far trunnion cradle above the axle and removes the visible upper extent of that bearing support.',
        'bounds', 'the upper side of the far trunnion clearance envelope',
        'The four-wide cap face-connects the rear upright and stays above the validated live axle sweep with declared clearance.',
      )),
      machineBoxStep([4, 2, 24], [1, 2, 1], 'safety', 'Couples the trunnion end face to the visible rotary-servo output', purpose(
        'output-dock:servo-output-coupler',
        'Removing it leaves a one-voxel axial gap between the carrier trunnion end and the fixed rotary-servo housing.',
        'engages', 'the carrier trunnion servo-drive face',
        'The one-voxel axial coupler is coaxial with both bearing bores and face-contacts the trunnion at z=24 and servo housing at z=25.',
      )),
      machineBoxStep([2, 0, 25], [5, 1, 2], 'structure', 'Supports the servo housing on the occupied far foundation pad', purpose(
        'output-dock:servo-foundation-foot',
        'Removing it leaves the outboard rotary-servo housing without its occupied ground contact beside the far bearing shoe.',
        'supports', 'the outboard rotary position servo',
        'The five-by-two foot lands on the foundation datum and shares its full top face with the fixed servo housing.',
      )),
      machineBoxStep([2, 1, 25], [5, 5, 2], 'structure', 'Houses the outboard rotary position servo immediately behind its output coupler', purpose(
        'output-dock:rotary-servo-housing',
        'Removing it leaves the prescribed output rotation with a coupler and conduit but no visible fixed actuator body.',
        'turns', 'the carrier trunnion about the declared output axis',
        'The declared bore axis pierces the fixed housing directly behind its coupler; the consumer prescribes position without claiming simulated torque.',
      )),
      machineBoxStep([3, 2, 27], [3, 3, 1], 'safety', 'Marks the outboard servo axis on the exterior end cap', purpose(
        'output-dock:servo-axis-end-cap',
        'Removing it makes the outboard servo axis unreadable from the dock exterior when the coupler is occluded.',
        'witnesses', 'the outboard rotary-servo axis',
        'The three-by-three cap face is normal to the bore axis, which pierces it half a voxel below its middle on the housing end.',
      )),
      machineBoxStep([0, 0, 25], [2, 1, 2], 'detail', 'Anchors the external service entry beside the far bearing shoe', purpose(
        'output-dock:servo-service-entry',
        'Removing it breaks the external service route at the foundation edge before it reaches the outboard rotary servo.',
        'routes-service-to', 'the outboard rotary position servo',
        'The two-wide ground segment begins at the dock boundary and face-connects the vertical conduit outside the bearing load path.',
      )),
      machineBoxStep([0, 1, 25], [1, 3, 2], 'detail', 'Raises the servo-service conduit outside the bearing load path', purpose(
        'output-dock:servo-service-riser',
        'Removing it breaks the visible service route between the grounded entry and the outboard rotary-servo input height.',
        'routes-service-to', 'the outboard rotary position servo',
        'The three-high riser face-connects both horizontal conduit segments at x=0 while remaining outside the bearing cradle.',
      )),
      machineBoxStep([0, 4, 25], [2, 1, 2], 'detail', 'Connects the external service conduit to the servo housing input face', purpose(
        'output-dock:servo-service-connection',
        'Removing it leaves a one-voxel gap between the service riser and the outboard rotary-servo housing input face.',
        'routes-service-to', 'the outboard rotary position servo',
        'The upper two-wide segment face-connects the riser at x=0 and the fixed housing input face at x=2.',
      )),
    ],
  });
}

export function createMachineWorksTransferCarriageRecipe(): RecipeV1 {
  return defineMachineRecipe({
    id: 'transfer-carriage',
    label: 'Belt-driven transfer carrier',
    seed: 7_151,
    size: [15, 5, 23],
    summary: 'Twin friction runners support a low load platform, while a chassis-backed transverse trunnion axle docks into the output bearings and defines the tipping axis.',
    tags: ['carrier', 'pallet', 'load-platform', 'belt-driven', 'friction-contact', 'trunnion'],
    roles: ['empty', 'structure', 'wear', 'safety'],
    steps: [
      machineBoxStep([2, 0, 7], [11, 1, 4], 'wear', 'Forms the broad near belt-contact runner', purpose(
        'transfer-carriage:near-friction-runner',
        'Removing it leaves the near half of the carrier chassis without the Rapier contact patch that receives belt friction.',
        'contacts', 'the moving conveyor-slat top faces',
        'The eleven-by-four underside lies on the slat contact plane and participates in the retained frictional transport trace.',
      )),
      machineBoxStep([2, 0, 12], [11, 1, 4], 'wear', 'Forms the broad far belt-contact runner', purpose(
        'transfer-carriage:far-friction-runner',
        'Removing it leaves the far half of the carrier chassis without the Rapier contact patch that receives belt friction.',
        'contacts', 'the moving conveyor-slat top faces',
        'The eleven-by-four underside lies on the slat contact plane and participates in the retained frictional transport trace.',
      )),
      machineBoxStep([2, 1, 7], [11, 3, 9], 'structure', 'Builds the carrier chassis over both runners', purpose(
        'transfer-carriage:runner-spanning-chassis',
        'Removing it disconnects the load deck and trunnion tie from both belt-contact runners.',
        'carries', 'the load deck and output trunnion tie above both runners',
        'The eleven-by-nine chassis face-connects both runners below, the deck above, and the trunnion tie at its output side.',
      )),
      machineBoxStep([3, 4, 8], [9, 1, 7], 'wear', 'Lays the replaceable product load deck', purpose(
        'transfer-carriage:product-load-deck',
        'Removing it leaves the product-base fixed-joint mount without an occupied carrier surface beneath the workpiece.',
        'carries', 'the product-base compound assembly',
        'The nine-by-seven top face is centered on the carrier load port and sits directly above the runner-spanning chassis.',
      )),
      machineBoxStep([0, 2, 10], [2, 2, 3], 'safety', 'Bounds the non-output end of the carrier chassis', purpose(
        'transfer-carriage:non-output-bumper',
        'Removing it leaves the carrier moving envelope visually open at the end opposite the output trunnion.',
        'bounds', 'the non-output end of the moving carrier envelope',
        'The two-wide bumper face-connects the chassis end and marks the exact x=0 exterior limit opposite the output axle.',
      )),
      machineBoxStep([13, 2, 10], [1, 2, 3], 'structure', 'Ties the output trunnion axle into the carrier chassis', purpose(
        'transfer-carriage:trunnion-chassis-tie',
        'Removing it leaves a one-voxel gap between the moving carrier chassis and the transverse output axle.',
        'carries', 'the output trunnion axle from the carrier chassis',
        'The tie face-connects the chassis at x=12 and the axle at x=14 on the declared output-axis centerline.',
      )),
      machineBoxStep([14, 2, 0], [1, 2, 23], 'safety', 'Spans both outboard clearanced bearings and meets the servo face on the declared rotary axis', purpose(
        'transfer-carriage:outboard-trunnion-axle',
        'Removing it leaves the carrier with no visible common axis through both output bearings and the rotary-servo coupler.',
        'engages', 'both clearanced dock bearings and the outboard servo coupler',
        'The continuous twenty-three-voxel axle is coaxial with both bearing bores and its far end face meets the fixed servo coupler.',
      )),
    ],
  });
}

export function createMachineWorksInsertionHeadRecipe(): RecipeV1 {
  return defineMachineRecipe({
    id: 'insertion-head',
    label: 'Stator-aligned magnetic insertion slide',
    seed: 7_181,
    size: [11, 18, 18],
    summary: 'A three-sided orange actuator yoke travels around the fixed stator spine with visible running clearance, while two rear pads expose alignment and a service-lined ram ends in a flat electromagnetic pickup face.',
    tags: ['insertion-head', 'linear-slide', 'ram', 'electromagnetic-pickup', 'alignment-datum'],
    roles: ['empty', 'structure', 'wear', 'detail', 'safety'],
    steps: [
      machineBoxStep([2, 0, 0], [7, 1, 7], 'detail', 'Forms the flat electromagnetic pickup face that holds a preloaded ferromagnetic datum', purpose(
        'insertion-head:electromagnetic-pickup-face',
        'Removing it leaves the preloaded core or cap fixed joint without the visible contacting tool face that explains temporary retention.',
        'holds', 'the preloaded product-core or product-cap datum',
        'The seven-by-seven plate begins face-contacting the ferromagnetic component datum and remains fixed to it until validated insertion release.',
      )),
      machineBoxStep([2, 1, 0], [7, 3, 7], 'structure', 'Backs the pickup face so magnetic holding load reaches the ram', purpose(
        'insertion-head:pickup-backing',
        'Removing it leaves the pickup plate disconnected from the ram and moving slide that prescribe the insertion stroke.',
        'carries', 'the electromagnetic pickup plate from the insertion ram',
        'The backing shares its full lower face with the pickup and a centered upper face with both buffer and ram root.',
      )),
      machineBoxStep([3, 4, 0], [5, 3, 2], 'detail', 'Represents the pre-frame-zero charge buffer for the electromagnetic pickup', purpose(
        'insertion-head:precharged-pickup-buffer',
        'Removing it leaves the already-energized magnetic hold without a visible head-local service source before frame zero.',
        'routes-service-to', 'the electromagnetic pickup plate',
        'The buffer face-connects the pickup backing and the ram conduit; it records a precharged source without simulating electricity or energy use.',
      )),
      machineBoxStep([4, 4, 2], [3, 14, 3], 'wear', 'Carries insertion load from the moving slide to the pickup plate', purpose(
        'insertion-head:insertion-ram',
        'Removing it leaves a fourteen-voxel gap between the pickup backing and the moving slide assembly.',
        'carries', 'the pickup plate along the prescribed insertion stroke',
        'The centered ram face-connects the pickup backing at its lower end and all four slide bridges along its upper span.',
      )),
      machineBoxStep([5, 4, 2], [1, 14, 1], 'detail', 'Routes the local buffer service through the ram to the magnetic pickup', purpose(
        'insertion-head:ram-service-conduit',
        'Removing it breaks the visible local service route between the precharged buffer and the electromagnetic pickup backing.',
        'routes-service-to', 'the electromagnetic pickup plate',
        'The one-voxel conduit runs continuously inside the ram from the buffer face to the pickup-backing face without implying a moving external cable.',
      )),
      machineBoxStep([1, 7, 0], [3, 5, 7], 'structure', 'Builds the west load-bearing half of the moving slide', purpose(
        'insertion-head:west-slide-half',
        'Removing it leaves every west end of the four transverse slide bridges unsupported.',
        'carries', 'the west ends of the moving slide bridges',
        'The three-by-seven slide half face-connects all four bridge ends and the rear tie on the same prescribed moving body.',
      )),
      machineBoxStep([7, 7, 0], [3, 5, 7], 'structure', 'Builds the east load-bearing half of the moving slide', purpose(
        'insertion-head:east-slide-half',
        'Removing it leaves every east end of the four transverse slide bridges unsupported.',
        'carries', 'the east ends of the moving slide bridges',
        'The three-by-seven slide half face-connects all four bridge ends and the rear tie on the same prescribed moving body.',
      )),
      machineBoxStep([4, 7, 0], [3, 2, 2], 'structure', 'Closes the lower front slide bridge', purpose(
        'insertion-head:lower-front-slide-bridge',
        'Removing it leaves the lower front edges of the west and east slide halves disconnected around the ram.',
        'anchors', 'the lower front ram corner between both slide halves',
        'The three-wide bridge face-connects both slide halves and the centered ram at the lower-front corner of the slide cage.',
      )),
      machineBoxStep([4, 7, 5], [3, 2, 2], 'structure', 'Closes the lower rear slide bridge', purpose(
        'insertion-head:lower-rear-slide-bridge',
        'Removing it leaves the lower rear edges of the west and east slide halves disconnected around the ram.',
        'anchors', 'the lower rear ram corner between both slide halves',
        'The three-wide bridge face-connects both slide halves and the centered ram at the lower-rear corner of the slide cage.',
      )),
      machineBoxStep([4, 10, 0], [3, 2, 2], 'structure', 'Closes the upper front slide bridge', purpose(
        'insertion-head:upper-front-slide-bridge',
        'Removing it leaves the upper front edges of the west and east slide halves disconnected around the ram.',
        'anchors', 'the upper front ram corner between both slide halves',
        'The three-wide bridge face-connects both slide halves and the centered ram at the upper-front corner of the slide cage.',
      )),
      machineBoxStep([4, 10, 5], [3, 2, 2], 'structure', 'Closes the upper rear slide bridge', purpose(
        'insertion-head:upper-rear-slide-bridge',
        'Removing it leaves the upper rear edges of the west and east slide halves disconnected around the ram.',
        'anchors', 'the upper rear ram corner between both slide halves',
        'The three-wide bridge face-connects both slide halves and the centered ram at the upper-rear corner of the slide cage.',
      )),
      machineBoxStep([0, 8, 6], [11, 2, 5], 'structure', 'Ties both slide halves to the rear alignment datums and open actuator yoke', purpose(
        'insertion-head:rear-slide-yoke-tie',
        'Removing it leaves both rear alignment datums and the three-sided actuator yoke disconnected from the moving slide halves.',
        'carries', 'the rear alignment datums and moving C-yoke',
        'The eleven-wide tie spans z=6 through z=11, face-connecting the slide halves at their rear faces and both yoke cheeks at its own.',
      )),
      machineBoxStep([0, 8, 16], [1, 2, 2], 'wear', 'Exposes the west rear visual alignment datum without claiming captive constraint', purpose(
        'insertion-head:west-visual-alignment-datum',
        'Removing it leaves the west bridge face with no named moving datum for checking the prescribed stroke.',
        'aligns', 'the head against the west straight bridge datum face',
        'The west pad remains tangent to its matching straight face throughout the swept pose as visual evidence only, with no solved constraint.',
      )),
      machineBoxStep([10, 8, 16], [1, 2, 2], 'wear', 'Exposes the east rear visual alignment datum without claiming captive constraint', purpose(
        'insertion-head:east-visual-alignment-datum',
        'Removing it leaves the east bridge face with no named moving datum for checking the prescribed stroke.',
        'aligns', 'the head against the east straight bridge datum face',
        'The east pad remains tangent to its matching straight face throughout the swept pose as visual evidence only, with no solved constraint.',
      )),
      machineBoxStep([1, 8, 11], [1, 2, 6], 'safety', 'Marks the moving west yoke cheek and its pinch boundary outside the stator running clearance', purpose(
        'insertion-head:west-moving-yoke-cheek',
        'Removing it opens the west side of the three-sided moving actuator yoke and hides that side of the pinch envelope.',
        'engages', 'the west side of the fixed stator through running clearance',
        'The orange cheek stays outside the cream stator volume across the full swept pose and carries no claim of contact or captive guidance.',
      )),
      machineBoxStep([9, 8, 11], [1, 2, 6], 'safety', 'Marks the moving east yoke cheek and its pinch boundary outside the stator running clearance', purpose(
        'insertion-head:east-moving-yoke-cheek',
        'Removing it opens the east side of the three-sided moving actuator yoke and hides that side of the pinch envelope.',
        'engages', 'the east side of the fixed stator through running clearance',
        'The orange cheek stays outside the cream stator volume across the full swept pose and carries no claim of contact or captive guidance.',
      )),
      machineBoxStep([2, 8, 16], [7, 2, 1], 'safety', 'Marks the moving rear C-yoke bridge while preserving stator running clearance', purpose(
        'insertion-head:rear-moving-yoke-bridge',
        'Removing it leaves the two yoke cheeks as unrelated bars and opens the rear of the intended three-sided actuator coupling.',
        'engages', 'the rear side of the fixed stator through running clearance',
        'The orange rear bar face-connects both cheeks while the cream stator remains inside the empty C-cavity without overlap.',
      )),
    ],
  });
}

export function createMachineWorksProductBaseRecipe(): RecipeV1 {
  return defineMachineRecipe({
    id: 'product-base',
    label: 'Keyed product base',
    seed: 7_207,
    size: [11, 4, 11],
    summary: 'A low cruciform workpiece base carries one square keyed socket without ornamental pads.',
    tags: ['product-component', 'base', 'socket', 'cruciform'],
    roles: ['empty', 'product', 'wear'],
    steps: [
      machineBoxStep([0, 0, 3], [11, 1, 5], 'product', 'Extends the product-base footprint across the transverse axis', purpose(
        'product-base:transverse-footprint-arm',
        'Removing it leaves the carrier-mounted base only five voxels wide across the transverse insertion axis.',
        'bounds', 'the transverse footprint of the product base',
        'The eleven-wide arm is centered beneath the keyed socket and intersects the longitudinal arm across the full socket footprint.',
      )),
      machineBoxStep([3, 0, 0], [5, 1, 11], 'product', 'Extends the product-base footprint along the conveyor axis', purpose(
        'product-base:longitudinal-footprint-arm',
        'Removing it leaves the carrier-mounted base only five voxels deep along the conveyor and insertion-station axis.',
        'bounds', 'the longitudinal footprint of the product base',
        'The eleven-deep arm is centered beneath the keyed socket and intersects the transverse arm across the full socket footprint.',
      )),
      purposefulPartStep('open-frame', [3, 1, 3], {
        width: 5,
        height: 3,
        depth: 5,
        thickness: 1,
        role: 'wear',
      }, 'Frames the central keyed socket', purpose(
        'product-base:central-keyed-socket',
        'Removing it leaves the product-core lower stem with no receiving geometry or named insertion frame on the base.',
        'mates', 'the product-core lower key',
        'The five-by-five open frame leaves two empty insertion layers around the three-by-three core stem before compound attachment.',
      )),
    ],
  });
}

export function createMachineWorksProductCoreRecipe(): RecipeV1 {
  return defineMachineRecipe({
    id: 'product-core',
    label: 'Caged product core',
    seed: 7_229,
    size: [7, 9, 7],
    summary: 'A narrow keyed stem supports an open cage whose shortened center leaves two insertion layers and a top seating plane for the cap.',
    tags: ['product-component', 'core', 'cage', 'keyed-stem'],
    roles: ['empty', 'product', 'wear', 'detail'],
    steps: [
      machineBoxStep([2, 0, 2], [3, 2, 3], 'wear', 'Shapes the keyed lower stem', purpose(
        'product-core:keyed-lower-stem',
        'Removing it leaves the core without geometry that enters and locates inside the product-base socket.',
        'mates', 'the product-base central keyed socket',
        'The exact three-by-three stem fills two empty socket layers flush inside the five-by-five keyed frame.',
      )),
      purposefulPartStep('open-frame', [0, 2, 0], {
        width: 7,
        height: 7,
        depth: 7,
        thickness: 1,
        role: 'product',
      }, 'Builds the open product cage and top seating perimeter', purpose(
        'product-core:open-cage',
        'Removing it leaves the cap without an occupied top seating perimeter and leaves the inner column without an exterior product body.',
        'locates', 'the product-cap crown on the core top plane',
        'The seven-cube edge frame preserves open faces and supplies the occupied layer-nine perimeter that stops the cap crown vertically.',
      )),
      machineBoxStep([2, 2, 2], [3, 5, 3], 'detail', 'Raises the inner column while leaving two vertical insertion layers and one-voxel lateral assembly clearance', purpose(
        'product-core:shortened-inner-column',
        'Removing it leaves the caged core hollow beneath the cap key and removes the central load path down to the base stem.',
        'supports', 'the keyed cap insertion axis above the base stem',
        'The three-by-three column is coaxial with the lower stem but stops two layers below the cage top to leave exact cap-key clearance.',
      )),
      machineBoxStep([0, 5, 0], [7, 1, 1], 'product', 'Ties both cage sides into the transverse half of the mid-height cross-brace', purpose(
        'product-core:transverse-cage-brace',
        'Removing it leaves the depth brace as the only mid-height connection between the left and right cage sides.',
        'anchors', 'the transverse cage sides to the depth brace',
        'The seven-wide bar face-connects both side posts and intersects the depth brace at the front-center cell.',
      )),
      machineBoxStep([3, 5, 0], [1, 1, 7], 'product', 'Connects the inner column to both cage depth edges at mid-height', purpose(
        'product-core:depth-column-brace',
        'Removing it leaves the shortened inner column disconnected from the open cage perimeter.',
        'anchors', 'the inner column to the front and rear cage edges',
        'The seven-deep bar crosses the column at its center and face-connects the cage edges at z=0 and z=6.',
      )),
    ],
  });
}

export function createMachineWorksProductCapRecipe(): RecipeV1 {
  return defineMachineRecipe({
    id: 'product-cap',
    label: 'Tapered product cap',
    seed: 7_251,
    size: [11, 5, 11],
    summary: 'A broad tapered crown carries an underside insertion key whose shoulder seats on the core frame, plus a centered magnetic pickup datum.',
    tags: ['product-component', 'cap', 'tapered', 'keyed-seat'],
    roles: ['empty', 'product', 'wear', 'safety', 'detail'],
    steps: [
      machineBoxStep([4, 0, 4], [3, 2, 3], 'wear', 'Shapes the underside key for two-voxel insertion with deliberate lateral assembly clearance', purpose(
        'product-cap:underside-key',
        'Removing it leaves the cap with no geometry that enters and laterally locates inside the product-core socket.',
        'mates', 'the product-core cap socket',
        'The centered three-by-three key enters the two empty core layers with one voxel of lateral clearance before the crown seats.',
      )),
      purposefulPartStep('tapered-mass', [0, 2, 0], {
        width: 11,
        height: 3,
        depth: 11,
        topWidth: 7,
        topDepth: 7,
        role: 'product',
      }, 'Builds the stepped cap crown whose underside shoulder supplies the vertical seat', purpose(
        'product-cap:seated-crown',
        'Removing it leaves only an insertion key with no cap body, no vertical seating shoulder, and no pickup surface.',
        'mates', 'the product-core top seating perimeter',
        'The broad crown underside meets the occupied core top plane only after the two-voxel key clears the socket.',
      )),
      machineBoxStep([2, 4, 5], [7, 1, 1], 'detail', 'Marks the transverse axis of the ferromagnetic pickup datum', purpose(
        'product-cap:transverse-pickup-datum',
        'Removing it leaves the pickup face without a visible transverse centerline for cap placement.',
        'locates', 'the electromagnetic pickup across the cap width',
        'The seven-voxel material stripe crosses the crown top through its exact center without adding unsupported geometry.',
      )),
      machineBoxStep([5, 4, 2], [1, 1, 7], 'safety', 'Marks the depth axis of the ferromagnetic pickup datum', purpose(
        'product-cap:depth-pickup-datum',
        'Removing it leaves the pickup face without a visible fore-aft centerline or orientation witness for cap placement.',
        'locates', 'the electromagnetic pickup along the cap depth',
        'The seven-voxel material stripe crosses the transverse datum at the crown center and distinguishes pickup orientation.',
      )),
    ],
  });
}

export function createMachineWorksRecipeBook(): RecipeBookV1 {
  const recipes = [
    createMachineWorksRailFoundationRecipe(),
    createMachineWorksPressBridgeRecipe(),
    createMachineWorksConveyorSlatRecipe(),
    createMachineWorksDriveDrumRecipe(),
    createMachineWorksExposedDriveCogRecipe(),
    createMachineWorksCollectionBucketRecipe(),
    createMachineWorksOutputDockRecipe(),
    createMachineWorksTransferCarriageRecipe(),
    createMachineWorksInsertionHeadRecipe(),
    createMachineWorksProductBaseRecipe(),
    createMachineWorksProductCoreRecipe(),
    createMachineWorksProductCapRecipe(),
  ];
  return Object.fromEntries(recipes.map((recipe) => [recipe.id, recipe]));
}

export function createMachineWorksStepPurposeMapV1():
readonly MachineWorksRecipeStepPurposeV1[] {
  const records = Object.values(createMachineWorksRecipeBook()).flatMap(
    (recipe) => machineWorksStepPurposesForRecipeV1(recipe),
  );
  const ids = new Set<string>();
  for (const record of records) {
    if (ids.has(record.id)) {
      throw new Error(
        `Cannot publish Machine Works step-purpose map: id '${record.id}' is repeated.`,
      );
    }
    ids.add(record.id);
  }
  return Object.freeze(records);
}

export const MACHINE_WORKS_STEP_PURPOSES_V1 =
  createMachineWorksStepPurposeMapV1();
