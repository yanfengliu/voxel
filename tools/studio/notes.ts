/**
 * Notes pinned while reviewing a model.
 *
 * A note anchors the owner's words to evidence: either a moment (a time in the
 * animation plus a spot on the picture) or a place (an exact voxel). Requests
 * bundle these notes with the words, so "the cap clips here" travels with
 * exactly where and when "here" is — the alternative is describing marks in
 * prose, which is the thing annotation exists to remove.
 *
 * Notes are review artifacts, not model data: they never enter the model and
 * are not part of what a request asks to change. They are how it was asked.
 */

export interface MomentNoteV1 {
  readonly kind: 'moment';
  readonly id: number;
  /** Time within the period this note was pinned at. */
  readonly timeMs: number;
  /** Fractions of the picture, 0..1 each way, so resizing keeps the spot. */
  readonly spot: { readonly u: number; readonly v: number };
  readonly text: string;
}

export interface PlaceNoteV1 {
  readonly kind: 'place';
  readonly id: number;
  readonly voxel: { readonly x: number; readonly y: number; readonly z: number };
  readonly text: string;
}

export type StudioNoteV1 = MomentNoteV1 | PlaceNoteV1;

function cleanText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new Error('A note needs words: a mark with no words asks for a guess.');
  }
  return trimmed;
}

export class NoteStore {
  #nextId = 1;
  #notes: StudioNoteV1[] = [];

  addMoment(timeMs: number, spot: { u: number; v: number }, text: string): MomentNoteV1 {
    if (!Number.isFinite(timeMs) || timeMs < 0) {
      throw new Error('A moment note needs a real time.');
    }
    if (!(spot.u >= 0 && spot.u <= 1 && spot.v >= 0 && spot.v <= 1)) {
      throw new Error('The spot must be inside the picture.');
    }
    const note: MomentNoteV1 = Object.freeze({
      kind: 'moment',
      id: this.#nextId++,
      timeMs: Math.round(timeMs),
      spot: Object.freeze({ u: spot.u, v: spot.v }),
      text: cleanText(text),
    });
    this.#notes.push(note);
    return note;
  }

  addPlace(voxel: { x: number; y: number; z: number }, text: string): PlaceNoteV1 {
    for (const part of [voxel.x, voxel.y, voxel.z]) {
      if (!Number.isInteger(part) || part < 0) {
        throw new Error('A place note needs an exact voxel.');
      }
    }
    const note: PlaceNoteV1 = Object.freeze({
      kind: 'place',
      id: this.#nextId++,
      voxel: Object.freeze({ x: voxel.x, y: voxel.y, z: voxel.z }),
      text: cleanText(text),
    });
    this.#notes.push(note);
    return note;
  }

  remove(id: number): boolean {
    const index = this.#notes.findIndex((note) => note.id === id);
    if (index < 0) return false;
    this.#notes.splice(index, 1);
    return true;
  }

  clear(): void {
    this.#notes = [];
  }

  list(): readonly StudioNoteV1[] {
    return [...this.#notes];
  }
}
