import type {
  WindmillCompactBoxV1,
  WindmillCompactTripleV1,
} from './windmill-compact-geometry.js';
import {
  WINDMILL_COMPACT_FOLLOWER_ELBOW_X_V1,
} from './windmill-compact-geometry.js';

export * from './windmill-compact-appearance.js';

export interface WindmillCompactBoxRuleV1 {
  readonly ruleId: string;
  readonly beneficiary: string;
  readonly job: string;
  readonly minimumForm: string;
  readonly removalConsequence: string;
  readonly relocationConsequence: string;
  readonly relocationDelta: WindmillCompactTripleV1;
}


const Z_SHIFT = Object.freeze([0, 0, 1] as const);
const X_SHIFT = Object.freeze([1, 0, 0] as const);
const rule = (
  ruleId: string,
  beneficiary: string,
  job: string,
  minimumForm: string,
  removalConsequence: string,
  relocationConsequence: string,
  relocationDelta: WindmillCompactTripleV1 = Z_SHIFT,
): WindmillCompactBoxRuleV1 => Object.freeze({
  ruleId,
  beneficiary,
  job,
  minimumForm,
  removalConsequence,
  relocationConsequence,
  relocationDelta,
});

const BEARING_PREFIXES = Object.freeze([
  'rotor-front-bearing',
  'rotor-rear-bearing',
  'hammer-rear-bearing',
] as const);
const BEARING_SUFFIXES = Object.freeze([
  'left-post',
  'right-post',
  'cap',
  'saddle',
  'lower-left-liner',
  'lower-right-liner',
  'upper-left-liner',
  'upper-right-liner',
] as const);

function bearingRule(boxKey: string): WindmillCompactBoxRuleV1 | undefined {
  const prefix = BEARING_PREFIXES.find((entry) =>
    boxKey.startsWith(`${entry}-`));
  if (prefix === undefined) return undefined;
  const suffix = boxKey.slice(prefix.length + 1);
  if (!(BEARING_SUFFIXES as readonly string[]).includes(suffix)) {
    throw new Error(
      `Cannot account for compact bearing box '${boxKey}': suffix `
      + `'${suffix}' is outside the bounded eight-piece ring rule.`,
    );
  }
  if (suffix === 'left-post' || suffix === 'right-post') {
    const side = suffix.startsWith('left') ? 'left' : 'right';
    return rule(
      `bearing-ring:${prefix}:${side}-post`,
      `The ideal ${prefix} revolute datum, its ${side} aperture boundary, both cross-members, and ground.`,
      `Expose the ${side}-side fixed support path from ground to both cross-members and locate the two ${side} clearance markers around the solver-owned axis.`,
      `One one-course-wide post spans exactly from ground through the cap course on the ${side} datum.`,
      `The ${side} visual support path to ground and both ${side} clearance-marker interfaces disappear.`,
      `The post leaves the ideal-joint z-plane and no longer locates its cap, saddle, or two clearance markers.`,
    );
  }
  if (suffix === 'cap' || suffix === 'saddle') {
    const vertical = suffix === 'cap' ? 'upper' : 'lower';
    return rule(
      `bearing-ring:${prefix}:${suffix}`,
      `The ideal ${prefix} revolute datum, two side posts, and ${vertical} clearance-marker pair.`,
      `Close the ${vertical} three-course fixed-support span and communicate the ${vertical} boundary of the ideal journal aperture.`,
      `One three-by-one course is the shortest span that reaches both posts and both ${vertical} liners.`,
      `The ${vertical} visual aperture boundary and fixed cross-tie between the two posts disappear.`,
      `The cross-member leaves both post faces and the two ${vertical} clearance datums.`,
    );
  }
  const vertical = suffix.startsWith('lower') ? 'lower' : 'upper';
  const side = suffix.includes('left') ? 'left' : 'right';
  const crossMember = vertical === 'lower' ? 'saddle' : 'cap';
  return rule(
    `bearing-ring:${prefix}:${vertical}-${side}-liner`,
    `A reader locating the ideal ${prefix} axis inside its ${vertical}-${side} clearance quadrant, plus the ${side} post and ${crossMember}.`,
    `Mark only the ${vertical}-${side} corner of the one-voxel radial-clearance cross around the solver-owned axis and close the post-to-${crossMember} visual contour.`,
    'One cube is the grid minimum that marks one otherwise-open diagonal clearance corner without filling a cardinal clearance cell.',
    `The ${vertical}-${side} corner marker disappears, making the ideal aperture contour ambiguous at that quadrant and removing both fixed-frame interfaces.`,
    `The cube leaves the ${vertical}-${side} clearance quadrant and loses its two contour interfaces.`,
  );
}

function collarRule(boxKey: string): WindmillCompactBoxRuleV1 | undefined {
  const match = /^(rotor-thrust|hammer)-collar-(west|east)$/.exec(boxKey);
  if (match === null) return undefined;
  const assembly = match[1] === 'rotor-thrust'
    ? 'rotor rear ideal-joint shoulder'
    : 'hammer rear ideal-joint shoulder';
  const side = match[2]!;
  const opposite = side === 'west' ? 'east' : 'west';
  return rule(
    `collar:${boxKey}`,
    `The balanced bilateral ${assembly}, continuous journal, and its ${opposite} arm.`,
    `Provide the ${side} visible half of the shoulder outside the one-cell journal and cancel the equal opposite radial first moment of the ${opposite} arm.`,
    `One two-cell, one-course arm reaches from the journal face across the ${side} half of the three-cell aperture to one visible cell beyond it; a shorter arm is hidden inside the aperture.`,
    `The shoulder becomes one-sided and its equal-and-opposite collar-subassembly radial first-moment cancellation is lost.`,
    `The arm leaves the journal face, breaks the bilateral shoulder datum, and no longer mirrors the ${opposite} arm.`,
    [0, 1, 0],
  );
}

function sailRule(boxKey: string): WindmillCompactBoxRuleV1 | undefined {
  const spar = /^(north|south)-spar$/.exec(boxKey);
  if (spar !== null) {
    const side = spar[1]!;
    return rule(
      `sail:${side}:spar`,
      `The ${side} two-slab stepped sail and rotor shaft.`,
      `Close only the radial gap between the shaft and the inner edge of the ${side} sail.`,
      'A one-by-one radial run spans exactly the parameter-derived gap and no panel area.',
      `The ${side} sail loses its direct face-connected path to the shaft.`,
      `The spar leaves the shaft/panel radial line and loses at least one endpoint interface.`,
    );
  }
  const step = /^(north|south)-panel-step-z([01])$/.exec(boxKey);
  if (step === null) return undefined;
  const side = step[1]!;
  const zStep = step[2]!;
  return rule(
    `sail:${side}:step-z${zStep}`,
    `The geometry-derived ${side} two-step plate and its load-frame calculation.`,
    `Supply the maximal rectangular z${zStep} slab of the bounded face-connected step used to derive plate area, centroid, chord, and normal.`,
    'One two-by-span-by-one slab exactly covers this step layer; extending it fills an empty pitch corner, while shrinking it removes authored plate cells.',
    `The z${zStep} slab cells and their contribution to the ${side} derived plate frame disappear.`,
    `The z${zStep} slab leaves its authored step datum, changing adjacency and the derived plate frame.`,
  );
}

function exactRule(box: WindmillCompactBoxV1): WindmillCompactBoxRuleV1 {
  switch (box.key) {
    case 'rotor-bearing-ground-tie':
      return rule('frame:rotor-bearing-z-tie', 'The front and rear rotor bearing left posts.', 'Tie their separated ground datums along Z.', 'One one-course ground run spans only the gap between the two posts.', 'The two rotor bearing bents lose their direct ground-level connection.', 'The run leaves ground or one post endpoint.', [0, 1, 0]);
    case 'rotor-to-hammer-ground-x':
      return rule('frame:rotor-hammer-x-leg', 'The rotor-to-hammer fixed-frame route.', 'Close only the X leg from the rotor-side corner to the hammer left post.', 'One one-course X run spans the exact endpoint gap.', 'The hammer post loses the X leg of its route to the rotor frame.', 'The X leg leaves ground or its hammer-post endpoint.', [0, 1, 0]);
    case 'rotor-to-hammer-ground-z':
      return rule('frame:rotor-hammer-z-leg', 'The rotor-to-hammer fixed-frame route.', 'Close only the Z leg between the rotor footing and X-leg corner.', 'One one-course Z run spans the exact endpoint gap.', 'The orthogonal route opens between rotor footing and X leg.', 'The Z leg leaves ground or one corner endpoint.', [0, 1, 0]);
    case 'rotor-shaft':
      return rule('rotor:continuous-shaft', 'Both rotor bearing ports, sails, collars, and the two cam arms.', 'Provide the single continuous rotor-axis core to which every rotor load path attaches.', 'One-by-one section from the front bearing datum through the outermost cam attachment plane is the grid minimum; the rear bearing, sails, and collars lie inside that run.', 'All attached rotor paths lose their common core or an axial bearing endpoint.', 'The core leaves the declared rotor-axis port and attached radial interfaces.', X_SHIFT);
    case 'rotor-cam-arm':
      return rule('rotor:primary-cam-arm', "The rotor shaft and 'rotor-cam-nose'.", 'Close the positive radial torque path from shaft to primary nose.', 'A one-cell-deep bar spans exactly shaft to nose.', 'The primary nose is disconnected from the shaft.', 'The arm loses its shaft or nose face interface.');
    case 'rotor-cam-nose':
      return rule('rotor:primary-cam-nose', "The declared 'cam-follower' group and primary arm.", 'Provide its one-cube primary rotating-side participant at the authored sweep-plane datum.', 'One terminal cube is the localized participant minimum.', "The group loses 'rotor-cam-nose' and the primary arm loses its endpoint.", 'The nose leaves the arm face or shared axial contact-alignment interval.');
    case 'rotor-opposed-cam-arm':
      return rule('rotor:opposed-cam-arm', "The rotor shaft and 'rotor-opposed-cam-nose'.", 'Close the negative radial torque path from shaft to opposed nose.', 'A one-cell-deep bar spans exactly shaft to nose.', 'The opposed nose is disconnected from the shaft.', 'The arm loses its shaft or nose face interface.');
    case 'rotor-opposed-cam-nose':
      return rule('rotor:opposed-cam-nose', "The declared 'cam-follower' group and opposed arm.", 'Provide its one-cube opposed rotating-side participant at the authored sweep-plane datum.', 'One terminal cube is the localized participant minimum.', "The group loses 'rotor-opposed-cam-nose' and the opposed arm loses its endpoint.", 'The nose leaves the arm face or shared axial contact-alignment interval.');
    case 'hammer-pivot-core':
      return rule('hammer:continuous-journal', 'The hammer bearing port, collars, follower links, and right beam.', 'Provide the single continuous hammer-axis core shared by both lever arms.', 'One-by-one section from the outermost lever attachment plane through the outermost collar attachment plane is the grid minimum; the rear bearing lies inside that run.', 'The two lever sides and rear shoulder lose their common journal.', 'The core leaves the hammer-axis port or attached lever interfaces.', X_SHIFT);
    case 'hammer-follower-shoe':
      return rule('hammer:follower-shoe', "The declared 'cam-follower' group and upper link.", 'Provide the one-cube follower-side participant and its link endpoint.', 'One cube is the localized participant minimum.', "The group loses 'hammer-follower-shoe' and the upper link loses its endpoint.", 'The shoe leaves the upper-link face or shared axial contact-alignment interval.');
    case 'hammer-follower-upper-link':
      return rule(
        'hammer:follower-upper-link',
        `The follower shoe and the first column beyond every bounded cam nose at x=${String(WINDMILL_COMPACT_FOLLOWER_ELBOW_X_V1)}.`,
        'Carry the follower load at contact elevation only until the bounded cam envelope has ended, then hand it to the lower link.',
        'One one-course run spans shoe to the earliest common safe elbow; a later elbow adds raised cells outside the contact envelope, while an earlier elbow enters that envelope for the maximum cam radius.',
        'The shoe is disconnected from the independently derived envelope-clear elbow.',
        'The segment loses its shoe or envelope-clear elbow interface.',
      );
    case 'hammer-follower-lower-link':
      return rule(
        'hammer:follower-lower-link',
        `The envelope-clear elbow at x=${String(WINDMILL_COMPACT_FOLLOWER_ELBOW_X_V1)} and hammer journal.`,
        'Close the remaining path at pivot elevation after the cam envelope has ended.',
        'One one-course run spans exactly from the earliest common safe elbow to the journal; moving the elbow later adds raised material with no contact job.',
        'The follower side is disconnected from the journal.',
        'The segment loses its derived elbow or journal interface.',
      );
    case 'hammer-right-beam':
      return rule('hammer:right-beam', 'The hammer journal and terminal head.', 'Close only the selected right-hand lever span from pivot to head.', 'One one-by-one course spans the selected length.', 'The terminal head is disconnected from the journal.', 'The beam loses its journal or head endpoint.');
    case 'hammer-impact-toe':
      return rule('hammer:contact-toe', "The declared 'head-anvil' group and terminal hammer head.", 'Provide the sole moving-side one-cube participant and the H1 minimum terminal head mass.', 'One cube is the minimum localized participant and H1 terminal mass.', "The group loses 'hammer-impact-toe' and the terminal head loses its bottom datum.", 'The toe leaves the head path or shared anvil column alignment.');
    case 'hammer-head-mass':
      return rule('hammer:optional-head-mass', "The terminal head, right beam, and 'hammer-impact-toe'.", 'Add exactly H-1 candidate mass cells as the face-connected right-beam-to-toe link without widening contact.', 'Exactly H-1 vertical cells; absent at H1.', 'The extra candidate mass and beam-to-toe connector disappear.', 'The mass leaves the beam/toe vertical path.');
    case 'anvil-column':
      return rule('anvil:ground-column', "The fixed 'anvil-impact-cap' and ground plane.", 'Provide the one-by-one fixed path from the cap datum to ground.', 'One vertical voxel column spans exactly ground to cap.', 'The cap loses its direct fixed path to ground.', 'The column leaves the cap column or ground datum.');
    case 'anvil-impact-cap':
      return rule('anvil:contact-cap', "The exact 'hammer-impact-toe' box.", 'Provide the sole fixed-side one-cube participant at the top of the direct ground path; at zero column height the cube itself touches ground.', 'One cube is the localized fixed participant minimum.', "The 'head-anvil' group loses its fixed participant.", 'The cap leaves the toe-aligned ground-or-column datum.');
    default:
      throw new Error(
        `Cannot account for compact windmill box '${box.key}': no exact `
        + 'box rule or bounded repeated-structure rule exists.',
      );
  }
}

export function windmillCompactBoxRuleV1(
  box: WindmillCompactBoxV1,
): WindmillCompactBoxRuleV1 {
  return bearingRule(box.key)
    ?? collarRule(box.key)
    ?? sailRule(box.key)
    ?? exactRule(box);
}
