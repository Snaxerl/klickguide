import { errorMessage } from '../core/errors.js';
import { icon } from './icons.js';
import type { IconName } from './icons.js';
type Child = Node | string | null | undefined | false;
export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', children: Child[] = []): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className)
    node.className = className;
  for (const child of children)
    if (child !== null && child !== undefined && child !== false)
      node.append(child);
  return node;
}
export function button(label: string, name: IconName | null, handler: () => void | Promise<void>, variant = 'secondary'): HTMLButtonElement {
  const node = element('button', `button ${variant}`, [name ? icon(name, 18) : null, element('span', '', [label])]);
  node.type = 'button';
  node.addEventListener('click', () => {
    if (node.disabled || node.getAttribute('aria-busy') === 'true')
      return;
    node.setAttribute('aria-busy', 'true');
    void Promise.resolve().then(handler).catch(showError).finally(() => { node.removeAttribute('aria-busy'); });
  });
  return node;
}
export function iconButton(label: string, name: IconName, handler: () => void | Promise<void>, variant = 'ghost'): HTMLButtonElement {
  const node = button(label, name, handler, variant);
  node.classList.add('icon-button');
  node.title = label;
  node.setAttribute('aria-label', label);
  node.querySelector('span')?.classList.add('sr-only');
  return node;
}
export function link(label: string, href: string, name?: IconName, className = ''): HTMLAnchorElement {
  const node = element('a', className, [name ? icon(name) : null, element('span', '', [label])]);
  node.href = href;
  return node;
}
export function field(label: string, input: HTMLElement, hint?: string): HTMLLabelElement {
  const id = input.id || `field-${crypto.randomUUID()}`;
  input.id = id;
  const node = element('label', 'field', [element('span', 'field-label', [label]), input]);
  node.htmlFor = id;
  if (hint) {
    const helper = element('span', 'field-hint', [hint]);
    helper.id = `${id}-hint`;
    input.setAttribute('aria-describedby', helper.id);
    node.append(helper);
  }
  return node;
}
export function textInput(value = '', maximum = 200, placeholder = ''): HTMLInputElement {
  const input = element('input', 'input');
  input.type = 'text';
  input.value = value;
  input.maxLength = maximum;
  input.placeholder = placeholder;
  return input;
}
export function textArea(value = '', maximum = 5000, rows = 3): HTMLTextAreaElement {
  const input = element('textarea', 'input');
  input.value = value;
  input.maxLength = maximum;
  input.rows = rows;
  return input;
}
export function select(options: {
  value: string;
  label: string;
}[], value: string): HTMLSelectElement {
  const input = element('select', 'input');
  for (const option of options) {
    const node = element('option', '', [option.label]);
    node.value = option.value;
    input.append(node);
  }
  input.value = value;
  return input;
}
export function notice(message: string, kind: 'info' | 'warning' | 'success' = 'info'): HTMLElement {
  return element('div', `notice ${kind}`, [icon(kind === 'success' ? 'check' : 'info'), element('span', '', [message])]);
}
export function showToast(message: string, kind: 'success' | 'error' = 'success'): void {
  let region = document.getElementById('toasts');
  if (!region) {
    region = element('div', 'toasts');
    region.id = 'toasts';
    region.setAttribute('aria-live', 'polite');
    document.body.append(region);
  }
  const toast = element('div', `toast ${kind}`, [icon(kind === 'success' ? 'check' : 'info'), element('span', '', [message])]);
  if (kind === 'error')
    toast.setAttribute('role', 'alert');
  toast.append(iconButton('Schließen', 'close', () => toast.remove()));
  region.append(toast);
  if (kind === 'success')
    window.setTimeout(() => toast.remove(), 4500);
}
export function showError(error: unknown): void {
  console.error('KlickGuide UI operation failed', error);
  showToast(errorMessage(error), 'error');
}
export function modal(title: string, wide = false): {
  dialog: HTMLDialogElement;
  body: HTMLElement;
  footer: HTMLElement;
  close: () => void;
} {
  const previous = document.activeElement;
  const dialog = element('dialog', wide ? 'modal wide' : 'modal');
  const titleNode = element('h2', '', [title]);
  titleNode.id = `dialog-${crypto.randomUUID()}`;
  dialog.setAttribute('aria-labelledby', titleNode.id);
  const close = (): void => { dialog.close(); };
  const header = element('header', 'modal-header', [titleNode, iconButton('Dialog schließen', 'close', close)]);
  const body = element('div', 'modal-body');
  const footer = element('footer', 'modal-footer');
  dialog.append(header, body, footer);
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (previous instanceof HTMLElement && previous.isConnected)
      previous.focus();
  }, { once: true });
  document.body.append(dialog);
  dialog.showModal();
  return { dialog, body, footer, close };
}
export function confirmDialog(title: string, message: string, confirmLabel = 'Bestätigen', destructive = false): Promise<boolean> {
  const view = modal(title);
  view.body.append(element('p', 'muted', [message]));
  return new Promise((resolve) => {
    let resolved = false;
    view.dialog.addEventListener('close', () => {
      if (!resolved)
        resolve(false);
    }, { once: true });
    const confirm = button(confirmLabel, null, () => { resolved = true; resolve(true); view.close(); }, destructive ? 'danger' : 'primary');
    const cancel = button('Abbrechen', null, view.close);
    view.footer.append(cancel, confirm);
    cancel.focus();
  });
}
export function askTitle(title: string, initial = ''): Promise<string | null> {
  const view = modal(title);
  const input = textInput(initial, 200, 'Zum Beispiel: Eine neue Aufgabe anlegen');
  view.body.append(field('Titel der Anleitung', input));
  return new Promise((resolve) => {
    let result: string | null = null;
    const submit = (): void => {
      if (!input.value.trim()) {
        input.setCustomValidity('Bitte einen Titel eingeben.');
        input.reportValidity();
        return;
      }
      result = input.value.trim();
      view.close();
    };
    input.addEventListener('input', () => input.setCustomValidity(''));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter')
        submit();
    });
    view.footer.append(button('Abbrechen', null, view.close), button('Anlegen', 'plus', submit, 'primary'));
    view.dialog.addEventListener('close', () => resolve(result), { once: true });
    input.focus();
  });
}
