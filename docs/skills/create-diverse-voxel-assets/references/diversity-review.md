# Diversity review

Use this reference to generate design hypotheses, audit a catalog, shortlist candidates, or decide whether an asset is genuinely new.

## Creative brief

Record this before generating:

```text
Consumer and gameplay or scene need:
Camera, scale, and viewing distance:
Semantic role:
Art-direction invariants:
Physical, picking, and animation needs:
Nearest existing assets:
Must preserve:
Must differ:
Forbidden shortcuts:
Candidate families:
Wildcard hypothesis:
Acceptance evidence:
```

The semantic role and view conditions prevent attractive but unusable specimens. The nearest-neighbor list prevents rediscovering the catalog.

## Separate domain from shape grammar

A domain says what an asset is for; a family says how its form is organized. Cross them deliberately. A bridge does not have to use arch grammar, a civic object does not have to be centered and monumental, and an organic asset does not have to be a tree.

Maintain a coverage matrix of semantic roles against shape families. Empty useful cells are stronger prompts than “make twenty more variants.”

## Generate in exploration bands

Include all three bands in a serious batch:

1. **Useful anchors** solve the brief directly while creating clear catalog contrast.
2. **Cross-family transfers** apply a grammar normally associated with another domain.
3. **Wildcards** invert one organizing assumption while preserving function and readability.

Use transformations that change the idea:

- split, bridge, pierce, ring, branch, nest, suspend, cantilever, terrace, braid, or carve the topology;
- change dominant, secondary, and tertiary mass hierarchy;
- exchange closed mass for framed void, centered balance for controlled asymmetry, or vertical emphasis for horizontal reach;
- swap construction grammar among arch, frame, truss, taper, stair, radial, branching, and hybrid systems;
- move material roles to joints, edges, cores, skins, repeated bays, or controlled accents;
- add articulation only when a hinge, wheel, gate, lift, sway, pulse, or translation expresses function.

Parameter sweeps are useful inside one hypothesis. They do not replace multiple hypotheses.

## Contrast axes

Use these axes independently:

| Axis | Ask | Useful evidence |
| --- | --- | --- |
| Topology and negative space | Are the solids, holes, branches, rings, or components organized differently? | Cropped occupancy, topology hash, connected components, void inspection |
| Silhouette and massing | Does it read differently from front, side, diagonal, and game camera, including its centered, mirrored, radial, or asymmetric balance? | Fixed multi-view sheet, intended-scale capture, and symmetry metric as supporting evidence |
| Scale and proportion | Is the dimensional hierarchy meaningfully different rather than padded? | Occupied bounds, aspect ratios, game-unit comparison |
| Construction grammar | Is it made through a different structural logic? | Build stages, part graph, direct-step rhythm |
| Material-role rhythm | Do roles organize the form differently, beyond a palette swap? | Role occupancy and fixed-view render |
| Semantic motion | Does movement reveal function or state? | Exact phase sheet and paused readable pose |

Require at least two major model axes from this table for promotion. Prefer three when the nearest neighbors share the same semantic role. Symmetry supports topology or silhouette evidence rather than counting as an extra axis.

Apply scene relationship as a separate usefulness gate: the asset should create or satisfy a needed connection, route, control point, or hierarchy when the brief calls for one, but a new placement cannot make near-duplicate geometry pass the model-diversity gate.

## Reject false novelty

Reject a candidate when its apparent difference comes mainly from:

- a new seed with the same organizing form;
- palette, brightness, or material-role color changes;
- empty padding or a shifted origin;
- a rotation or mirror presented as a new design;
- repeated decorative accents on the same mass;
- one parameter exaggerated without a new hierarchy;
- motion that moves the whole asset without semantic meaning;
- a new name or domain tag on old geometry;
- metric distance that is visually negligible at game scale.

Also reject a visually novel asset when it cannot be rebuilt, does not fit the consumer's camera or performance budget, breaks picking or physical meaning, or contradicts the art direction.

## Selection record

For each promoted asset, record:

```text
Asset id and label:
Visual thesis:
Semantic role:
Nearest neighbors:
Major contrast axes:
Quantitative support:
Fixed-view evidence:
Motion evidence:
Scene role:
Reuse introduced:
Residual risks:
Reviewer decision:
```

Keep the decision legible to a future maintainer. “Looks different” and a scalar diversity score are not sufficient.
