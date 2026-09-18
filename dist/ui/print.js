import { AppError } from '../core/errors.js';
import { readBundle } from '../platform/database.js';
import { exportImages } from '../platform/files.js';
import { button, element, notice, showError } from './dom.js';
import { documentPreview } from './preview.js';
async function render() {
    const root = document.getElementById('print');
    if (!root)
        return;
    const parameters = new URLSearchParams(location.search);
    const guideId = parameters.get('guide');
    if (!guideId)
        throw new AppError('missing', 'Keine Anleitung für die Druckansicht ausgewählt.');
    const bundle = await readBundle(guideId);
    if (parameters.has('revision') && Number(parameters.get('revision')) !== bundle.guide.revision) {
        root.replaceChildren(notice('Die Anleitung wurde seit der Exportvorschau geändert. Öffne den Export erneut und prüfe die aktuelle Version.', 'warning'));
        return;
    }
    document.title = bundle.guide.title;
    const images = await exportImages(bundle);
    const reviewed = element('input');
    reviewed.type = 'checkbox';
    let imagesReady = false;
    const printButton = button('Drucken / als PDF speichern', 'print', () => {
        if (!reviewed.checked || !imagesReady)
            throw new AppError('busy', 'Bitte warte auf alle Bilder und prüfe die Druckvorschau.');
        window.print();
    }, 'primary');
    printButton.disabled = true;
    reviewed.disabled = true;
    reviewed.addEventListener('change', () => { printButton.disabled = !reviewed.checked || !imagesReady; });
    const controls = element('section', 'print-controls', [element('label', 'field-inline', [reviewed, 'Ich habe die vollständige Druckvorschau geprüft.']), printButton]);
    root.replaceChildren(controls, documentPreview(bundle, images));
    await Promise.all(Array.from(root.querySelectorAll('img')).map((image) => image.decode()));
    imagesReady = true;
    reviewed.disabled = false;
}
void render().catch((error) => {
    showError(error);
    document.querySelector('.boot')?.remove();
});
