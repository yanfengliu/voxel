import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  MODEL_STUDIO_SHELL_VERSION,
  MODEL_STUDIO_SHELL_VERSION_V2,
  MODEL_STUDIO_TABS,
  nextModelStudioTab,
  renderModelStudioShell,
  renderModelStudioShellV2,
  type ModelStudioShellMarkupV2,
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

  it('renders a V2 profile without changing the V1 defaults', () => {
    const html = renderModelStudioShellV2({
      instanceId: 'harbor-studio',
      initialTab: 'edit',
      regionLabels: {
        shelf: 'Models & parts',
        stage: 'Stage <preview>',
      },
      panels: {
        examine: '<span>examine</span>',
        edit: '<span>edit</span>',
      },
    });

    expect(MODEL_STUDIO_SHELL_VERSION_V2).toBe('voxel.model-studio-ui/2');
    expect(html).toContain('data-model-studio-shell="voxel.model-studio-ui/2"');
    expect(html).toContain('data-studio-shell-instance="harbor-studio"');
    expect([...html.matchAll(/data-studio-tab="([^"]+)"/g)].map((match) => match[1])).toEqual([
      'examine', 'build', 'edit', 'motion', 'notes',
    ]);
    expect(html).toMatch(/data-studio-tab="edit"[\s\S]*?aria-controls="harbor-studio-panel-3"[\s\S]*?aria-selected="true"/);
    expect(html).toContain('aria-label="Models &amp; parts"');
    expect(html).toContain('aria-label="Stage &lt;preview&gt;"');
  });

  it('omits optional V2 core tabs and keeps the accessible fallback for included ones', () => {
    const html = renderModelStudioShellV2({
      instanceId: 'small-studio',
      coreTabs: ['examine', 'build', 'notes'],
      panels: { examine: '<p>Ready</p>' },
    });

    expect([...html.matchAll(/data-studio-tab="([^"]+)"/g)].map((match) => match[1])).toEqual([
      'examine', 'build', 'notes',
    ]);
    expect(html).not.toContain('data-studio-tab="edit"');
    expect(html).not.toContain('data-studio-panel="motion"');
    expect(html).toContain('Build tools are not available for this model adapter.');
    expect(html).toContain('Notes tools are not available for this model adapter.');
    expect(html.match(/class="studio-capability-unavailable" role="status"/g)).toHaveLength(2);
  });

  it('appends escaped namespaced add-ons after every enabled core tab', () => {
    const html = renderModelStudioShellV2({
      instanceId: 'addon-studio',
      coreTabs: ['examine', 'edit'],
      addons: [
        { id: 'harbor:review', label: 'Review & share', panel: '<p>Review</p>' },
        { id: 'harbor:export', label: 'Export <GLB>', panel: '<p>Export</p>' },
      ],
    });

    expect([...html.matchAll(/data-studio-tab="([^"]+)"/g)].map((match) => match[1])).toEqual([
      'examine', 'edit', 'harbor:review', 'harbor:export',
    ]);
    expect(html).toContain('data-studio-addon-first="true"');
    expect(html.match(/data-studio-addon="true"/g)).toHaveLength(2);
    expect(html).toContain('>Review &amp; share</button>');
    expect(html).toContain('>Export &lt;GLB&gt;</button>');
    expect(html).toContain('data-studio-panel="harbor:review"');
  });

  it.each([
    [{ instanceId: 'not safe' }, 'instanceId'],
    [{ instanceId: 'missing-examine', coreTabs: ['build'] }, 'Examine'],
    [{ instanceId: 'wrong-order', coreTabs: ['examine', 'edit', 'build'] }, 'canonical order'],
    [{ instanceId: 'duplicate-core', coreTabs: ['examine', 'build', 'build'] }, 'duplicate core tab'],
    [{
      instanceId: 'unsafe-addon',
      addons: [{ id: 'review', label: 'Review', panel: '' }],
    }, 'namespaced'],
    [{
      instanceId: 'duplicate-addon',
      addons: [
        { id: 'harbor:review', label: 'Review', panel: '' },
        { id: 'harbor:review', label: 'Again', panel: '' },
      ],
    }, 'duplicate add-on'],
    [{
      instanceId: 'empty-label',
      addons: [{ id: 'harbor:review', label: '   ', panel: '' }],
    }, 'nonempty label'],
    [{ instanceId: 'missing-initial', initialTab: 'harbor:review' }, 'initialTab'],
  ] as const)('rejects an invalid V2 profile %#', (profile, message) => {
    expect(() => renderModelStudioShellV2(
      profile as unknown as ModelStudioShellMarkupV2,
    )).toThrow(message);
  });

  it('stays renderer-free and scopes every shared style to the shell marker', () => {
    const source = readFileSync('tools/studio/shared-ui/index.ts', 'utf8');
    const css = readFileSync('tools/studio/shared-ui/style.css', 'utf8');
    const packageJson = readFileSync('tools/studio/shared-ui/package.json', 'utf8');

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
        expect(selector).toMatch(/^\[data-model-studio-shell(?:=[^\]]+)?\]/);
      }
    }
    expect(css).toContain('[data-model-studio-shell="voxel.model-studio-ui/2"] .tabs');
    expect(css).toContain('[data-studio-addon-first="true"]');
    expect(packageJson).toContain('"version": "1.1.0"');
  });
});
