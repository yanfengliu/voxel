export interface WindmillCompactPurposeNeedV1 {
  readonly beneficiary: string;
  readonly job: string;
  readonly minimumForm: string;
  readonly honestyBoundary: string;
}

const jointBoundary = 'The visible support communicates an ideal revolute datum; bearing pressure, friction, stress, and wear are not solved.';
const rigidBoundary = 'The fixture treats this path as rigid; stress, elastic deformation, fatigue, and wear are outside the proof.';
const contactBoundary = 'Geometry records only a declared rigid contact participant and static alignment; no selected dynamic proof is bound.';
const camContactBoundary = 'Geometry records only a declared rotating-side participant and opposed placement; no selected dynamic proof is bound.';

export const WINDMILL_COMPACT_PURPOSE_NEEDS_V1:
Readonly<Record<string, WindmillCompactPurposeNeedV1>> = Object.freeze({
  'windmill:purpose:rotor-front-bearing-support': {
    beneficiary: 'A reader locating the front ideal rotor axis and its fixed route to ground.',
    job: 'Communicate one cross-shaped journal-clearance aperture around the solver-owned axis, bounded by grounded side posts, cap, saddle, and four diagonal corner markers.',
    minimumForm: 'Two posts and two cross-members define the cardinal aperture bounds; four one-cube liners close the otherwise ambiguous diagonal corners without filling the one-voxel radial-clearance cross.',
    honestyBoundary: jointBoundary,
  },
  'windmill:purpose:rotor-rear-bearing-support': {
    beneficiary: 'A reader locating the rear ideal rotor axis and the second point that fixes its direction.',
    job: 'Communicate the rear cross-shaped journal-clearance aperture around the solver-owned axis and its fixed route to ground.',
    minimumForm: 'Two posts and two cross-members define the cardinal aperture bounds; four one-cube liners close the otherwise ambiguous diagonal corners without filling the one-voxel radial-clearance cross.',
    honestyBoundary: jointBoundary,
  },
  'windmill:purpose:rotor-bearing-ground-tie': {
    beneficiary: 'The two separated rotor bearing bents.',
    job: 'Expose their axial separation as one fixed grounded frame relationship.',
    minimumForm: 'A one-course rectilinear tie spans only the two candidate support datums.',
    honestyBoundary: rigidBoundary,
  },
  'windmill:purpose:hammer-rear-bearing-support': {
    beneficiary: 'A reader locating the ideal hammer pivot and its fixed route to ground.',
    job: 'Communicate one cross-shaped journal-clearance aperture around the solver-owned hammer axis, bounded by grounded side posts, cap, saddle, and four diagonal corner markers.',
    minimumForm: 'Two posts and two cross-members define the cardinal aperture bounds; four one-cube liners close the otherwise ambiguous diagonal corners without filling the one-voxel radial-clearance cross.',
    honestyBoundary: jointBoundary,
  },
  'windmill:purpose:rotor-hammer-ground-tie': {
    beneficiary: 'The rotor and hammer fixed support groups.',
    job: 'Expose their relative datum as one grounded frame rather than unrelated stands.',
    minimumForm: 'One-course orthogonal runs continue the rear-left rotor footing behind the lever plane, then cross only to the hammer bearing left post.',
    honestyBoundary: rigidBoundary,
  },
  'windmill:purpose:continuous-rotor-shaft': {
    beneficiary: 'Both rotor bearing datums, sail paths, collars, and declared cam paths.',
    job: 'Provide their one continuous common rotor-axis core.',
    minimumForm: 'The one-by-one continuous core is the grid minimum around the declared axis.',
    honestyBoundary: rigidBoundary,
  },
  'windmill:purpose:rear-thrust-shoulder': {
    beneficiary: 'A reader distinguishing the moving rotor from its rear ideal-joint aperture, plus the rotating collar subassembly mass balance.',
    job: 'Expose a centered bilateral moving-side shoulder outside the aperture and cancel the two equal opposite collar-arm radial first moments.',
    minimumForm: 'Two mirrored two-cell arms reach from the one-cell shaft to one visible cell beyond each side of the three-cell aperture; either arm alone is both visually one-sided and radially unbalanced.',
    honestyBoundary: jointBoundary,
  },
  'windmill:purpose:north-sail-load-path': {
    beneficiary: 'The north stepped sail and rotor shaft.',
    job: 'Provide the north panel-to-shaft face-connected radial path.',
    minimumForm: 'A one-course radial spar spans only the hub-to-panel gap.',
    honestyBoundary: rigidBoundary,
  },
  'windmill:purpose:south-sail-load-path': {
    beneficiary: 'The south stepped sail and rotor shaft.',
    job: 'Provide the south panel-to-shaft face-connected radial path.',
    minimumForm: 'A one-course radial spar spans only the hub-to-panel gap.',
    honestyBoundary: rigidBoundary,
  },
  'windmill:purpose:north-visible-pitched-panel': {
    beneficiary: 'The geometry-derived north wind-load frame.',
    job: 'Provide one face-connected two-step plate whose occupied cells derive load area and normal.',
    minimumForm: 'Two maximal rectangular slabs exactly cover the nonrectangular stepped union; one cuboid would add empty corner cells.',
    honestyBoundary: 'The plate frame is a low-resolution load surrogate, not solved aerodynamics or CFD.',
  },
  'windmill:purpose:south-visible-pitched-panel': {
    beneficiary: 'The geometry-derived south wind-load frame.',
    job: 'Provide the diametric same-handed two-step plate whose occupied cells derive load area and normal.',
    minimumForm: 'Two maximal rectangular slabs exactly cover the nonrectangular stepped union; one cuboid would add empty corner cells.',
    honestyBoundary: 'The plate frame is a low-resolution load surrogate, not solved aerodynamics or CFD.',
  },
  'windmill:purpose:primary-cam-torque-arm': {
    beneficiary: "The rotor shaft and exact 'rotor-cam-nose' box.",
    job: 'Provide the positive radial shaft-to-primary-nose path without becoming a declared contact participant.',
    minimumForm: 'A one-cell-deep bar closes exactly the shaft-to-primary-nose span.',
    honestyBoundary: rigidBoundary,
  },
  'windmill:purpose:primary-cam-contact-nose': {
    beneficiary: "The exact 'hammer-follower-shoe' contact box.",
    job: 'Provide the primary localized rotating-side participant in the declared cam-follower contact group.',
    minimumForm: 'One terminal cube is the grid minimum for the primary localized cam contact.',
    honestyBoundary: camContactBoundary,
  },
  'windmill:purpose:opposed-cam-torque-arm': {
    beneficiary: "The rotor shaft and exact 'rotor-opposed-cam-nose' box.",
    job: 'Provide the negative radial shaft-to-opposed-nose path without becoming a declared contact participant.',
    minimumForm: 'A one-cell-deep bar closes exactly the shaft-to-opposed-nose span.',
    honestyBoundary: rigidBoundary,
  },
  'windmill:purpose:opposed-cam-contact-nose': {
    beneficiary: "The exact 'hammer-follower-shoe' contact box.",
    job: 'Provide the opposed localized rotating-side participant in the declared cam-follower contact group.',
    minimumForm: 'One terminal cube is the grid minimum for the opposed localized cam contact.',
    honestyBoundary: camContactBoundary,
  },
  'windmill:purpose:continuous-hammer-journal': {
    beneficiary: 'The hammer links, right beam, collars, and rear ideal revolute datum.',
    job: 'Provide their one continuous common hammer-axis core.',
    minimumForm: 'The one-by-one continuous core is the grid minimum around the declared axis.',
    honestyBoundary: jointBoundary,
  },
  'windmill:purpose:rear-hammer-shoulder': {
    beneficiary: 'A reader distinguishing the moving hammer from its rear ideal-joint aperture, plus the collar subassembly mass balance.',
    job: 'Expose a centered bilateral moving-side shoulder outside the aperture and cancel the two equal opposite collar-arm radial first moments.',
    minimumForm: 'Two mirrored two-cell arms reach from the one-cell journal to one visible cell beyond each side of the three-cell aperture; either arm alone is both visually one-sided and radially unbalanced.',
    honestyBoundary: jointBoundary,
  },
  'windmill:purpose:cam-follower-contact-participant': {
    beneficiary: 'The two cam noses and the short hammer arm.',
    job: 'Provide the localized follower-side participant in the declared cam-follower group and a face-connected endpoint for the hammer links.',
    minimumForm: 'One cube is the minimum localized follower contact and is the sole follower collider.',
    honestyBoundary: camContactBoundary,
  },
  'windmill:purpose:follower-to-pivot-load-path': {
    beneficiary: 'The follower and hammer pivot.',
    job: 'Join the follower to the hammer axis while changing elevation at the first X column beyond every bounded cam nose.',
    minimumForm: 'The upper course ends at max-cam-radius plus one; the lower course begins there and closes the remaining pivot gap. An earlier elbow enters the bounded contact envelope and a later elbow adds raised cells after that envelope ends.',
    honestyBoundary: rigidBoundary,
  },
  'windmill:purpose:pivot-to-head-load-path': {
    beneficiary: 'The hammer pivot and impact head.',
    job: 'Provide the rigid lever path between the pivot and terminal output mass.',
    minimumForm: 'A one-by-one course spans only the selected right-arm length.',
    honestyBoundary: rigidBoundary,
  },
  'windmill:purpose:hammer-impact-toe': {
    beneficiary: "The exact 'anvil-impact-cap' box and the terminal hammer load path.",
    job: 'Provide the sole moving-side head-anvil participant; at H1 the same cube is the minimum terminal head mass.',
    minimumForm: 'One cube is the grid minimum that supplies both terminal mass and localized contact at H1; taller candidates add mass above it without enlarging contact.',
    honestyBoundary: contactBoundary,
  },
  'windmill:purpose:hammer-head-return-mass': {
    beneficiary: "The candidate terminal hammer head and exact 'hammer-impact-toe' box.",
    job: 'Add only the requested H-1 candidate mass cells above the toe as the face-connected link from the right beam to that toe without enlarging contact area.',
    minimumForm: 'Exactly H-1 vertical cells exist above the toe when H is greater than one; this box is absent at H1.',
    honestyBoundary: 'Geometry proves the exact beam-to-cell-to-toe face path, and the sidecar supports static mass and uniform-gravity torque arithmetic only. No isolated upper-cell dynamics ablation was run; H1/H2/H3 search outcomes vary multiple conditions and do not prove this cell independently necessary or responsible for a cycle.',
  },
  'windmill:purpose:direct-ground-impact-reaction': {
    beneficiary: 'The fixed anvil contact cell.',
    job: 'Provide its direct one-column fixed path to the authored ground plane.',
    minimumForm: 'A one-by-one vertical column spans exactly from ground to the derived face.',
    honestyBoundary: rigidBoundary,
  },
  'windmill:purpose:hammer-contact-witness-face': {
    beneficiary: "The exact 'hammer-impact-toe' box.",
    job: 'Provide the sole fixed head-anvil contact cube directly above its grounded reaction path.',
    minimumForm: 'One voxel is the smallest rigid contact witness in this authored grid.',
    honestyBoundary: contactBoundary,
  },
});
