import { describe, expect, it } from 'vitest';

import { VOXEL_SCENE_SCHEMA_V1, type SceneV1 } from './scene.js';
import { createSceneWorkspace } from './scene-workspace.js';

function scene(id: string, label = id): SceneV1 {
  return {
    schemaVersion: VOXEL_SCENE_SCHEMA_V1,
    id,
    label,
    placements: [{ id: `${id}:model`, model: 'model:one', at: [1, 2, 3] }],
  };
}

describe('scene workspace', () => {
  it('owns its scene list and keeps replacements available for reopening', () => {
    const source = [scene('scene:one', 'One')];
    const workspace = createSceneWorkspace(source);
    const edited = {
      ...workspace.find('scene:one')!,
      placements: [{ id: 'moved', model: 'model:one', at: [9, 0, 4] }] as const,
    };

    workspace.replace('scene:one', edited);

    expect(workspace.find('scene:one')).toBe(edited);
    expect(source[0]?.placements[0]?.at).toEqual([1, 2, 3]);
    expect(workspace.scenes()).not.toBe(source);
  });

  it('renames with a trimmed non-empty label while preserving identity and placements', () => {
    const workspace = createSceneWorkspace([scene('scene:one', 'One')]);

    const renamed = workspace.rename('scene:one', '  Dining room  ');

    expect(renamed).toEqual({
      ...scene('scene:one', 'One'),
      label: 'Dining room',
    });
    expect(workspace.scenes()).toEqual([renamed]);
    expect(() => workspace.rename('scene:one', '   ')).toThrow(
      "Scene 'scene:one' cannot be renamed to an empty name; "
      + 'enter at least one non-whitespace character.',
    );
  });

  it('deletes exactly the named scene and reports unknown targets precisely', () => {
    const one = scene('scene:one');
    const two = scene('scene:two');
    const workspace = createSceneWorkspace([one, two]);

    expect(workspace.delete('scene:one')).toEqual(one);
    expect(workspace.scenes().map((entry) => entry.id)).toEqual(['scene:two']);
    expect(() => workspace.delete('scene:missing')).toThrow(
      "No scene in this studio has the id 'scene:missing', so it cannot be deleted.",
    );
  });

  it('preserves V1 catalog compatibility and reports ambiguous mutation ids', () => {
    const workspace = createSceneWorkspace([
      scene('scene:blank', '   '),
      scene('scene:same', 'One'),
      scene('scene:same', 'Two'),
    ]);

    expect(workspace.find('scene:blank')?.label).toBe('   ');
    expect(() => workspace.rename('scene:same', 'Renamed')).toThrow(
      "Scene id 'scene:same' appears 2 times, so it cannot be renamed; "
      + 'give every manageable scene a unique id.',
    );
    expect(() => workspace.delete('scene:same')).toThrow(
      "Scene id 'scene:same' appears 2 times, so it cannot be deleted; "
      + 'give every manageable scene a unique id.',
    );
  });

  it('refuses to change a scene id through replacement', () => {
    const workspace = createSceneWorkspace([scene('scene:one')]);

    expect(() => workspace.replace('scene:one', scene('scene:two'))).toThrow(
      "Refusing to replace scene 'scene:one' with 'scene:two': scene ids are stable; "
      + 'change its label instead.',
    );
  });
});
