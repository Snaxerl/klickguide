import type { RecordingSession } from '../core/model.js';
import { safeOrigin } from '../core/text.js';
import { hasWebsiteAccess, requestWebsiteAccess, WEBSITE_ACCESS_MESSAGE } from '../platform/access.js';
import { command, recordingState } from '../platform/messaging.js';
import { button, element, field, iconButton, link, notice, showError, textInput } from './dom.js';
import { icon } from './icons.js';
let renderVersion = 0;
async function render(): Promise<void> {
  const version = ++renderVersion;
  const root = document.getElementById('popup');
  if (!root)
    return;
  const [session, tabs, websiteAccess] = await Promise.all([recordingState(), chrome.tabs.query({ active: true, currentWindow: true }), hasWebsiteAccess()]);
  if (version !== renderVersion)
    return;
  const activeTab = tabs[0];
  const library = async (): Promise<void> => { await chrome.tabs.create({ url: chrome.runtime.getURL('app.html') }); window.close(); };
  const brand = link('KlickGuide', 'app.html', undefined, 'brand');
  brand.prepend(element('span', 'brand-mark', [icon('pointer', 22)]));
  brand.addEventListener('click', (event) => { event.preventDefault(); void library().catch(showError); });
  const header = element('header', 'popup-header', [brand, iconButton('Bibliothek öffnen', 'book', library)]);
  const main = element('section', 'popup-main');
  root.replaceChildren(header, main);
  if (!websiteAccess) {
    main.append(notice(WEBSITE_ACCESS_MESSAGE, 'warning'), button('Zugriff auf alle Websites erlauben', 'shield', async () => {
      // Keep the permission request in this click handler, not in the worker.
      await requestWebsiteAccess();
      await render();
    }, 'primary full'), button('Erweiterungsdetails öffnen', 'settings', async () => {
      await chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
      window.close();
    }, 'secondary full'));
  }
  if (!session) {
    main.append(element('div', 'eyebrow', ['Einmal vormachen. Klar erklären.']), element('h1', '', ['Aus Klicks wird Wissen.']), element('p', '', ['Nimm einen Ablauf in diesem Tab auf. Texte und Screenshots werden anschließend zu deiner Anleitung.']));
    const title = textInput('', 200, 'Wie heißt dein Ablauf?');
    main.append(field('Titel', title));
    const start = button('Aufnahme starten', 'play', async () => {
      if (activeTab?.id === undefined)
        return;
      await command<RecordingSession>('START', { tabId: activeTab.id, title: title.value });
      window.close();
    }, 'primary full');
    start.disabled = !websiteAccess;
    if (websiteAccess && !safeOrigin(activeTab?.url ?? '')) {
      start.disabled = true;
      main.append(notice('Öffne zuerst eine normale Webseite. Auf Browser- und Erweiterungsseiten ist keine Aufnahme möglich.', 'warning'));
    }
    main.append(element('p', 'muted', ['Nach dem Start bleibt die Aufnahme in diesem Tab auch bei Domainwechseln aktiv. Andere Tabs werden nicht automatisch aufgenommen.']), start, button('Bibliothek öffnen', 'book', library, 'secondary full'));
  }
  else {
    main.append(element('span', 'status', [element('span', 'dot'), session.status === 'recording' ? 'Aufnahme läuft' : 'Aufnahme pausiert']), element('div', 'recording-summary', [element('div', 'recording-count', [String(session.stepCount)]), element('span', '', ['Schritte erfasst'])]));
    if (session.reason)
      main.append(notice(session.reason, 'warning'));
    if (activeTab?.id !== session.tabId)
      main.append(notice('Die Aufnahme gehört zu einem anderen Tab. Kehre dorthin zurück, um sie fortzusetzen.', 'warning'));
    const toggle = button(session.status === 'recording' ? 'Pause' : 'Fortsetzen', session.status === 'recording' ? 'pause' : 'play', async () => {
      await command(session.status === 'recording' ? 'PAUSE' : 'RESUME');
      window.close();
    }, 'secondary full');
    toggle.disabled = activeTab?.id !== session.tabId || (!websiteAccess && session.status === 'paused');
    const manual = button('Screenshot hinzufügen', 'camera', async () => { await command('CAPTURE_MANUAL'); await render(); }, 'secondary full');
    manual.disabled = !websiteAccess || session.status !== 'recording' || activeTab?.id !== session.tabId;
    const finish = button('Beenden & bearbeiten', 'check', async () => { await command('STOP'); window.close(); }, 'primary full');
    main.append(toggle, manual, finish);
  }
}
void render().catch(showError);
chrome.storage.onChanged.addListener((_changes, area) => {
  // Do not redraw a title while the user types it; only a live session changes.
  if (area === 'session')
    void render().catch(showError);
});
chrome.permissions.onAdded.addListener(() => { void render().catch(showError); });
chrome.permissions.onRemoved.addListener(() => { void render().catch(showError); });
