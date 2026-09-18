import { AppError } from '../core/errors.js';
import { parseSettings, settingsOrDefaults } from '../core/validation.js';
import { button, element, field, select, showToast, textArea } from './dom.js';
export async function renderSettings(main: HTMLElement): Promise<void> {
  document.title = 'KlickGuide · Einstellungen';
  const saved = await chrome.storage.local.get('settings');
  const settings = settingsOrDefaults(saved.settings);
  const heading = element('div', 'page-heading', [element('div', '', [element('h1', '', ['Einstellungen']), element('p', '', ['Diese Einstellungen gelten für neue Aufnahmen.'])])]);
  const layout = element('div', 'settings-layout');
  const language = select([{ value: 'de', label: 'Deutsch' }, { value: 'en', label: 'English' }], settings.guideLanguage);
  const automaticRedaction = element('input');
  automaticRedaction.type = 'checkbox';
  automaticRedaction.checked = settings.autoRedactSensitiveAreas;
  const media = element('input');
  media.type = 'checkbox';
  media.checked = settings.maskMedia;
  const origin = element('input');
  origin.type = 'checkbox';
  origin.checked = settings.keepOrigin;
  const selectors = textArea(settings.maskSelectors.join('\n'), 6000, 4);
  selectors.spellcheck = false;
  const recording = element('section', 'settings-card', [element('h2', '', ['Aufnahme']), field('Sprache neuer Schritttexte', language),
  element('label', 'field-inline', [automaticRedaction, element('span', '', ['Sensible Bereiche automatisch schwärzen', element('span', 'field-hint', ['Standardmäßig ausgeschaltet. Schwärzen ist jederzeit manuell im Bildeditor möglich.'])])]),
  element('label', 'field-inline', [media, element('span', '', ['Canvas- und Videobereiche bei automatischer Schwärzung einbeziehen'])]),
  element('label', 'field-inline', [origin, element('span', '', ['Domain pro Schritt speichern', element('span', 'field-hint', ['Nur die Domain, niemals URL-Pfade, Suchparameter oder Fragmente.'])])]),
  field('Zusätzliche Bereiche für automatische Schwärzung', selectors, 'Optional: ein CSS-Selektor pro Zeile. Wird nur verwendet, wenn automatische Schwärzung aktiviert ist.'),
  ]);
  const syncAutomaticRedactionControls = (): void => {
    media.disabled = !automaticRedaction.checked;
    selectors.disabled = !automaticRedaction.checked;
  };
  automaticRedaction.addEventListener('change', syncAutomaticRedactionControls);
  syncAutomaticRedactionControls();
  recording.append(button('Einstellungen speichern', 'save', async () => {
    const rules = selectors.value.split('\n').map((value) => value.trim()).filter(Boolean);
    for (const rule of rules) {
      try {
        document.querySelector(rule);
      }
      catch {
        throw new AppError('invalid-data', `Ungültiger CSS-Selektor: ${rule}`);
      }
    }
    const next = parseSettings({ guideLanguage: language.value, autoRedactSensitiveAreas: automaticRedaction.checked, maskMedia: media.checked, keepOrigin: origin.checked, maskSelectors: rules });
    await chrome.storage.local.set({ settings: next });
    showToast('Einstellungen gespeichert.');
  }, 'primary'));
  const shortcuts = element('section', 'settings-card', [element('h2', '', ['Weniger Mauswege']), element('p', '', ['Die Tastenkürzel können in den Erweiterungseinstellungen deines Browsers geändert werden.']), element('div', 'shortcuts', [
    element('span', '', ['KlickGuide öffnen']), element('kbd', 'keyboard', ['Alt + Shift + K']),
    element('span', '', ['Screenshot zur Aufnahme hinzufügen']), element('kbd', 'keyboard', ['Alt + Shift + S']),
    element('span', '', ['Aufnahme pausieren / fortsetzen']), element('kbd', 'keyboard', ['Alt + Shift + P']),
    element('span', '', ['Anleitung im Editor speichern']), element('kbd', 'keyboard', ['Ctrl / Cmd + S']),
  ])]);
  layout.append(recording, shortcuts);
  main.append(heading, layout);
}
