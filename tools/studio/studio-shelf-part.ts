import type { VoxelStudioHarnessV1 } from './harness.js';
import type { PartInfoV1 } from './part-definition.js';
import { element } from './studio-app-helpers.js';
import type {
  StudioContextMenuActionV1,
  StudioContextMenuV1,
} from './studio-context-menu.js';

export interface StudioShelfPartDepsV1 {
  readonly harness: VoxelStudioHarnessV1;
  readonly contextMenu: StudioContextMenuV1;
  readonly showExamine: () => void;
  readonly clearActionStatus: () => void;
  readonly reportActionError: (message: string) => void;
  readonly focusPart: (name: string) => void;
  readonly orderActions: readonly StudioContextMenuActionV1[];
}

export interface StudioShelfPartEntryV1 {
  readonly element: HTMLElement;
  readonly trigger: HTMLElement;
}

/** Builds one direct-open part row; ordering remains owned by the parent shelf. */
export function renderStudioShelfPart(
  part: PartInfoV1,
  deps: StudioShelfPartDepsV1,
): StudioShelfPartEntryV1 {
  const active = deps.harness.activePart() === part.name;
  const wrap = element('div', 'library-row-wrap');
  const row = element('button', 'model-row');
  row.type = 'button';
  row.dataset.partName = part.name;
  row.dataset.libraryKind = 'part';
  row.dataset.libraryKey = part.name;
  row.classList.toggle('active', active);
  row.title = part.selfDescribed
    ? `Render ${part.title} using its declared defaults`
    : `Render ${part.title} using empty settings`;
  if (active) row.setAttribute('aria-current', 'true');
  const title = element('span');
  title.textContent = part.title;
  row.append(title);

  const renderVariant = (preset: string | null): void => {
    deps.clearActionStatus();
    try {
      deps.harness.openPart(part.name, preset === null ? undefined : { preset });
      deps.showExamine();
      deps.focusPart(part.name);
    } catch (error) {
      deps.reportActionError(
        `Could not render ${part.title}${
          preset === null ? '' : ` with the “${preset}” preset`
        }: ${error instanceof Error ? error.message : String(error)}`,
      );
      deps.focusPart(part.name);
    }
  };
  row.addEventListener('click', () => { renderVariant(null); });

  const more = element('button', 'library-more');
  more.type = 'button';
  more.textContent = '⋯';
  more.title = 'Part actions';
  more.setAttribute('aria-label', `Part actions for ${part.title}`);
  deps.contextMenu.connect(row, {
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
  wrap.append(row, more);
  return { element: wrap, trigger: row };
}
