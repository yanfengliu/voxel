import type { VoxelStudioHarnessV1 } from './harness.js';
import type { PartInfoV1, PartSettingSpecV1 } from './part-definition.js';
import { element } from './studio-app-helpers.js';
import type {
  StudioContextMenuActionV1,
  StudioContextMenuV1,
} from './studio-context-menu.js';

export interface StudioShelfPartDepsV1 {
  readonly harness: VoxelStudioHarnessV1;
  readonly expanded: Set<string>;
  readonly contextMenu: StudioContextMenuV1;
  readonly showExamine: () => void;
  readonly clearActionStatus: () => void;
  readonly focusPart: (name: string) => void;
  readonly orderActions: readonly StudioContextMenuActionV1[];
}

export interface StudioShelfPartEntryV1 {
  readonly element: HTMLElement;
  readonly trigger: HTMLElement;
}

function describeSetting(spec: PartSettingSpecV1): string {
  const bounds = spec.kind === 'int' || spec.kind === 'count'
    ? ` ${String(spec.min ?? (spec.kind === 'int' ? 1 : 0))}–${String(spec.max ?? 64)}`
    : '';
  return `${spec.label} — ${spec.kind}${bounds} · default ${String(spec.default)}`;
}

/** Builds one expandable part card; ordering remains owned by the parent shelf. */
export function renderStudioShelfPart(
  part: PartInfoV1,
  deps: StudioShelfPartDepsV1,
): StudioShelfPartEntryV1 {
  const key = `part:${part.name}`;
  const active = deps.harness.activePart() === part.name;
  const activePreset = active ? deps.harness.activePartPreset() : null;
  const wrap = element('div', 'lib-item-wrap');
  const details = element('details', 'lib-item');
  details.classList.toggle('active', active);
  details.open = deps.expanded.has(key);
  details.addEventListener('toggle', () => {
    if (details.open) deps.expanded.add(key);
    else deps.expanded.delete(key);
  });
  const summary = element('summary', 'lib-summary');
  summary.dataset.partName = part.name;
  summary.dataset.libraryKind = 'part';
  summary.dataset.libraryKey = part.name;
  summary.title = part.selfDescribed
    ? `Render ${part.title} using its declared defaults`
    : `Render ${part.title} using empty settings`;
  if (active) summary.setAttribute('aria-current', 'true');
  const title = element('span', 'lib-title');
  title.textContent = part.title;
  summary.append(title);
  if (part.category) {
    const badge = element('span', 'lib-badge');
    badge.textContent = part.category;
    summary.append(badge);
  }
  if (!part.selfDescribed) {
    const badge = element('span', 'lib-badge lib-bare');
    badge.textContent = 'undescribed';
    badge.title = 'A bare function with no published schema. Promote it to a definition to describe it.';
    summary.append(badge);
  }
  if (active && activePreset !== null) {
    const badge = element('span', 'lib-badge lib-active-variant');
    badge.textContent = activePreset;
    badge.title = `Rendering the ${activePreset} preset`;
    summary.append(badge);
  }
  details.append(summary);
  const detail = element('div', 'lib-detail');
  if (part.summary) {
    const paragraph = element('p', 'lib-text');
    paragraph.textContent = part.summary;
    detail.append(paragraph);
  }
  if (part.settings.length > 0) {
    const head = element('p', 'lib-subhead');
    head.textContent = 'Settings';
    detail.append(head);
    const list = element('ul', 'lib-list');
    for (const spec of part.settings) {
      const item = element('li');
      item.textContent = describeSetting(spec);
      if (spec.summary) item.title = spec.summary;
      list.append(item);
    }
    detail.append(list);
  }
  if (part.presets.length > 0) {
    const head = element('p', 'lib-subhead');
    head.textContent = 'Presets';
    detail.append(head);
    const list = element('ul', 'lib-list');
    for (const preset of part.presets) {
      const item = element('li');
      item.textContent = preset.summary ? `${preset.name} — ${preset.summary}` : preset.name;
      list.append(item);
    }
    detail.append(list);
  }
  const usage = element('p', 'lib-code');
  usage.textContent = `use: { kind: 'part', part: '${part.name}', at: [x,y,z], settings: {…} }`;
  detail.append(usage);
  const actionError = element('p', 'lib-error');
  actionError.hidden = true;
  actionError.setAttribute('role', 'alert');
  detail.append(actionError);
  details.append(detail);

  const renderVariant = (preset: string | null): void => {
    actionError.hidden = true;
    actionError.textContent = '';
    deps.clearActionStatus();
    try {
      deps.harness.openPart(part.name, preset === null ? undefined : { preset });
      deps.showExamine();
      deps.focusPart(part.name);
    } catch (error) {
      deps.expanded.add(key);
      details.open = true;
      actionError.textContent = `Could not render ${part.title}${
        preset === null ? '' : ` with the “${preset}” preset`
      }: ${error instanceof Error ? error.message : String(error)}`;
      actionError.hidden = false;
      deps.focusPart(part.name);
    }
  };
  summary.addEventListener('click', (event) => {
    event.preventDefault();
    const nextOpen = !details.open;
    if (nextOpen) deps.expanded.add(key);
    else deps.expanded.delete(key);
    details.open = nextOpen;
    actionError.hidden = true;
    actionError.textContent = '';
    if (active && activePreset === null) {
      deps.showExamine();
      return;
    }
    renderVariant(null);
  });

  const more = element('button', 'library-more');
  more.type = 'button';
  more.textContent = '⋯';
  more.title = 'Part actions';
  more.setAttribute('aria-label', `Part actions for ${part.title}`);
  deps.contextMenu.connect(summary, {
    ariaLabel: `Part actions for ${part.title}`,
    restoreFocus: () => { deps.focusPart(part.name); },
    actions: [
      { label: 'Render defaults', run: () => { renderVariant(null); } },
      ...part.presets.map((preset) => ({
        label: `Render “${preset.name}”`,
        run: () => { renderVariant(preset.name); },
      })),
      ...deps.orderActions,
    ],
  }, more);
  wrap.append(details, more);
  return { element: wrap, trigger: summary };
}
