import { describe, expect, it } from 'vitest';

import { createStudioShelfOrderWorkspace } from './studio-shelf-order.js';

describe('Studio shelf ordering', () => {
  it('reorders stable IDs without changing the caller-owned collection', () => {
    const workspace = createStudioShelfOrderWorkspace();
    const ids = Object.freeze(['chair', 'table', 'bath']);

    const moved = workspace.move({
      kind: 'part',
      id: 'bath',
      targetId: 'chair',
      position: 'before',
    }, ids);
    expect(moved).toEqual(['bath', 'chair', 'table']);
    expect(Object.isFrozen(moved)).toBe(true);
    expect(() => (moved as string[]).reverse()).toThrow(TypeError);
    expect(workspace.order('part', ids)).toEqual(['bath', 'chair', 'table']);
    expect(ids).toEqual(['chair', 'table', 'bath']);
  });

  it('keeps model sections independent even when they contain the same IDs', () => {
    const workspace = createStudioShelfOrderWorkspace();

    workspace.move({
      kind: 'model',
      sectionIndex: 1,
      id: 'table',
      targetId: 'chair',
      position: 'before',
    }, ['chair', 'table']);

    expect(workspace.order('model', ['chair', 'table'], 0)).toEqual(['chair', 'table']);
    expect(workspace.order('model', ['chair', 'table'], 1)).toEqual(['table', 'chair']);
  });

  it('reconciles deletion and new entries while retaining the surviving order', () => {
    const workspace = createStudioShelfOrderWorkspace();
    workspace.move({
      kind: 'scene',
      id: 'third',
      targetId: 'first',
      position: 'before',
    }, ['first', 'second', 'third']);

    expect(workspace.order('scene', ['first', 'third', 'fourth'])).toEqual([
      'third',
      'first',
      'fourth',
    ]);
  });

  it('moves filtered targets against the complete order without disturbing hidden peers', () => {
    const workspace = createStudioShelfOrderWorkspace();
    workspace.move({
      kind: 'recipe',
      id: 'delta',
      targetId: 'alpha',
      position: 'before',
    }, ['alpha', 'bravo', 'charlie', 'delta']);

    expect(workspace.order('recipe', ['alpha', 'bravo', 'charlie', 'delta'])).toEqual([
      'delta',
      'alpha',
      'bravo',
      'charlie',
    ]);
  });

  it('rolls back an order when publishing its UI projection fails', () => {
    const workspace = createStudioShelfOrderWorkspace();

    expect(() => workspace.move({
      kind: 'part',
      id: 'table',
      targetId: 'chair',
      position: 'before',
    }, ['chair', 'table'], () => {
      throw new Error('shelf rebuild failed');
    })).toThrow('shelf rebuild failed');
    expect(workspace.order('part', ['chair', 'table'])).toEqual(['chair', 'table']);
  });

  it('rejects ambiguous IDs, invalid scopes, and missing targets while self moves are no-ops', () => {
    const workspace = createStudioShelfOrderWorkspace();

    expect(() => workspace.move(null as never, [])).toThrow(
      'A shelf move must be an object naming its kind, id, targetId, and position.',
    );
    expect(() => workspace.move({
      kind: 'scene',
      id: 'same',
      targetId: 'other',
      position: 'before',
    }, ['same', 'same', 'other'])).toThrow(
      "Shelf scene id 'same' appears 2 times in this ordering scope",
    );
    expect(() => workspace.order('model', ['chair'])).toThrow(
      'Rearranging models requires a non-negative integer sectionIndex',
    );
    expect(() => workspace.order('part', ['chair'], 0)).toThrow(
      'Rearranging parts does not accept sectionIndex',
    );
    expect(() => workspace.move({
      kind: 'part',
      id: 'chair',
      targetId: 'missing',
      position: 'after',
    }, ['chair', 'table'])).toThrow(
      "No part in this ordering scope has the target id 'missing'",
    );
    expect(workspace.move({
      kind: 'part',
      id: 'chair',
      targetId: 'chair',
      position: 'before',
    }, ['chair'])).toEqual(['chair']);
  });
});
