import { element } from './studio-app-helpers.js';

export function createStudioShelfOverflowButton(
  kind: string,
  label: string,
): HTMLButtonElement {
  const button = element('button', 'library-more');
  button.type = 'button';
  button.title = `${kind} actions`;
  button.setAttribute('aria-label', `${kind} actions for ${label}`);

  const icon = element('span', 'library-more-icon');
  icon.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < 3; index += 1) icon.append(element('span'));
  button.append(icon);
  return button;
}
