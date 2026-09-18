import { APP_VERSION } from '../core/model.js';
import { errorMessage } from '../core/errors.js';
import { element, link, notice, showError } from './dom.js';
import { icon } from './icons.js';
import { renderEditor } from './editor.js';
import { renderLibrary } from './library.js';
import { renderSettings } from './settings.js';
async function render(): Promise<void> {
  const root = document.getElementById('app');
  if (!root)
    return;
  const parameters = new URLSearchParams(location.search);
  // Accept the short hash routes used by the recorder and extension settings.
  const guideId = parameters.get('guide') ?? (location.hash.startsWith('#guide/') ? location.hash.slice(7) : null);
  const settings = parameters.get('view') === 'settings' || location.hash === '#settings';
  const brand = link('KlickGuide', 'app.html', undefined, 'brand');
  brand.prepend(element('span', 'brand-mark', [icon('pointer', 23)]));
  const navigation = element('nav', '', [link('Bibliothek', 'app.html', 'book', `nav-link ${!settings ? 'active' : ''}`), link('Einstellungen', 'app.html?view=settings', 'settings', `nav-link ${settings ? 'active' : ''}`)]);
  navigation.setAttribute('aria-label', 'Hauptnavigation');
  const sidebar = element('aside', 'sidebar', [brand, element('div', 'sidebar-label', ['Arbeitsbereich']), navigation,
    element('div', 'sidebar-bottom', [element('div', 'version', [`KLICKGUIDE ${APP_VERSION} · OPEN SOURCE`])]),
  ]);
  const topbar = element('header', 'topbar', [element('div', 'breadcrumbs', ['Arbeitsbereich', ' / ', settings ? 'Einstellungen' : guideId ? 'Anleitung bearbeiten' : 'Bibliothek'])]);
  const main = element('main', 'main');
  main.id = 'main';
  main.tabIndex = -1;
  root.replaceChildren(element('div', 'shell', [sidebar, element('div', 'workspace', [topbar, main])]));
  try {
    if (settings)
      await renderSettings(main);
    else if (guideId)
      await renderEditor(main, guideId);
    else
      await renderLibrary(main);
  }
  catch (error) {
    console.error('KlickGuide view failed', error);
    main.replaceChildren(element('h1', '', ['Die Ansicht konnte nicht geöffnet werden.']), notice(errorMessage(error), 'warning'), link('Zur Bibliothek', 'app.html', 'back', 'button secondary'));
  }
}
window.addEventListener('unhandledrejection', (event) => { event.preventDefault(); showError(event.reason); });
void render().catch(showError);
