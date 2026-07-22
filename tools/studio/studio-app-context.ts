/**
 * The small shared vocabulary the studio's panels pass between one another.
 *
 * `mountStudio` stays the composition root: it owns the render session, the
 * camera, the frame loop, and the rollback that disposes them. These types are
 * only the state and anchors the game-neutral panels hand back and forth, kept
 * here so a panel module can name them without importing the whole app.
 */

/**
 * Where an unsaved note is being anchored while the person writes it: a moment
 * on the timeline (a point on the picture at a time), or a place on the model
 * (a grid cell). The stage arms moments; the editor arms places; the notes
 * panel turns whichever is pending into a saved note.
 */
export type PendingAnchor =
  | { readonly kind: 'moment'; readonly timeMs: number; readonly u: number; readonly v: number }
  | { readonly kind: 'place'; readonly x: number; readonly y: number; readonly z: number };

/**
 * The four mutable fields the editor, the notes panel, and the stage share by
 * reference, rather than copy: which floor and colour the editor is on, and
 * the note anchor being placed. Held once in the composition root and passed
 * into each panel, so a write in one is the read the next one sees.
 */
export interface StudioEditStateV1 {
  layer: number;
  selectedSlot: number;
  pending: PendingAnchor | null;
  armedForPlace: boolean;
}
