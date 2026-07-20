import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  MODEL_STUDIO_SHELL_VERSION,
  MODEL_STUDIO_TABS,
  nextModelStudioTab,
  renderModelStudioShell,
} from './shared-ui/index.js';

describe('shared Model Studio shell', () => {
  it('owns one versioned workbench and the same five inspector tabs for every game', () => {
    const html = renderModelStudioShell({
      top: '<span>top</span>',
      shelf: '<span>shelf</span>',
      stage: '<canvas></canvas>',
      player: '<span>player</span>',
      panels: {
        examine: '<span>examine</span>',
        build: '<span>build</span>',
        edit: '<span>edit</span>',
        motion: '<span>motion</span>',
        notes: '<span>notes</span>',
      },
    });

    expect(MODEL_STUDIO_SHELL_VERSION).toBe('voxel.model-studio-ui/1');
    expect(MODEL_STUDIO_TABS.map(({ id }) => id)).toEqual([
      'examine', 'build', 'edit', 'motion', 'notes',
    ]);
    expect(html).toContain(`data-model-studio-shell="${MODEL_STUDIO_SHELL_VERSION}"`);
    expect(html).toContain('<section class="stage studio-stage-panel" data-studio-region="stage" aria-label="Model stage">');
    expect(html).not.toContain('<main');
    for (const region of ['top', 'shelf', 'stage', 'player', 'inspector']) {
      expect(html).toContain(`data-studio-region="${region}"`);
    }
    expect(html.match(/role="tab"/g)).toHaveLength(MODEL_STUDIO_TABS.length);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(MODEL_STUDIO_TABS.length);
    expect(html).toContain('aria-selected="true"');
    expect(html).toMatch(/id="studio-shell-\d+-panel-build"/);
    expect(html).toMatch(/aria-labelledby="studio-shell-\d+-tab-build"/);
  });

  it('keeps tab relationships unique when two studios share a document', () => {
    const first = renderModelStudioShell();
    const second = renderModelStudioShell();
    const ids = (html: string): readonly string[] => [
      ...html.matchAll(/\sid="([^"]+)"/g),
    ].map((match) => match[1]!);

    const secondIds = new Set(ids(second));
    expect(ids(first).every((id) => !secondIds.has(id))).toBe(true);
    for (const html of [first, second]) {
      const documentIds = new Set(ids(html));
      const references = [
        ...html.matchAll(/\saria-(?:controls|labelledby)="([^"]+)"/g),
      ].map((match) => match[1]!);
      expect(references.every((reference) => documentIds.has(reference))).toBe(true);
    }
  });

  it('keeps every shared tab and explains capabilities an adapter omits', () => {
    const html = renderModelStudioShell({ panels: { examine: '<p>Ready</p>' } });

    expect(html.match(/data-studio-tab=/g)).toHaveLength(MODEL_STUDIO_TABS.length);
    expect(html.match(/data-studio-panel=/g)).toHaveLength(MODEL_STUDIO_TABS.length);
    expect(html.match(/class="studio-capability-unavailable" role="status"/g)).toHaveLength(4);
    for (const label of ['Build', 'Edit', 'Motion', 'Notes']) {
      expect(html).toContain(`${label} tools are not available for this model adapter.`);
    }
  });

  it('defines deterministic keyboard navigation for the shared tab list', () => {
    expect(nextModelStudioTab('examine', 'ArrowLeft')).toBe('notes');
    expect(nextModelStudioTab('notes', 'ArrowRight')).toBe('examine');
    expect(nextModelStudioTab('build', 'Home')).toBe('examine');
    expect(nextModelStudioTab('build', 'End')).toBe('notes');
    expect(nextModelStudioTab('edit', 'Enter')).toBe('edit');
  });

  it('stays renderer-free and scopes every shared style to the shell marker', () => {
    const source = readFileSync('tools/studio/shared-ui/index.ts', 'utf8');
    const css = readFileSync('tools/studio/shared-ui/style.css', 'utf8');

    expect(source).not.toMatch(/from ['"]three['"]/);
    expect(source).not.toContain('StudioModelV1');
    expect(source).not.toContain('StudioSession');
    expect(css).not.toMatch(/^(?::root|html|body|button|canvas|\*)\b/m);
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const selectorLists = [...withoutComments.matchAll(/([^{}]+)\{/g)]
      .map((match) => match[1]!.trim())
      .filter((selector) => !selector.startsWith('@'));
    for (const selectorList of selectorLists) {
      for (const selector of selectorList.split(',').map((part) => part.trim())) {
        expect(selector).toMatch(/^\[data-model-studio-shell\]/);
      }
    }
  });
});
