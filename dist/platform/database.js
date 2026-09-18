import { AppError } from '../core/errors.js';
import { addStep, createGuide } from '../core/operations.js';
import { parseGuide } from '../core/validation.js';
const DATABASE_NAME = 'klickguide';
const DATABASE_VERSION = 1;
let connection;
function openDatabase() {
    if (connection)
        return connection;
    connection = new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
        let blocked = false;
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains('guides'))
                database.createObjectStore('guides', { keyPath: 'id' });
            if (!database.objectStoreNames.contains('images')) {
                const images = database.createObjectStore('images', { keyPath: 'id' });
                images.createIndex('guideId', 'guideId');
            }
        };
        request.onerror = () => { connection = undefined; reject(request.error); };
        request.onblocked = () => {
            blocked = true;
            connection = undefined;
            reject(new AppError('busy', 'Eine ältere Ansicht blockiert den Speicher. Schließe andere KlickGuide-Tabs und lade neu.'));
        };
        request.onsuccess = () => {
            const database = request.result;
            if (blocked) {
                database.close();
                return;
            }
            database.onversionchange = () => { database.close(); connection = undefined; };
            resolve(database);
        };
    });
    return connection;
}
function read(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
async function inTransaction(mode, operation) {
    const database = await openDatabase();
    const transaction = database.transaction(['guides', 'images'], mode);
    const finished = new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error ?? new DOMException('Transaction aborted', 'AbortError'));
        transaction.onerror = () => { };
    });
    // Request failures can reject before the transaction's abort event fires.
    void finished.catch(() => undefined);
    try {
        const result = await operation(transaction);
        await finished;
        return result;
    }
    catch (error) {
        try {
            transaction.abort();
        }
        catch { /* It may already have finished. */ }
        await finished.catch(() => undefined);
        throw error;
    }
}
async function guideIn(transaction, guideId) {
    const value = await read(transaction.objectStore('guides').get(guideId));
    if (!value)
        throw new AppError('missing', 'Diese Anleitung wurde gelöscht oder ist nicht mehr verfügbar.');
    return parseGuide(value);
}
function assertRevision(current, expected) {
    if (current.revision !== expected) {
        throw new AppError('conflict', 'Diese Anleitung wurde in einer anderen Ansicht geändert. Lade sie neu, bevor du weiterarbeitest.');
    }
}
async function imageIdsIn(transaction, guideId) {
    return read(transaction.objectStore('images').index('guideId').getAllKeys(guideId));
}
export async function listGuides() {
    return inTransaction('readonly', async (transaction) => {
        const values = await read(transaction.objectStore('guides').getAll());
        return values.map(parseGuide).sort((a, b) => b.updatedAt - a.updatedAt);
    });
}
export async function getGuide(guideId) {
    return inTransaction('readonly', (transaction) => guideIn(transaction, guideId));
}
export async function getImage(imageId) {
    return inTransaction('readonly', async (transaction) => {
        return await read(transaction.objectStore('images').get(imageId));
    });
}
export async function createStoredGuide(guide) {
    const validated = parseGuide(guide);
    return inTransaction('readwrite', async (transaction) => {
        await read(transaction.objectStore('guides').add(validated));
        return validated;
    });
}
/** Metadata and image deletion commit together, guarded by a revision check. */
export async function saveGuide(guide) {
    const validated = parseGuide(guide);
    return inTransaction('readwrite', async (transaction) => {
        const current = await guideIn(transaction, guide.id);
        assertRevision(current, guide.revision);
        const imageIds = await imageIdsIn(transaction, guide.id);
        const retained = new Set(validated.steps.flatMap((step) => step.imageId ? [step.imageId] : []));
        const existing = new Set(imageIds.map(String));
        if ([...retained].some((id) => !existing.has(id)))
            throw new AppError('invalid-data', 'Ein zugehöriges Bild fehlt. Bitte die Anleitung neu laden.');
        for (const id of imageIds)
            if (!retained.has(String(id)))
                transaction.objectStore('images').delete(id);
        const next = { ...validated, updatedAt: Date.now(), revision: current.revision + 1 };
        await read(transaction.objectStore('guides').put(next));
        return next;
    });
}
export async function appendRecordedStep(guideId, step, image) {
    return inTransaction('readwrite', async (transaction) => {
        const current = await guideIn(transaction, guideId);
        const imageId = image ? crypto.randomUUID() : null;
        const next = addStep(current, { ...step, imageId });
        next.updatedAt = Date.now();
        next.revision += 1;
        if (image && imageId)
            transaction.objectStore('images').add({ ...image, id: imageId, guideId });
        await read(transaction.objectStore('guides').put(next));
        return next;
    });
}
/** Replaces the only stored raster. No hidden original or redaction undo exists. */
export async function replaceStepImage(guide, stepId, image) {
    const validated = parseGuide(guide);
    return inTransaction('readwrite', async (transaction) => {
        const current = await guideIn(transaction, guide.id);
        assertRevision(current, guide.revision);
        const step = validated.steps.find((item) => item.id === stepId);
        if (!step)
            throw new AppError('missing', 'Der Schritt wurde nicht gefunden.');
        const imageId = step.imageId ?? crypto.randomUUID();
        const next = { ...validated, status: 'draft', updatedAt: Date.now(), revision: current.revision + 1, steps: validated.steps.map((item) => item.id === stepId ? { ...item, imageId, warning: '' } : item) };
        transaction.objectStore('images').put({ ...image, id: imageId, guideId: guide.id });
        await read(transaction.objectStore('guides').put(next));
        return next;
    });
}
export async function readBundle(guideId) {
    return inTransaction('readonly', async (transaction) => {
        const guide = await guideIn(transaction, guideId);
        const images = await read(transaction.objectStore('images').index('guideId').getAll(guideId));
        return { guide, images };
    });
}
export async function deleteGuide(guideId) {
    await inTransaction('readwrite', async (transaction) => {
        const ids = await imageIdsIn(transaction, guideId);
        for (const id of ids)
            transaction.objectStore('images').delete(id);
        await read(transaction.objectStore('guides').delete(guideId));
    });
}
/** Imports always get fresh IDs; an untrusted archive cannot overwrite a guide. */
export async function importBundle(bundle, title) {
    const original = parseGuide(bundle.guide);
    const fresh = createGuide(title ?? original.title, original.language);
    const sourceImages = new Map(bundle.images.map((image) => [image.id, image]));
    const images = [];
    const steps = original.steps.map((step) => {
        let imageId = null;
        if (step.imageId) {
            const source = sourceImages.get(step.imageId);
            if (!source)
                throw new AppError('invalid-data', 'Ein Bild der Anleitung fehlt.');
            imageId = crypto.randomUUID();
            images.push({ ...source, id: imageId, guideId: fresh.id });
        }
        return { ...step, id: crypto.randomUUID(), imageId, annotations: step.annotations.map((rect) => ({ ...rect })) };
    });
    const guide = { ...original, id: fresh.id, title: fresh.title, createdAt: fresh.createdAt, updatedAt: fresh.updatedAt, revision: 0, status: 'draft', steps };
    return inTransaction('readwrite', async (transaction) => {
        for (const image of images)
            transaction.objectStore('images').add(image);
        await read(transaction.objectStore('guides').add(guide));
        return guide;
    });
}
export async function duplicateGuide(guideId) {
    const bundle = await readBundle(guideId);
    return importBundle(bundle, `${bundle.guide.title.slice(0, 190)} (Kopie)`);
}
