import { AppError } from '../core/errors.js';
import { downloadBackup, downloadHtml, downloadMarkdown, exportImages } from '../platform/files.js';
import { button, element, modal, notice, showToast } from './dom.js';
import { documentPreview } from './preview.js';
export async function showExportDialog(bundle) {
    const view = modal('Prüfen & exportieren', true);
    view.body.append(notice('Die Vorschau wird aus dem gespeicherten Stand erstellt. Alle Markierungen werden für HTML und Markdown in die Bilder eingerechnet.'));
    const loading = element('p', 'muted', ['Bilder werden vorbereitet …']);
    view.body.append(loading);
    let images;
    try {
        images = await exportImages(bundle);
    }
    catch (error) {
        view.close();
        throw error;
    }
    if (!view.dialog.isConnected)
        return;
    loading.remove();
    const preview = element('div', 'export-review', [documentPreview(bundle, images)]);
    preview.tabIndex = 0;
    preview.setAttribute('aria-label', 'Vorschau aller Schritte. Zum vollständigen Prüfen nach unten scrollen.');
    const reviewed = element('input');
    reviewed.type = 'checkbox';
    reviewed.id = 'export-reviewed';
    const confirmation = element('label', 'field-inline export-review-controls', [reviewed, element('span', '', ['Ich habe alle Schritte und Bilder auf Richtigkeit und vertrauliche Informationen geprüft.'])]);
    confirmation.htmlFor = reviewed.id;
    view.body.append(preview, confirmation);
    const requireReview = () => {
        if (!reviewed.checked)
            throw new AppError('permission', 'Bitte die vollständige Vorschau zuerst prüfen und bestätigen.');
    };
    const html = button('HTML', 'download', () => { requireReview(); downloadHtml(bundle, images); showToast('HTML-Download gestartet.'); });
    const markdown = button('Markdown ZIP', 'download', async () => { requireReview(); await downloadMarkdown(bundle, images); showToast('Markdown-Download gestartet.'); });
    const backup = button('Projektsicherung', 'save', async () => { requireReview(); await downloadBackup(bundle); showToast('Sicherungsdownload gestartet.'); });
    const print = button('PDF / Drucken', 'print', async () => {
        requireReview();
        await chrome.tabs.create({ url: chrome.runtime.getURL(`print.html?guide=${bundle.guide.id}&revision=${bundle.guide.revision}`) });
    }, 'primary');
    const exports = [html, markdown, backup, print];
    for (const action of exports)
        action.disabled = true;
    reviewed.addEventListener('change', () => {
        for (const action of exports)
            action.disabled = !reviewed.checked;
    });
    view.footer.append(button('Zurück', null, view.close), ...exports);
}
