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
    if (!tabs.has(next)) {
      throw new Error(`The Model Studio shell has no "${next}" tab.`);
    }
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

export const MODEL_STUDIO_SHELL_VERSION_V2 = 'voxel.model-studio-ui/2';

export type ModelStudioAddonTabIdV2 = `${string}:${string}`;
export type ModelStudioTabIdV2 = ModelStudioTabId | ModelStudioAddonTabIdV2;
export type ModelStudioTabFocusV2 = 'preserve' | 'tab' | 'panel';

export interface ModelStudioAddonTabV2 {
  readonly id: ModelStudioAddonTabIdV2;
  readonly label: string;
  /** Trusted game-owned markup. An empty string supports post-connect DOM mounting. */
  readonly panel: string;
}

export interface ModelStudioShellRegionLabelsV2 {
  readonly shelf?: string;
  readonly stage?: string;
  readonly player?: string;
  readonly inspector?: string;
  readonly tabs?: string;
}

export interface ModelStudioShellProfileV2 {
  /** Stable, DOM-safe, and unique within the document. */
  readonly instanceId: string;
  /** A canonical-order subsequence. Examine is mandatory. Defaults to all V1 tabs. */
  readonly coreTabs?: readonly ModelStudioTabId[];
  /** Game-owned tabs follow every enabled core tab in declaration order. */
  readonly addons?: readonly ModelStudioAddonTabV2[];
  readonly initialTab?: ModelStudioTabIdV2;
  readonly regionLabels?: ModelStudioShellRegionLabelsV2;
}

export interface ModelStudioShellMarkupV2 extends ModelStudioShellProfileV2 {
  readonly top?: string;
  readonly shelf?: string;
  readonly stage?: string;
  readonly player?: string;
  readonly panels?: Partial<Readonly<Record<ModelStudioTabId, string>>>;
}

export interface ModelStudioTabSelectionOptionsV2 {
  readonly focus?: ModelStudioTabFocusV2;
}

export interface ModelStudioShellOptionsV2 {
  readonly beforeSelect?: (
    next: ModelStudioTabIdV2,
    current: ModelStudioTabIdV2,
  ) => void;
  readonly afterSelect?: (selected: ModelStudioTabIdV2) => void;
}

export interface ModelStudioShellHandleV2 {
  readonly root: HTMLElement;
  readonly regions: ModelStudioShellRegionsV1;
  readonly tabIds: readonly ModelStudioTabIdV2[];
  activeTab(): ModelStudioTabIdV2;
  hasTab(tab: string): tab is ModelStudioTabIdV2;
  panel(tab: string): HTMLElement;
  selectTab(tab: ModelStudioTabIdV2, options?: ModelStudioTabSelectionOptionsV2): void;
  dispose(): void;
}

interface ResolvedModelStudioTabV2 {
  readonly addon: boolean;
  readonly id: ModelStudioTabIdV2;
  readonly label: string;
  readonly panel: string;
}

interface ResolvedModelStudioShellV2 {
  readonly initialTab: ModelStudioTabIdV2;
  readonly instanceId: string;
  readonly labels: Required<ModelStudioShellRegionLabelsV2>;
  readonly tabs: readonly ResolvedModelStudioTabV2[];
}

const V2_INSTANCE_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const V2_ADDON_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*:[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const V2_REGION_LABELS: Required<ModelStudioShellRegionLabelsV2> = {
  shelf: 'Model shelf',
  stage: 'Model stage',
  player: 'Playback controls',
  inspector: 'Model inspector',
  tabs: 'Studio tools',
};

/**
 * Renders the configurable inspector contract without changing V1. The five
 * outer regions, their order, and their layout remain shared and mandatory.
 */
export function renderModelStudioShellV2(markup: ModelStudioShellMarkupV2): string {
  const resolved = resolveModelStudioShellV2(markup);
  const tabs = resolved.tabs.map(({ addon, id, label }, index) => `
    <button
      type="button"
      class="tab${id === resolved.initialTab ? ' active' : ''}"
      id="${resolved.instanceId}-tab-${String(index + 1)}"
      role="tab"
      data-studio-tab="${id}"
      ${addon ? 'data-studio-addon="true"' : ''}
      ${addon && !resolved.tabs.slice(0, index).some((tab) => tab.addon)
        ? 'data-studio-addon-first="true"'
        : ''}
      aria-controls="${resolved.instanceId}-panel-${String(index + 1)}"
      aria-selected="${id === resolved.initialTab ? 'true' : 'false'}"
      tabindex="${id === resolved.initialTab ? '0' : '-1'}"
    >${escapeHtml(label)}</button>`).join('');
  const panes = resolved.tabs.map(({ id, panel }, index) => `
    <section
      class="pane"
      id="${resolved.instanceId}-panel-${String(index + 1)}"
      role="tabpanel"
      data-studio-panel="${id}"
      aria-labelledby="${resolved.instanceId}-tab-${String(index + 1)}"
      tabindex="0"
      ${id === resolved.initialTab ? '' : 'hidden'}
    >${panel}</section>`).join('');
  const overflowControls = `
      <button type="button" class="studio-tab-scroll studio-tab-scroll-left" data-studio-tab-scroll="left" aria-label="Scroll Studio tools left" tabindex="-1" hidden>‹</button>
      <button type="button" class="studio-tab-scroll studio-tab-scroll-right" data-studio-tab-scroll="right" aria-label="Scroll Studio tools right" tabindex="-1" hidden>›</button>`;

  return `<div class="app model-studio-shell" data-model-studio-shell="${MODEL_STUDIO_SHELL_VERSION_V2}" data-studio-shell-instance="${resolved.instanceId}">
    <header class="top studio-header" data-studio-region="top">${markup.top ?? ''}</header>
    <aside class="rail studio-panel studio-catalog" data-studio-region="shelf" aria-label="${escapeHtml(resolved.labels.shelf)}">${markup.shelf ?? ''}</aside>
    <section class="stage studio-stage-panel" data-studio-region="stage" aria-label="${escapeHtml(resolved.labels.stage)}">${markup.stage ?? ''}</section>
    <section class="player studio-timeline" data-studio-region="player" aria-label="${escapeHtml(resolved.labels.player)}">${markup.player ?? ''}</section>
    <aside class="inspector studio-panel studio-inspector" data-studio-region="inspector" aria-label="${escapeHtml(resolved.labels.inspector)}">
      <div class="tabs" role="tablist" aria-label="${escapeHtml(resolved.labels.tabs)}">${tabs}
      </div>${overflowControls}${panes}
    </aside>
  </div>`;
}

/** Connects one exact V2 root; it never searches a host for the first shell. */
export function connectModelStudioShellV2(
  root: HTMLElement,
  options: ModelStudioShellOptionsV2 = {},
): ModelStudioShellHandleV2 {
  if (!root.matches(`[data-model-studio-shell="${MODEL_STUDIO_SHELL_VERSION_V2}"]`)) {
    throw new Error('connectModelStudioShellV2 requires the exact V2 shell root.');
  }
  if (root.dataset.studioShellConnected === 'true') {
    throw new Error('This V2 Model Studio shell is already connected.');
  }
  if (!root.isConnected) {
    throw new Error('The exact V2 shell root must be connected before its instanceId can be verified.');
  }
  const instanceId = root.dataset.studioShellInstance ?? '';
  if (!V2_INSTANCE_ID.test(instanceId)) {
    throw new Error('The V2 Model Studio shell has an invalid instanceId.');
  }
  const rootTree = root.getRootNode();
  const matchingInstances = 'querySelectorAll' in rootTree
    ? Array.from((rootTree as ParentNode).querySelectorAll<HTMLElement>(
      `[data-model-studio-shell="${MODEL_STUDIO_SHELL_VERSION_V2}"]`,
    )).filter((candidate) => candidate.dataset.studioShellInstance === instanceId)
    : [root];
  if (matchingInstances.length > 1) {
    throw new Error(`The V2 Model Studio instanceId "${instanceId}" is not unique.`);
  }

  const regions: ModelStudioShellRegionsV1 = {
    top: required(root, ':scope > [data-studio-region="top"]'),
    shelf: required(root, ':scope > [data-studio-region="shelf"]'),
    stage: required(root, ':scope > [data-studio-region="stage"]'),
    player: required(root, ':scope > [data-studio-region="player"]'),
    inspector: required(root, ':scope > [data-studio-region="inspector"]'),
  };
  const tabList = required(
    root,
    ':scope > [data-studio-region="inspector"] > [role="tablist"]',
  );
  const scrollLeftButton = required(
    regions.inspector,
    ':scope > [data-studio-tab-scroll="left"]',
  ) as HTMLButtonElement;
  const scrollRightButton = required(
    regions.inspector,
    ':scope > [data-studio-tab-scroll="right"]',
  ) as HTMLButtonElement;
  const tabElements = Array.from(tabList.querySelectorAll<HTMLButtonElement>(
    ':scope > [data-studio-tab]',
  ));
  const panelElements = Array.from(regions.inspector.querySelectorAll<HTMLElement>(
    ':scope > [data-studio-panel]',
  ));
  if (tabElements.length === 0 || panelElements.length !== tabElements.length) {
    throw new Error('The V2 Model Studio shell needs one panel for every tab.');
  }

  const tabIds: ModelStudioTabIdV2[] = [];
  const tabs = new Map<ModelStudioTabIdV2, HTMLButtonElement>();
  const panels = new Map<ModelStudioTabIdV2, HTMLElement>();
  for (const [index, tab] of tabElements.entries()) {
    const id = tab.dataset.studioTab;
    const panel = panelElements[index];
    if (!id || panel?.dataset.studioPanel !== id || tabs.has(id as ModelStudioTabIdV2)) {
      throw new Error('The V2 Model Studio tab and panel IDs must be unique and ordered alike.');
    }
    const tabId = id as ModelStudioTabIdV2;
    const expectedTabElementId = `${instanceId}-tab-${String(index + 1)}`;
    const expectedPanelElementId = `${instanceId}-panel-${String(index + 1)}`;
    if (
      tab.id !== expectedTabElementId
      || panel.id !== expectedPanelElementId
      || tab.getAttribute('aria-controls') !== panel.id
      || panel.getAttribute('aria-labelledby') !== tab.id
    ) {
      throw new Error(`The V2 Model Studio ARIA relationship for "${id}" is invalid.`);
    }
    tabIds.push(tabId);
    tabs.set(tabId, tab);
    panels.set(tabId, panel);
  }
  validateConnectedTabIdsV2(tabIds);
  if (!tabs.has('examine')) {
    throw new Error('The V2 Model Studio shell must include Examine.');
  }
  const selectedTabs = tabElements.filter((tab) => tab.getAttribute('aria-selected') === 'true');
  const tabbableTabs = tabElements.filter((tab) => tab.tabIndex === 0);
  const visiblePanels = panelElements.filter((panel) => !panel.hidden);
  if (selectedTabs.length !== 1 || tabbableTabs.length !== 1 || visiblePanels.length !== 1) {
    throw new Error('The V2 Model Studio shell must have exactly one active tab and panel.');
  }
  const selectedId = selectedTabs[0]!.dataset.studioTab as ModelStudioTabIdV2;
  if (
    tabbableTabs[0] !== selectedTabs[0]
    || visiblePanels[0] !== panels.get(selectedId)
  ) {
    throw new Error('The V2 Model Studio selected, tabbable, and visible states must agree.');
  }

  const frozenTabIds = Object.freeze([...tabIds]);
  let selected = selectedId;
  let disposed = false;

  const updateScrollControls = (): void => {
    const maximum = Math.max(0, tabList.scrollWidth - tabList.clientWidth);
    scrollLeftButton.hidden = maximum === 0 || tabList.scrollLeft <= 1;
    scrollRightButton.hidden = maximum === 0 || tabList.scrollLeft >= maximum - 1;
  };
  const revealTab = (tab: HTMLElement): void => {
    const listBounds = tabList.getBoundingClientRect();
    const tabBounds = tab.getBoundingClientRect();
    if (tabBounds.left < listBounds.left) {
      tabList.scrollLeft -= listBounds.left - tabBounds.left;
    } else if (tabBounds.right > listBounds.right) {
      tabList.scrollLeft += tabBounds.right - listBounds.right;
    }
    updateScrollControls();
  };

  const selectTab = (
    next: ModelStudioTabIdV2,
    selection: ModelStudioTabSelectionOptionsV2 = {},
  ): void => {
    if (disposed) return;
    const nextTab = tabs.get(next);
    const nextPanel = panels.get(next);
    if (!nextTab || !nextPanel) {
      throw new Error(`The V2 Model Studio shell has no "${next}" tab.`);
    }
    options.beforeSelect?.(next, selected);
    selected = next;
    for (const id of frozenTabIds) {
      const active = id === next;
      const tab = tabs.get(id)!;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      panels.get(id)!.hidden = !active;
    }
    revealTab(nextTab);
    const focus = selection.focus ?? 'preserve';
    if (focus === 'tab') {
      nextTab.focus({ preventScroll: true });
    } else if (focus === 'panel') {
      nextPanel.focus({ preventScroll: true });
    }
    options.afterSelect?.(next);
  };

  const onClick = (event: Event): void => {
    const tab = (event.target as Element).closest<HTMLButtonElement>('[data-studio-tab]');
    const id = tab?.dataset.studioTab;
    if (tab && tabList.contains(tab) && id && tabs.has(id as ModelStudioTabIdV2)) {
      selectTab(id as ModelStudioTabIdV2);
    }
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!isV2NavigationKey(event.key)) return;
    const current = (event.target as Element).closest<HTMLButtonElement>('[data-studio-tab]');
    const id = current?.dataset.studioTab as ModelStudioTabIdV2 | undefined;
    if (!current || !tabList.contains(current) || !id || !tabs.has(id)) return;
    event.preventDefault();
    event.stopPropagation();
    selectTab(nextModelStudioTabV2(frozenTabIds, id, event.key), { focus: 'tab' });
  };
  const onScrollLeft = (): void => {
    tabList.scrollLeft -= 64;
    updateScrollControls();
  };
  const onScrollRight = (): void => {
    tabList.scrollLeft += 64;
    updateScrollControls();
  };

  tabList.addEventListener('click', onClick);
  tabList.addEventListener('keydown', onKeyDown);
  tabList.addEventListener('scroll', updateScrollControls);
  scrollLeftButton.addEventListener('click', onScrollLeft);
  scrollRightButton.addEventListener('click', onScrollRight);
  // The affordances depend on the tab list's box, which layout moves without
  // any scroll or click — the sub-900px breakpoint narrows the inspector. The
  // observer is the direct signal; the window listener also covers embedded
  // browsers where observers have been measured to stay silent.
  const resizeObserver = typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver(updateScrollControls);
  resizeObserver?.observe(tabList);
  const shellWindow = root.ownerDocument.defaultView;
  shellWindow?.addEventListener('resize', updateScrollControls);
  root.dataset.studioShellConnected = 'true';
  revealTab(tabs.get(selected)!);

  return {
    root,
    regions,
    tabIds: frozenTabIds,
    activeTab: () => selected,
    hasTab: (tab): tab is ModelStudioTabIdV2 => tabs.has(tab as ModelStudioTabIdV2),
    panel(tab: string): HTMLElement {
      const match = panels.get(tab as ModelStudioTabIdV2);
      if (!match) throw new Error(`The V2 Model Studio shell has no "${tab}" panel.`);
      return match;
    },
    selectTab,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      tabList.removeEventListener('click', onClick);
      tabList.removeEventListener('keydown', onKeyDown);
      tabList.removeEventListener('scroll', updateScrollControls);
      scrollLeftButton.removeEventListener('click', onScrollLeft);
      scrollRightButton.removeEventListener('click', onScrollRight);
      resizeObserver?.disconnect();
      shellWindow?.removeEventListener('resize', updateScrollControls);
      delete root.dataset.studioShellConnected;
    },
  };
}

function resolveModelStudioShellV2(markup: ModelStudioShellMarkupV2): ResolvedModelStudioShellV2 {
  if (!V2_INSTANCE_ID.test(markup.instanceId)) {
    throw new Error('V2 instanceId must be lowercase DOM-safe kebab-case.');
  }
  const coreTabs = [...(markup.coreTabs ?? MODEL_STUDIO_TABS.map(({ id }) => id))];
  const seenCore = new Set<ModelStudioTabId>();
  let previousIndex = -1;
  for (const id of coreTabs) {
    const index = MODEL_STUDIO_TABS.findIndex((tab) => tab.id === id);
    if (index < 0) throw new Error(`Unknown V2 core tab "${id}".`);
    if (seenCore.has(id)) throw new Error(`V2 has a duplicate core tab "${id}".`);
    if (index < previousIndex) {
      throw new Error('V2 coreTabs must retain the canonical order.');
    }
    seenCore.add(id);
    previousIndex = index;
  }
  if (!seenCore.has('examine')) {
    throw new Error('V2 coreTabs must include Examine.');
  }

  const tabs: ResolvedModelStudioTabV2[] = coreTabs.map((id) => ({
    addon: false,
    id,
    label: MODEL_STUDIO_TABS.find((tab) => tab.id === id)!.label,
    panel: markup.panels?.[id] ?? unavailablePanel(id),
  }));
  const seenAddons = new Set<string>();
  for (const addon of markup.addons ?? []) {
    if (!V2_ADDON_ID.test(addon.id)) {
      throw new Error(`V2 add-on ID "${addon.id}" must be namespaced as game:addon.`);
    }
    if (seenAddons.has(addon.id)) {
      throw new Error(`V2 has a duplicate add-on ID "${addon.id}".`);
    }
    if (!addon.label.trim()) {
      throw new Error(`V2 add-on "${addon.id}" needs a nonempty label.`);
    }
    seenAddons.add(addon.id);
    tabs.push({ addon: true, id: addon.id, label: addon.label, panel: addon.panel });
  }

  const initialTab = markup.initialTab ?? 'examine';
  if (!tabs.some(({ id }) => id === initialTab)) {
    throw new Error(`V2 initialTab "${initialTab}" is not present in this profile.`);
  }
  const labels = { ...V2_REGION_LABELS, ...markup.regionLabels };
  for (const [region, label] of Object.entries(labels)) {
    if (!label.trim()) throw new Error(`V2 region label "${region}" must be nonempty.`);
  }
  return { initialTab, instanceId: markup.instanceId, labels, tabs };
}

function nextModelStudioTabV2(
  tabIds: readonly ModelStudioTabIdV2[],
  current: ModelStudioTabIdV2,
  key: string,
): ModelStudioTabIdV2 {
  const index = tabIds.indexOf(current);
  if (key === 'Home') return tabIds[0]!;
  if (key === 'End') return tabIds[tabIds.length - 1]!;
  if (key === 'ArrowLeft') return tabIds[(index - 1 + tabIds.length) % tabIds.length]!;
  if (key === 'ArrowRight') return tabIds[(index + 1) % tabIds.length]!;
  return current;
}

function validateConnectedTabIdsV2(tabIds: readonly string[]): void {
  const seen = new Set<string>();
  let previousCoreIndex = -1;
  let reachedAddons = false;
  for (const id of tabIds) {
    if (seen.has(id)) {
      throw new Error(`The V2 Model Studio shell has a duplicate logical tab ID "${id}".`);
    }
    seen.add(id);
    const coreIndex = MODEL_STUDIO_TABS.findIndex((tab) => tab.id === id);
    if (coreIndex >= 0) {
      if (reachedAddons) {
        throw new Error('The V2 Model Studio shell must place every core tab before add-ons.');
      }
      if (coreIndex < previousCoreIndex) {
        throw new Error('The V2 Model Studio shell core tabs are outside canonical order.');
      }
      previousCoreIndex = coreIndex;
      continue;
    }
    if (!V2_ADDON_ID.test(id)) {
      throw new Error(`The V2 Model Studio shell has an invalid logical tab ID "${id}".`);
    }
    reachedAddons = true;
  }
}

function isV2NavigationKey(key: string): boolean {
  return ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
