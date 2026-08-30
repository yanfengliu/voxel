export function requiredOakElement<ElementType extends Element>(
  selector: string,
): ElementType {
  const element = document.querySelector<ElementType>(selector);
  if (element === null) {
    throw new Error(`Oak browser host requires an element matching '${selector}'.`);
  }
  return element;
}

export function formatOakDiagnostic(
  value: number,
  digits: number,
  suffix: string,
): string {
  return Number.isFinite(value) ? `${value.toFixed(digits)} ${suffix}` : 'not applicable';
}

export function displayOakFatal(error: unknown): void {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  const fatal = document.createElement('pre');
  fatal.className = 'fatal';
  fatal.textContent = `Oak case study could not continue.\n\n${message}`;
  document.body.append(fatal);
}

export function bindOakDataButtonsV1<Value extends string>(
  controls: readonly HTMLButtonElement[],
  dataKey: 'command' | 'view',
  activate: (value: Value) => void,
  onFailure: (error: unknown) => void,
): () => void {
  const removers: (() => void)[] = [];
  for (const control of controls) {
    const value = control.dataset[dataKey] as Value | undefined;
    if (value === undefined) continue;
    const listener = (): void => {
      try {
        activate(value);
      } catch (error) {
        onFailure(error);
        throw error;
      }
    };
    control.addEventListener('click', listener);
    removers.push(() => { control.removeEventListener('click', listener); });
  }
  return () => {
    for (const remove of removers.splice(0)) remove();
  };
}
