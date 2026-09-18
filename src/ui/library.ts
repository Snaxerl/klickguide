import { APP_VERSION } from '../core/model.js';
import type { Guide } from '../core/model.js';
import { createGuide } from '../core/operations.js';
import { formatDate } from '../core/text.js';
import { createStoredGuide, deleteGuide, duplicateGuide, getImage, listGuides } from '../platform/database.js';
import { importFile } from '../platform/files.js';
import { command, recordingState } from '../platform/messaging.js';
import { askTitle, button, confirmDialog, element, iconButton, link, notice, select, showError, showToast, textInput } from './dom.js';
import { icon } from './icons.js';
export async function renderLibrary(main: HTMLElement): Promise<void> {
  document.title = 'KlickGuide · Bibliothek';
  const [guides, session] = await Promise.all([listGuides(), recordingState()]);
  const heading = element('div', 'page-heading', [
    element('div', '', [element('div', 'eyebrow', ['Deine Wissensbibliothek']), element('h1', '', ['Wissen, das bleibt.']), element('p', '', ['Halte gute Abläufe fest. Mach daraus klare Anleitungen, die andere direkt weiterbringen.'])]),
  ]);
  const importInput = element('input');
  importInput.type = 'file';
  importInput.accept = '.json,.klickguide.json';
  importInput.hidden = true;
  importInput.addEventListener('change', () => {
    const file = importInput.files?.[0];
    if (file) {
      const banner = notice('Sicherung wird geprüft und importiert. Große Bilder können einen Moment benötigen.');
      main.prepend(banner);
      void importFile(file).then((id) => { location.href = `app.html?guide=${encodeURIComponent(id)}`; }).catch(showError).finally(() => { banner.remove(); importInput.value = ''; });
    }
  });
  const newGuide = async (): Promise<void> => {
    const title = await askTitle('Neue Anleitung');
    if (!title)
      return;
    const guide = await createStoredGuide(createGuide(title));
    location.href = `app.html?guide=${guide.id}`;
  };
  heading.append(element('div', 'actions', [button('Importieren', 'upload', () => importInput.click()), button('Neue Anleitung', 'plus', newGuide, 'primary')]));
  main.append(heading, importInput);
  if (session)
    main.append(element('div', 'recording-banner', [
      element('span', '', [`Eine Aufnahme ist ${session.status === 'paused' ? 'pausiert' : 'aktiv'} · ${session.stepCount} Schritte gespeichert.`]),
      button('Aufnahme beenden', 'stop', async () => { await command('STOP'); location.reload(); }),
    ]));
  const search = textInput('', 200, 'Anleitungen und Tags durchsuchen');
  search.type = 'search';
  search.setAttribute('aria-label', 'Bibliothek durchsuchen');
  const order = select([{ value: 'recent', label: 'Zuletzt bearbeitet' }, { value: 'title', label: 'Titel A–Z' }, { value: 'steps', label: 'Anzahl Schritte' }], 'recent');
  order.classList.add('select-compact');
  order.setAttribute('aria-label', 'Sortierung');
  const count = element('span', 'muted small-text', [`${guides.length} Anleitungen`]);
  const toolbar = element('div', 'toolbar', [element('div', 'search-box', [icon('search', 17), search]), element('div', 'actions', [count, order])]);
  const grid = element('div', 'grid');
  main.append(toolbar, grid);
  const objectUrls = new Set<string>();
  let renderNumber = 0;
  window.addEventListener('pagehide', () => {
    for (const url of objectUrls)
      URL.revokeObjectURL(url);
  });
  function drawCards(): void {
    renderNumber += 1;
    const generation = renderNumber;
    for (const url of objectUrls)
      URL.revokeObjectURL(url);
    objectUrls.clear();
    grid.replaceChildren();
    const term = search.value.trim().toLocaleLowerCase('de');
    const matches = guides.filter((guide) => [guide.title, guide.description, ...guide.tags].join(' ').toLocaleLowerCase('de').includes(term));
    matches.sort((first, second) => order.value === 'title' ? first.title.localeCompare(second.title, 'de') : order.value === 'steps' ? second.steps.length - first.steps.length : second.updatedAt - first.updatedAt);
    count.textContent = `${matches.length} ${matches.length === 1 ? 'Anleitung' : 'Anleitungen'}`;
    if (!matches.length) {
      grid.className = '';
      const empty = element('section', 'empty-state', [element('div', 'empty-icon', [icon('book', 34)]), element('h2', '', [term ? 'Keine passende Anleitung gefunden' : 'Deine erste Anleitung beginnt mit einem Klick']), element('p', '', [term ? 'Versuche einen anderen Suchbegriff oder einen Tag.' : 'Öffne eine Webseite und klicke auf das KlickGuide-Symbol in der Browserleiste. Oder lege hier eine Anleitung von Hand an.'])]);
      if (!term)
        empty.append(element('div', 'actions', [button('Anleitung anlegen', 'plus', newGuide, 'primary')]));
      grid.append(empty);
      return;
    }
    grid.className = 'grid';
    for (const guide of matches) {
      const preview = element('a', 'card-preview', [element('span', 'placeholder-icon', [icon('image', 28)]), element('span', 'step-pill', [`${guide.steps.length} Schritte`])]);
      preview.href = `app.html?guide=${guide.id}`;
      preview.setAttribute('aria-label', `${guide.title} öffnen`);
      const firstImage = guide.steps.find((step) => step.imageId)?.imageId;
      if (firstImage)
        void getImage(firstImage).then((image) => {
          if (!image || generation !== renderNumber)
            return;
          const url = URL.createObjectURL(image.blob);
          objectUrls.add(url);
          const img = element('img');
          img.src = url;
          img.alt = '';
          img.loading = 'lazy';
          preview.querySelector('.placeholder-icon')?.replaceWith(img);
        }).catch(showError);
      const status = element('span', `status ${guide.status}`, [element('span', 'dot'), guide.status === 'ready' ? 'Geprüft' : 'Entwurf']);
      const title = element('h3', '', [link(guide.title || 'Unbenannte Anleitung', `app.html?guide=${guide.id}`)]);
      const tags = element('div', 'tags', guide.tags.slice(0, 3).map((tag) => element('span', 'tag', [tag])));
      const actions = element('div', 'actions', [
        iconButton('Anleitung duplizieren', 'copy', async () => {
          if (session?.guideId === guide.id) {
            showToast('Bitte zuerst die Aufnahme beenden.', 'error');
            return;
          }
          const copy = await duplicateGuide(guide.id);
          location.href = `app.html?guide=${copy.id}`;
        }),
        iconButton('Anleitung löschen', 'trash', async () => {
          if (session?.guideId === guide.id) {
            showToast('Bitte zuerst die Aufnahme beenden.', 'error');
            return;
          }
          if (await confirmDialog('Anleitung löschen?', `„${guide.title}“ und alle zugehörigen Bilder werden aus dieser Browserinstallation entfernt. Bereits exportierte Dateien bleiben erhalten.`, 'Endgültig löschen', true)) {
            await deleteGuide(guide.id);
            location.reload();
          }
        }),
      ]);
      const footer = element('div', 'card-footer', [element('span', '', [formatDate(guide.updatedAt)]), actions]);
      const body = element('div', 'card-body', [status, title, element('p', 'card-description', [guide.description || 'Schritt für Schritt zum Ziel.']), tags, footer]);
      grid.append(element('article', 'guide-card', [preview, body]));
    }
  }
  search.addEventListener('input', drawCards);
  order.addEventListener('change', drawCards);
  drawCards();
  main.append(element('section', 'quick-start', [
    quickCard('01', 'Ablauf vormachen', 'Starte die Aufnahme über das Symbol in der Browserleiste.'),
    quickCard('02', 'Klarheit schaffen', 'Prüfe Texte, ergänze Hinweise und passe Screenshots bei Bedarf an.'),
    quickCard('03', 'Bewusst weitergeben', 'Exportiere die geprüfte Anleitung als HTML, Markdown oder Druckansicht.'),
  ]));
  const help = element('p', 'muted small-text', [`KlickGuide ${APP_VERSION} · Keine Synchronisierung. Sichere wichtige Anleitungen regelmäßig über den Export.`]);
  help.style.marginTop = '26px';
  main.append(help);
}
function quickCard(number: string, title: string, description: string): HTMLElement {
  return element('div', 'quick-card', [element('span', 'quick-number', [number]), element('div', '', [element('h3', '', [title]), element('p', '', [description])])]);
}
export function recordingLock(guide: Guide, main: HTMLElement): Promise<boolean> {
  return recordingState().then((session) => {
    if (session?.guideId !== guide.id)
      return false;
    main.append(notice('Diese Anleitung wird gerade aufgenommen. Beende die Aufnahme, bevor du sie bearbeitest.', 'warning'), button('Aufnahme beenden', 'stop', async () => { await command('STOP'); location.reload(); }, 'primary'));
    return true;
  });
}
