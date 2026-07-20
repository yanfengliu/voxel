export const MODEL_STUDIO_SHELL_VERSION = 'voxel.model-studio-ui/1';

export const MODEL_STUDIO_TABS = [
  { id: 'examine', label: 'Examine' },
  { id: 'build', label: 'Build' },
  { id: 'edit', label: 'Edit' },
  { id: 'motion', label: 'Motion' },
  { id: 'notes', label: 'Notes' },
] as const;

export type ModelStudioTabId = (typeof MODEL_STUDIO_TABS)[number]['id'];

export interface ModelStudioShellMarkupV1 {
  readonly top?: string;
  readonly shelf?: string;
  readonly stage?: string;
  readonly player?: string;
  readonly panels?: Partial<Readonly<Record<ModelStudioTabId, string>>>;
}

export interface ModelStudioShellRegionsV1 {
  readonly top: HTMLElement;
  readonly shelf: HTMLElement;
  readonly stage: HTMLElement;
  readonly player: HTMLElement;
  readonly inspector: HTMLElement;
}

export interface ModelStudioShellOptionsV1 {
  readonly beforeSelect?: (
    next: ModelStudioTabId,
    current: ModelStudioTabId,
  ) => void;
  readonly afterSelect?: (selected: ModelStudioTabId) => void;
}

export interface ModelStudioShellHandleV1 {
  readonly root: HTMLElement;
  readonly regions: ModelStudioShellRegionsV1;
  readonly panels: Readonly<Record<ModelStudioTabId, HTMLElement>>;
  activeTab(): ModelStudioTabId;
  selectTab(tab: ModelStudioTabId): void;
  dispose(): void;
}

let shellInstanceSerial = 0;

/**
 * The renderer-neutral Model Studio workbench. Games supply the contents of
 * its five slots; Voxel owns their order, landmarks, tab semantics and layout.
 */
export function renderModelStudioShell(markup: ModelStudioShellMarkupV1 = {}): string {
  const instanceId = `studio-shell-${String(++shellInstanceSerial)}`;
  const panels = markup.panels ?? {};
  const tabs = MODEL_STUDIO_TABS.map(({ id, label }, index) => `
    <button
      type="button"
      class="tab${index === 0 ? ' active' : ''}"
      id="${instanceId}-tab-${id}"
      role="tab"
      data-studio-tab="${id}"
      aria-controls="${instanceId}-panel-${id}"
      aria-selected="${index === 0 ? 'true' : 'false'}"
      tabindex="${index === 0 ? '0' : '-1'}"
    >${label}</button>`).join('');
  const panes = MODEL_STUDIO_TABS.map(({ id }, index) => `
    <section
      class="pane"
      id="${instanceId}-panel-${id}"
      role="tabpanel"
      data-studio-panel="${id}"
      aria-labelledby="${instanceId}-tab-${id}"
      tabindex="0"
      ${index === 0 ? '' : 'hidden'}
    >${panels[id] ?? unavailablePanel(id)}</section>`).join('');

  return `<div class="app model-studio-shell" data-model-studio-shell="${MODEL_STUDIO_SHELL_VERSION}" data-studio-shell-instance="${instanceId}">
    <header class="top studio-header" data-studio-region="top">${markup.top ?? ''}</header>
    <aside class="rail studio-panel studio-catalog" data-studio-region="shelf" aria-label="Model shelf">${markup.shelf ?? ''}</aside>
    <section class="stage studio-stage-panel" data-studio-region="stage" aria-label="Model stage">${markup.stage ?? ''}</section>
    <section class="player studio-timeline" data-studio-region="player" aria-label="Playback controls">${markup.player ?? ''}</section>
    <aside class="inspector studio-panel studio-inspector" data-studio-region="inspector" aria-label="Model inspector">
      <div class="tabs" role="tablist" aria-label="Studio tools">${tabs}
      </div>${panes}
    </aside>
  </div>`;
}

/** Connects the one shared tab state machine to server-rendered shell markup. */
export function connectModelStudioShell(
  host: ParentNode,
  options: ModelStudioShellOptionsV1 = {},
): ModelStudioShellHandleV1 {
  const root = required(host, `[data-model-studio-shell="${MODEL_STUDIO_SHELL_VERSION}"]`);
  const tabList = required(root, '[role="tablist"]');
  const tabs = new Map<ModelStudioTabId, HTMLButtonElement>();
  const panels = new Map<ModelStudioTabId, HTMLElement>();
  for (const { id } of MODEL_STUDIO_TABS) {
    tabs.set(id, required(root, `[data-studio-tab="${id}"]`) as HTMLButtonElement);
    panels.set(id, required(root, `[data-studio-panel="${id}"]`));
  }
  let selected = selectedTab(tabs);
  let disposed = false;

  const selectTab = (next: ModelStudioTabId): void => {
    if (disposed) return;
    options.beforeSelect?.(next, selected);
    selected = next;
    for (const { id } of MODEL_STUDIO_TABS) {
      const active = id === next;
      const tab = tabs.get(id)!;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      panels.get(id)!.hidden = !active;
    }
    options.afterSelect?.(next);
  };

  const onClick = (event: Event): void => {
    const tab = (event.target as Element).closest<HTMLButtonElement>('[data-studio-tab]');
    const id = tab?.dataset.studioTab;
    if (isModelStudioTab(id)) selectTab(id);
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!isNavigationKey(event.key)) return;
    const current = (event.target as Element).closest<HTMLButtonElement>('[data-studio-tab]');
    const id = current?.dataset.studioTab;
    if (!isModelStudioTab(id)) return;
    event.preventDefault();
    event.stopPropagation();
    const next = nextModelStudioTab(id, event.key);
    selectTab(next);
    tabs.get(next)!.focus();
  };
  tabList.addEventListener('click', onClick);
  tabList.addEventListener('keydown', onKeyDown);

  return {
    root,
    regions: {
      top: required(root, '[data-studio-region="top"]'),
      shelf: required(root, '[data-studio-region="shelf"]'),
      stage: required(root, '[data-studio-region="stage"]'),
      player: required(root, '[data-studio-region="player"]'),
      inspector: required(root, '[data-studio-region="inspector"]'),
    },
    panels: {
      examine: panels.get('examine')!,
      build: panels.get('build')!,
      edit: panels.get('edit')!,
      motion: panels.get('motion')!,
      notes: panels.get('notes')!,
    },
    activeTab: () => selected,
    selectTab,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      tabList.removeEventListener('click', onClick);
      tabList.removeEventListener('keydown', onKeyDown);
    },
  };
}

export function nextModelStudioTab(
  current: ModelStudioTabId,
  key: string,
): ModelStudioTabId {
  const ids = MODEL_STUDIO_TABS.map(({ id }) => id);
  const index = ids.indexOf(current);
  if (key === 'Home') return ids[0]!;
  if (key === 'End') return ids[ids.length - 1]!;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return ids[(index - 1 + ids.length) % ids.length]!;
  if (key === 'ArrowRight' || key === 'ArrowDown') return ids[(index + 1) % ids.length]!;
  return current;
}

function unavailablePanel(id: ModelStudioTabId): string {
  return `<p class="studio-capability-unavailable" role="status">${idLabel(id)} tools are not available for this model adapter.</p>`;
}

function idLabel(id: ModelStudioTabId): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function selectedTab(tabs: ReadonlyMap<ModelStudioTabId, HTMLButtonElement>): ModelStudioTabId {
  for (const { id } of MODEL_STUDIO_TABS) {
    if (tabs.get(id)?.getAttribute('aria-selected') === 'true') return id;
  }
  return 'examine';
}

function isModelStudioTab(value: string | undefined): value is ModelStudioTabId {
  return MODEL_STUDIO_TABS.some(({ id }) => id === value);
}

function isNavigationKey(key: string): boolean {
  return ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key);
}

function required(root: ParentNode, selector: string): HTMLElement {
  const match = root.querySelector<HTMLElement>(selector);
  if (!match) throw new Error(`Shared Model Studio shell is missing ${selector}.`);
  return match;
}
