import { describe, expect, it } from 'vitest';

import { NoteStore } from './notes.js';

describe('note store', () => {
  it('pins a note to a moment: a time and a spot on the picture', () => {
    const notes = new NoteStore();
    const note = notes.addMoment(750, { u: 0.4, v: 0.6 }, 'the cap clips here');
    expect(note).toMatchObject({
      kind: 'moment',
      timeMs: 750,
      spot: { u: 0.4, v: 0.6 },
      text: 'the cap clips here',
    });
    expect(notes.list()).toEqual([note]);
  });

  it('pins a note to a place: an exact voxel', () => {
    const notes = new NoteStore();
    const note = notes.addPlace({ x: 2, y: 3, z: 2 }, 'this wall should be darker');
    expect(note).toMatchObject({ kind: 'place', voxel: { x: 2, y: 3, z: 2 } });
  });

  it('refuses an empty note — a mark with no words asks for a guess', () => {
    const notes = new NoteStore();
    expect(() => notes.addMoment(0, { u: 0.5, v: 0.5 }, '   ')).toThrow(/words/i);
    expect(() => notes.addPlace({ x: 0, y: 0, z: 0 }, '')).toThrow(/words/i);
    expect(notes.list()).toEqual([]);
  });

  it('refuses a spot outside the picture', () => {
    const notes = new NoteStore();
    expect(() => notes.addMoment(0, { u: -0.1, v: 0.5 }, 'x')).toThrow(/inside/i);
    expect(() => notes.addMoment(0, { u: 0.2, v: 1.5 }, 'x')).toThrow(/inside/i);
  });

  it('removes a note by its number and says whether it did', () => {
    const notes = new NoteStore();
    const a = notes.addMoment(100, { u: 0.1, v: 0.1 }, 'a');
    const b = notes.addPlace({ x: 1, y: 1, z: 1 }, 'b');
    expect(notes.remove(a.id)).toBe(true);
    expect(notes.remove(a.id)).toBe(false);
    expect(notes.list()).toEqual([b]);
  });

  it('gives every note its own number, never reusing a removed one', () => {
    const notes = new NoteStore();
    const a = notes.addMoment(0, { u: 0.5, v: 0.5 }, 'a');
    notes.remove(a.id);
    const b = notes.addMoment(0, { u: 0.5, v: 0.5 }, 'b');
    // Reusing a number would let a stale reference land on the wrong note.
    expect(b.id).not.toBe(a.id);
  });

  it('hands lists nobody can edit from outside', () => {
    const notes = new NoteStore();
    notes.addMoment(0, { u: 0.5, v: 0.5 }, 'a');
    const list = notes.list();
    expect(Object.isFrozen(list[0])).toBe(true);
  });
});
