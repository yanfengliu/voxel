export interface StudioPresentationLockOptionsV1 {
  readonly classTarget: HTMLElement;
  readonly className: string;
  readonly inertTargets: readonly HTMLElement[];
  readonly disabledTargets: readonly HTMLButtonElement[];
}

export interface StudioPresentationLockV1 {
  readonly locked: boolean;
  /** Applies or restores the exact interaction states present before the lock. */
  set(locked: boolean): boolean;
}

/**
 * Temporarily removes presentation-changing controls from pointer, focus, and
 * accessibility interaction while preserving every control's prior state.
 */
export function createStudioPresentationLockV1(
  options: StudioPresentationLockOptionsV1,
): StudioPresentationLockV1 {
  const inertStates = new Map<HTMLElement, boolean>();
  const disabledStates = new Map<HTMLButtonElement, boolean>();
  let locked = false;

  function restore(): void {
    for (const [target, inert] of inertStates) target.inert = inert;
    for (const [button, disabled] of disabledStates) button.disabled = disabled;
    inertStates.clear();
    disabledStates.clear();
    options.classTarget.classList.remove(options.className);
  }

  return {
    get locked() { return locked; },
    set(next) {
      if (locked === next) return false;
      if (!next) {
        restore();
        locked = false;
        return true;
      }

      options.classTarget.classList.add(options.className);
      try {
        for (const target of options.inertTargets) {
          if (!(target instanceof HTMLElement)) {
            throw new Error('The presentation lock received a non-HTML interaction region.');
          }
          inertStates.set(target, target.inert);
          target.inert = true;
        }
        for (const button of options.disabledTargets) {
          if (!(button instanceof HTMLButtonElement)) {
            throw new Error('The presentation lock received a non-button presentation control.');
          }
          disabledStates.set(button, button.disabled);
          button.disabled = true;
        }
      } catch (error) {
        restore();
        throw new Error(
          `The presentation lock could not be applied, so prior control states were restored. ${String(error)}`,
          { cause: error },
        );
      }
      locked = true;
      return true;
    },
  };
}
