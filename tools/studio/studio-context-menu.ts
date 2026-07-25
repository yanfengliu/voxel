import { element } from './studio-app-helpers.js';

/**
 * One command in a Studio context menu. The menu owns invocation mechanics,
 * while the caller owns the command's domain behavior and diagnostics.
 */
export interface StudioContextMenuInvocationV1 {
  /** The row or overflow control that opened this invocation. */
  readonly trigger: HTMLElement;
  /**
   * Restores the exact trigger while it remains mounted, otherwise delegates
   * to the target's semantic fallback after a shelf rebuild.
   */
  readonly restoreFocus: () => void;
}

export interface StudioContextMenuActionV1 {
  readonly label: string;
  readonly danger?: boolean;
  /** The optional argument keeps existing zero-argument actions compatible. */
  readonly run: (invocation?: StudioContextMenuInvocationV1) => void;
}

export interface StudioContextMenuTargetV1 {
  /** Accessible name for the popup, for example "Scene actions for Dining". */
  readonly ariaLabel: string;
  readonly actions: readonly StudioContextMenuActionV1[];
  /** Used only when a rebuild detached the trigger before focus returns. */
  readonly restoreFocus?: () => void;
}

export interface StudioContextMenuV1 {
  /**
   * Gives a primary row mouse and keyboard context-menu behavior. An optional
   * secondary trigger (normally a visible overflow button) also opens on click.
   */
  connect(
    trigger: HTMLElement,
    target: StudioContextMenuTargetV1,
    clickTrigger?: HTMLElement,
  ): void;
  /** Releases every trigger currently mounted within a subtree before it is rebuilt. */
  disconnectWithin(root: HTMLElement): void;
  /** Dismisses the popup without moving focus. */
  close(): void;
  /** Idempotently releases the popup and all connected/global listeners. */
  dispose(): void;
}

interface StudioContextMenuTriggerConnection {
  readonly target: StudioContextMenuTargetV1;
  readonly openOnClick: boolean;
  readonly originalHasPopup: string | null;
  readonly originalExpanded: string | null;
  readonly originalKeyShortcuts: string | null;
}

function setExpanded(trigger: HTMLElement, expanded: boolean): void {
  // A summary's expanded state belongs to its native details element. Writing
  // aria-expanded here would overwrite that semantic with popup state.
  if (trigger.tagName !== 'SUMMARY') trigger.setAttribute('aria-expanded', String(expanded));
}

/**
 * One body-level fixed popup manager for a mounted Studio.
 *
 * Rows inside the shelf are frequently rebuilt. Weak trigger registrations
 * let detached rows collect, while dispose still removes listeners and ARIA
 * state from every connected trigger that remains live. Popup-global listeners
 * exist solely while a menu is open.
 */
export function createStudioContextMenu(): StudioContextMenuV1 {
  let menu: HTMLElement | null = null;
  let menuTrigger: HTMLElement | null = null;
  let menuTarget: StudioContextMenuTargetV1 | null = null;
  let disposed = false;
  let detachMenuGlobals = (): void => { /* no open menu */ };
  const triggerConnections = new WeakMap<HTMLElement, StudioContextMenuTriggerConnection>();
  const connectedTriggers = new Set<WeakRef<HTMLElement>>();
  const registeredTriggers = new WeakSet<HTMLElement>();

  const restoreTriggerFocus = (
    trigger: HTMLElement | null,
    target: StudioContextMenuTargetV1 | null,
  ): void => {
    if (trigger?.isConnected) {
      trigger.focus({ preventScroll: true });
      return;
    }
    target?.restoreFocus?.();
  };

  const closeMenu = (restoreFocus: boolean): void => {
    detachMenuGlobals();
    detachMenuGlobals = () => { /* no open menu */ };
    const trigger = menuTrigger;
    const target = menuTarget;
    menuTrigger = null;
    menuTarget = null;
    menu?.remove();
    menu = null;
    if (trigger) setExpanded(trigger, false);
    if (restoreFocus) restoreTriggerFocus(trigger, target);
  };

  const openMenu = (
    trigger: HTMLElement,
    target: StudioContextMenuTargetV1,
    left: number,
    top: number,
  ): void => {
    if (disposed || target.actions.length === 0) return;
    closeMenu(false);
    menuTrigger = trigger;
    menuTarget = target;
    setExpanded(trigger, true);

    const nextMenu = element('div', 'studio-context-menu');
    nextMenu.setAttribute('role', 'menu');
    nextMenu.setAttribute('aria-label', target.ariaLabel);
    const items = target.actions.map((action) => {
      const item = element('button', action.danger === true ? 'danger' : '');
      item.type = 'button';
      item.setAttribute('role', 'menuitem');
      item.textContent = action.label;
      item.addEventListener('click', () => {
        const invocation: StudioContextMenuInvocationV1 = {
          trigger,
          restoreFocus: () => { restoreTriggerFocus(trigger, target); },
        };
        closeMenu(false);
        action.run(invocation);
      });
      nextMenu.append(item);
      return item;
    });
    document.body.append(nextMenu);
    menu = nextMenu;

    const bounds = nextMenu.getBoundingClientRect();
    const gutter = 8;
    const windowWidth = document.defaultView?.innerWidth ?? bounds.width + gutter * 2;
    const windowHeight = document.defaultView?.innerHeight ?? bounds.height + gutter * 2;
    nextMenu.style.left = `${String(Math.max(gutter, Math.min(left, windowWidth - bounds.width - gutter)))}px`;
    nextMenu.style.top = `${String(Math.max(gutter, Math.min(top, windowHeight - bounds.height - gutter)))}px`;

    nextMenu.addEventListener('keydown', (event) => {
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      let targetIndex: number;
      if (event.key === 'ArrowDown') targetIndex = current < 0 ? 0 : (current + 1) % items.length;
      else if (event.key === 'ArrowUp') {
        targetIndex = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
      } else if (event.key === 'Home') targetIndex = 0;
      else if (event.key === 'End') targetIndex = items.length - 1;
      else if (event.key === 'Tab') {
        // Return to the trigger before the browser performs its ordinary Tab
        // move, so focus continues through the shelf rather than being trapped.
        closeMenu(true);
        return;
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu(true);
        return;
      } else return;
      event.preventDefault();
      items[targetIndex]?.focus();
    });

    const onOutsidePointer = (event: PointerEvent): void => {
      if (!nextMenu.contains(event.target as Node)) closeMenu(false);
    };
    const eventStartedInsideMenu = (event: Event): boolean =>
      event.target instanceof Node && nextMenu.contains(event.target);
    const menuHeldFocus = (): boolean => nextMenu.contains(document.activeElement);
    const onViewportChange = (): void => { closeMenu(menuHeldFocus()); };
    const onWheel = (event: WheelEvent): void => {
      if (eventStartedInsideMenu(event)) return;
      onViewportChange();
    };
    let initialScrollMaySettle = true;
    const settleFrame = window.requestAnimationFrame(() => {
      initialScrollMaySettle = false;
    });
    const onScroll = (event: Event): void => {
      if (eventStartedInsideMenu(event)) return;
      // A browser may finish scrolling a just-invoked row after contextmenu
      // fires. Only that opening-frame scroll is safe to ignore.
      if (initialScrollMaySettle && menuHeldFocus()) return;
      onViewportChange();
    };
    document.addEventListener('pointerdown', onOutsidePointer, true);
    document.addEventListener('scroll', onScroll, true);
    document.addEventListener('wheel', onWheel, true);
    window.addEventListener('resize', onViewportChange);
    detachMenuGlobals = () => {
      window.cancelAnimationFrame(settleFrame);
      document.removeEventListener('pointerdown', onOutsidePointer, true);
      document.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('wheel', onWheel, true);
      window.removeEventListener('resize', onViewportChange);
    };
    items[0]?.focus({ preventScroll: true });
  };

  const onTriggerContextMenu = (event: MouseEvent): void => {
    const trigger = event.currentTarget as HTMLElement;
    const connection = triggerConnections.get(trigger);
    if (disposed || connection === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    openMenu(trigger, connection.target, event.clientX, event.clientY);
  };

  const onTriggerKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return;
    const trigger = event.currentTarget as HTMLElement;
    const connection = triggerConnections.get(trigger);
    if (disposed || connection === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = trigger.getBoundingClientRect();
    openMenu(trigger, connection.target, bounds.left + 12, bounds.bottom);
  };

  const onTriggerClick = (event: MouseEvent): void => {
    const trigger = event.currentTarget as HTMLElement;
    const connection = triggerConnections.get(trigger);
    if (disposed || connection?.openOnClick !== true) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = trigger.getBoundingClientRect();
    openMenu(trigger, connection.target, bounds.left, bounds.bottom);
  };

  const disconnectTrigger = (
    triggerReference: WeakRef<HTMLElement>,
    trigger: HTMLElement,
  ): void => {
    const connection = triggerConnections.get(trigger);
    trigger.removeEventListener('contextmenu', onTriggerContextMenu);
    trigger.removeEventListener('keydown', onTriggerKeyDown);
    trigger.removeEventListener('click', onTriggerClick);
    if (connection?.originalHasPopup === null) trigger.removeAttribute('aria-haspopup');
    else if (connection) trigger.setAttribute('aria-haspopup', connection.originalHasPopup);
    if (trigger.tagName !== 'SUMMARY') {
      if (connection?.originalExpanded === null) trigger.removeAttribute('aria-expanded');
      else if (connection) trigger.setAttribute('aria-expanded', connection.originalExpanded);
    }
    if (connection?.originalKeyShortcuts === null) trigger.removeAttribute('aria-keyshortcuts');
    else if (connection) trigger.setAttribute('aria-keyshortcuts', connection.originalKeyShortcuts);
    triggerConnections.delete(trigger);
    registeredTriggers.delete(trigger);
    connectedTriggers.delete(triggerReference);
  };

  const connectTrigger = (
    trigger: HTMLElement,
    target: StudioContextMenuTargetV1,
    openOnClick: boolean,
  ): void => {
    const previous = triggerConnections.get(trigger);
    triggerConnections.set(trigger, {
      target,
      openOnClick,
      originalHasPopup: previous === undefined
        ? trigger.getAttribute('aria-haspopup')
        : previous.originalHasPopup,
      originalExpanded: previous === undefined
        ? trigger.getAttribute('aria-expanded')
        : previous.originalExpanded,
      originalKeyShortcuts: previous === undefined
        ? trigger.getAttribute('aria-keyshortcuts')
        : previous.originalKeyShortcuts,
    });
    if (!registeredTriggers.has(trigger)) {
      registeredTriggers.add(trigger);
      connectedTriggers.add(new WeakRef(trigger));
      trigger.addEventListener('contextmenu', onTriggerContextMenu);
      trigger.addEventListener('keydown', onTriggerKeyDown);
      trigger.addEventListener('click', onTriggerClick);
    }
    trigger.setAttribute('aria-haspopup', 'menu');
    setExpanded(trigger, false);
    trigger.setAttribute('aria-keyshortcuts', 'Shift+F10');
  };

  return {
    connect(trigger, target, clickTrigger) {
      if (disposed) return;
      connectTrigger(trigger, target, false);
      if (clickTrigger && clickTrigger !== trigger) connectTrigger(clickTrigger, target, true);
    },
    disconnectWithin(root) {
      if (disposed) return;
      if (menuTrigger !== null && (menuTrigger === root || root.contains(menuTrigger))) {
        closeMenu(false);
      }
      for (const triggerReference of connectedTriggers) {
        const trigger = triggerReference.deref();
        if (trigger === undefined) {
          connectedTriggers.delete(triggerReference);
        } else if (trigger === root || root.contains(trigger)) {
          disconnectTrigger(triggerReference, trigger);
        }
      }
    },
    close: () => { closeMenu(false); },
    dispose() {
      if (disposed) return;
      disposed = true;
      closeMenu(false);
      for (const triggerReference of connectedTriggers) {
        const trigger = triggerReference.deref();
        if (trigger === undefined) continue;
        disconnectTrigger(triggerReference, trigger);
      }
      connectedTriggers.clear();
    },
  };
}
