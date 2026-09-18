import { AppError } from '../core/errors.js';
import { addStep, createStep, moveStep, removeStep, updateStep } from '../core/operations.js';
import { SerialQueue } from '../core/queue.js';
import { getGuide, getImage, replaceStepImage, readBundle, saveGuide } from '../platform/database.js';
import { editImage } from '../platform/images.js';
import { button, confirmDialog, element, field, iconButton, link, notice, select, showError, showToast, textArea, textInput } from './dom.js';
import { showExportDialog } from './export-dialog.js';
import { icon } from './icons.js';
import { ImageEditor } from './image-editor.js';
import { recordingLock } from './library.js';
class GuideEditor {
    main;
    guide;
    selectedId;
    dirty = false;
    busy = false;
    imageEditor = null;
    writes = new SerialQueue();
    status = element('span', 'save-state');
    title = element('h1');
    reviewStatus = null;
    list = element('ol', 'step-list');
    stepCount = element('span');
    content = element('div');
    saveButton;
    fileInput = element('input');
    paintNumber = 0;
    constructor(guide, main) {
        this.main = main;
        this.guide = guide;
        this.selectedId = guide.steps[0]?.id ?? null;
        this.saveButton = button('Speichern', 'save', async () => { await this.save(); showToast('Anleitung gespeichert.'); }, 'secondary');
        this.fileInput.type = 'file';
        this.fileInput.accept = 'image/png,image/jpeg';
        this.fileInput.hidden = true;
        this.fileInput.addEventListener('change', () => {
            const file = this.fileInput.files?.[0];
            if (file)
                void this.uploadImage(file).catch(showError).finally(() => { this.fileInput.value = ''; });
        });
        window.addEventListener('beforeunload', (event) => {
            if (this.dirty || this.imageEditor?.hasChanges || this.busy) {
                event.preventDefault();
                event.returnValue = '';
            }
        });
        window.addEventListener('pagehide', () => this.imageEditor?.dispose());
        document.addEventListener('keydown', (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                event.preventDefault();
                if (!document.querySelector('dialog[open]'))
                    void this.save().then(() => showToast('Anleitung gespeichert.')).catch(showError);
            }
        });
        this.render();
    }
    render() {
        const heading = element('div', 'page-heading editor-heading', [element('div', 'heading-left', [link('Bibliothek', 'app.html', 'back', 'muted small-text'), this.title, this.status]), element('div', 'actions', [
                button('Neu laden', 'undo', async () => {
                    if ((this.dirty || this.imageEditor?.hasChanges) && !await confirmDialog('Ungespeicherte Änderungen verwerfen?', 'Der zuletzt gespeicherte Stand wird neu geladen.', 'Neu laden'))
                        return;
                    this.dirty = false;
                    this.imageEditor?.dispose();
                    this.imageEditor = null;
                    location.reload();
                }, 'ghost'),
                this.saveButton,
                button('Prüfen & exportieren', 'download', async () => {
                    if (this.imageEditor?.hasChanges)
                        throw new AppError('busy', 'Wende deine Bildänderungen zuerst an oder verwirf sie.');
                    await this.save();
                    await showExportDialog(await readBundle(this.guide.id));
                }, 'primary'),
            ])]);
        const sidebar = element('aside', 'step-sidebar', [element('div', 'step-sidebar-head', [this.stepCount, iconButton('Neuen Schritt hinzufügen', 'plus', () => this.addNote())]), this.list, element('div', 'step-sidebar-footer', [button('Schritt hinzufügen', 'plus', () => this.addNote(), 'ghost full')])]);
        this.main.append(heading, this.details(), element('div', 'editor-layout', [sidebar, this.content]), this.fileInput);
        this.updateStatus();
        this.renderList();
        void this.renderStep().catch(showError);
    }
    details() {
        const details = element('details', 'guide-details');
        details.append(element('summary', '', ['Titel, Beschreibung & Dokumenteinstellungen']));
        const fields = element('div', 'details-content');
        const title = textInput(this.guide.title, 200);
        title.required = true;
        const description = textArea(this.guide.description, 5000, 2);
        const author = textInput(this.guide.author, 120, 'Optional');
        const tags = textInput(this.guide.tags.join(', '), 500, 'Zum Beispiel: Onboarding, Prozesse');
        const language = select([{ value: 'de', label: 'Deutsch' }, { value: 'en', label: 'English' }], this.guide.language);
        const status = select([{ value: 'draft', label: 'Entwurf' }, { value: 'ready', label: 'Geprüft' }], this.guide.status);
        this.reviewStatus = status;
        const accent = element('input', 'input');
        accent.type = 'color';
        accent.value = this.guide.accent;
        title.addEventListener('input', () => { this.guide.title = title.value; this.markDirty(); });
        description.addEventListener('input', () => { this.guide.description = description.value; this.markDirty(); });
        author.addEventListener('input', () => { this.guide.author = author.value; this.markDirty(); });
        tags.addEventListener('input', () => { this.guide.tags = tags.value.split(',').map((value) => value.trim()).filter(Boolean); this.markDirty(); });
        language.addEventListener('change', () => { this.guide.language = language.value === 'en' ? 'en' : 'de'; this.markDirty(); });
        status.addEventListener('change', () => { this.guide.status = status.value === 'ready' ? 'ready' : 'draft'; this.markDirty(false); });
        accent.addEventListener('change', () => { this.guide.accent = accent.value; this.imageEditor?.setAccent(accent.value); this.markDirty(); });
        const titleField = field('Titel', title);
        titleField.classList.add('span-two');
        const descriptionField = field('Beschreibung', description);
        descriptionField.classList.add('span-three');
        fields.append(titleField, field('Autor / Team', author), descriptionField, field('Tags, durch Komma getrennt', tags, 'Maximal zwölf Tags mit jeweils 40 Zeichen.'), field('Dokumentsprache', language), field('Status', status), field('Akzentfarbe im Export', accent, 'Gilt für exportierte Markierungen und Schrittnummern.'));
        details.append(fields);
        return details;
    }
    markDirty(resetStatus = true) {
        this.dirty = true;
        if (resetStatus)
            this.guide.status = 'draft';
        if (this.reviewStatus)
            this.reviewStatus.value = this.guide.status;
        this.updateStatus();
    }
    updateStatus() {
        this.title.textContent = this.guide.title || 'Unbenannte Anleitung';
        document.title = `${this.guide.title || 'Anleitung'} · KlickGuide`;
        const pending = this.dirty || this.imageEditor?.hasChanges;
        this.status.classList.toggle('dirty', Boolean(pending));
        this.status.replaceChildren(icon(this.busy ? 'clock' : pending ? 'info' : 'check', 13), document.createTextNode(this.busy ? 'Wird gespeichert …' : pending ? 'Ungespeicherte Änderungen' : 'Gespeichert'));
        this.saveButton.disabled = this.busy || !this.dirty;
    }
    renderList() {
        this.stepCount.textContent = `${this.guide.steps.length} Schritte`;
        this.list.replaceChildren();
        for (const [index, step] of this.guide.steps.entries()) {
            const entry = element('button', `step-link ${step.id === this.selectedId ? 'selected' : ''}`, [element('span', 'step-number', [String(index + 1)]), element('span', 'step-text', [element('span', 'step-title', [step.title || 'Unbenannter Schritt']), step.warning ? element('span', 'step-warning-dot', ['Bild prüfen']) : null])]);
            entry.type = 'button';
            entry.title = step.title || 'Unbenannter Schritt';
            entry.setAttribute('aria-current', step.id === this.selectedId ? 'step' : 'false');
            entry.addEventListener('click', () => { void this.selectStep(step.id).catch(showError); });
            this.list.append(element('li', 'step-item', [entry]));
        }
    }
    async mayDiscardImageEdits() {
        if (this.busy || this.imageEditor?.isApplying)
            return false;
        return !this.imageEditor?.hasChanges || await confirmDialog('Bildänderungen verwerfen?', 'Die Bildänderungen dieses Schritts wurden noch nicht angewendet. Die Textänderungen bleiben erhalten.', 'Bildänderungen verwerfen');
    }
    async selectStep(id) {
        if (id === this.selectedId || !await this.mayDiscardImageEdits())
            return;
        this.selectedId = id;
        this.renderList();
        await this.renderStep();
    }
    async addNote() {
        if (!await this.mayDiscardImageEdits())
            return;
        const step = createStep();
        this.guide = addStep(this.guide, step, this.selectedId ?? undefined);
        this.selectedId = step.id;
        this.markDirty();
        this.renderList();
        await this.renderStep();
    }
    async renderStep() {
        const generation = ++this.paintNumber;
        this.imageEditor?.dispose();
        this.imageEditor = null;
        this.content.replaceChildren();
        const step = this.guide.steps.find((item) => item.id === this.selectedId);
        if (!step) {
            this.content.append(element('section', 'editor-empty', [icon('book', 35), element('h2', '', ['Schritt für Schritt.']), element('p', '', ['Füge einen Schritt hinzu, um deine Anleitung aufzubauen.']), button('Ersten Schritt hinzufügen', 'plus', () => this.addNote(), 'primary')]));
            this.updateStatus();
            return;
        }
        const panel = element('section', 'step-panel');
        const index = this.guide.steps.findIndex((item) => item.id === step.id);
        const controls = element('div', 'actions');
        const move = async (direction) => {
            if (!await this.mayDiscardImageEdits())
                return;
            this.guide = moveStep(this.guide, step.id, direction);
            this.markDirty();
            this.renderList();
            await this.renderStep();
        };
        const up = iconButton('Schritt nach oben', 'up', () => move(-1));
        up.disabled = index === 0;
        const down = iconButton('Schritt nach unten', 'down', () => move(1));
        down.disabled = index === this.guide.steps.length - 1;
        controls.append(up, down, iconButton('Schritt duplizieren', 'copy', () => this.duplicateStep(step.id)), iconButton('Schritt löschen', 'trash', async () => {
            if (!await this.mayDiscardImageEdits())
                return;
            if (!await confirmDialog('Schritt löschen?', 'Der Schritt und sein Bild werden beim nächsten Speichern aus dieser Anleitung entfernt.', 'Schritt löschen', true))
                return;
            this.guide = removeStep(this.guide, step.id);
            this.selectedId = this.guide.steps[Math.min(index, this.guide.steps.length - 1)]?.id ?? null;
            this.markDirty();
            this.renderList();
            await this.renderStep();
        }));
        panel.append(element('header', 'step-panel-header', [element('h2', '', [`Schritt ${index + 1} bearbeiten`]), controls]));
        const image = step.imageId ? await getImage(step.imageId) : undefined;
        if (generation !== this.paintNumber)
            return;
        this.imageEditor = new ImageEditor({
            image, annotations: step.annotations, accent: this.guide.accent,
            onApply: async (raster, annotations) => { await this.applyImage(step.id, raster, annotations); },
            onUpload: () => this.fileInput.click(), onDirtyChange: () => this.updateStatus(),
        });
        panel.append(this.imageEditor.root);
        const form = element('div', 'step-fields');
        const title = textInput(step.title, 200);
        title.setAttribute('aria-label', 'Schritttitel');
        const body = textArea(step.body, 10000, 4);
        body.placeholder = 'Was ist hier wichtig? Ergänze einen Hinweis, ein Beispiel oder eine Voraussetzung.';
        title.addEventListener('input', () => { this.guide = updateStep(this.guide, step.id, { title: title.value }); this.markDirty(); this.renderList(); });
        body.addEventListener('input', () => { this.guide = updateStep(this.guide, step.id, { body: body.value }); this.markDirty(); });
        form.append(field('Was soll getan werden?', title), field('Beschreibung & Hinweise', body));
        if (step.warning) {
            const warning = notice(step.warning, 'warning');
            warning.append(button('Hinweis erledigt', 'check', () => {
                this.guide = updateStep(this.guide, step.id, { warning: '' });
                this.markDirty();
                this.renderList();
                warning.remove();
            }, 'ghost'));
            form.append(warning);
        }
        const imageActions = element('div', 'actions', [button(step.imageId ? 'Bild ersetzen' : 'Bild hochladen', 'upload', () => this.fileInput.click(), 'ghost')]);
        if (step.imageId)
            imageActions.append(button('Bild entfernen', 'trash', async () => {
                if (!await this.mayDiscardImageEdits())
                    return;
                if (!await confirmDialog('Bild entfernen?', 'Das Bild wird beim nächsten Speichern aus diesem Schritt entfernt.', 'Bild entfernen', true))
                    return;
                this.guide = { ...this.guide, steps: this.guide.steps.map((item) => item.id === step.id ? { ...item, imageId: null, annotations: [] } : item) };
                this.markDirty();
                await this.renderStep();
            }, 'ghost'));
        form.append(imageActions);
        panel.append(form);
        this.content.replaceChildren(panel);
        this.updateStatus();
    }
    async save() {
        return this.writes.enqueue(async () => {
            if (!this.dirty)
                return;
            if (!this.guide.title.trim())
                throw new AppError('invalid-data', 'Bitte einen Titel für die Anleitung eingeben.');
            this.busy = true;
            this.updateStatus();
            const snapshot = structuredClone(this.guide);
            try {
                const saved = await saveGuide(snapshot);
                // Preserve edits made while IndexedDB was committing the snapshot.
                if (JSON.stringify(this.guide) === JSON.stringify(snapshot)) {
                    this.guide = saved;
                    this.dirty = false;
                }
                else {
                    this.guide.revision = saved.revision;
                    this.guide.updatedAt = saved.updatedAt;
                }
            }
            finally {
                this.busy = false;
                this.updateStatus();
            }
        });
    }
    async uploadImage(file) {
        const stepId = this.selectedId;
        if (!stepId || !await this.mayDiscardImageEdits())
            return;
        const raster = await editImage(file);
        if (this.selectedId !== stepId)
            throw new AppError('busy', 'Der ausgewählte Schritt hat sich geändert. Bitte das Bild erneut auswählen.');
        await this.applyImage(stepId, raster, []);
    }
    async applyImage(stepId, raster, annotations) {
        await this.save();
        await this.writes.enqueue(async () => {
            this.busy = true;
            this.updateStatus();
            try {
                const snapshot = structuredClone(this.guide);
                const next = updateStep(snapshot, stepId, { annotations, warning: '' });
                const saved = await replaceStepImage(next, stepId, raster);
                if (JSON.stringify(this.guide) === JSON.stringify(snapshot)) {
                    this.guide = saved;
                    this.dirty = false;
                }
                else {
                    const savedStep = saved.steps.find((step) => step.id === stepId);
                    this.guide = { ...this.guide, revision: saved.revision, updatedAt: saved.updatedAt, steps: this.guide.steps.map((step) => step.id === stepId && savedStep ? { ...step, imageId: savedStep.imageId, annotations, warning: '' } : step) };
                    this.dirty = true;
                }
            }
            finally {
                this.busy = false;
                this.updateStatus();
            }
        });
        this.renderList();
        await this.renderStep();
        showToast('Bildänderungen gespeichert.');
    }
    async duplicateStep(stepId) {
        if (!await this.mayDiscardImageEdits())
            return;
        await this.save();
        const original = this.guide.steps.find((step) => step.id === stepId);
        if (!original)
            return;
        const copy = { ...original, id: crypto.randomUUID(), title: `${original.title.slice(0, 190)} (Kopie)`, imageId: null, annotations: original.annotations.map((rect) => ({ ...rect })) };
        this.guide = addStep(this.guide, copy, original.id);
        this.selectedId = copy.id;
        this.markDirty();
        await this.save();
        if (original.imageId) {
            const image = await getImage(original.imageId);
            if (image)
                await this.applyImage(copy.id, image, copy.annotations);
        }
        this.renderList();
        await this.renderStep();
    }
}
export async function renderEditor(main, guideId) {
    const guide = await getGuide(guideId);
    if (await recordingLock(guide, main))
        return;
    new GuideEditor(guide, main);
}
