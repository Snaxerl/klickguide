import { AppError, assert } from './errors.js';
import { BACKUP_VERSION, DEFAULT_SETTINGS, MAX_IMAGE_BYTES, MAX_IMPORT_BYTES, MAX_STEPS } from './model.js';
import { safeOrigin } from './text.js';
export function object(value) {
    assert(typeof value === 'object' && value !== null && !Array.isArray(value), 'Ungültiges Datenformat.');
    return value;
}
export function text(value, maximum, field = 'Text') {
    assert(typeof value === 'string' && value.length <= maximum, `${field} fehlt oder ist zu lang.`);
    return value;
}
function number(value, minimum, maximum) {
    assert(typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum, 'Ungültiger Zahlenwert.');
    return value;
}
function integer(value) {
    const result = number(value, 0, Number.MAX_SAFE_INTEGER);
    assert(Number.isInteger(result), 'Ungültiger Zählerstand.');
    return result;
}
function identifier(value) {
    const id = text(value, 80, 'ID');
    assert(/^[a-zA-Z0-9_-]{1,80}$/.test(id), 'Ungültige ID.');
    return id;
}
export function parseRect(value) {
    const source = object(value);
    const rect = { x: number(source.x, 0, 1), y: number(source.y, 0, 1), width: number(source.width, 0, 1), height: number(source.height, 0, 1) };
    assert(rect.x + rect.width <= 1.000001 && rect.y + rect.height <= 1.000001, 'Markierung liegt außerhalb des Bildes.');
    return rect;
}
function parseBounds(value) {
    const source = object(value);
    return { x: number(source.x, -100000, 100000), y: number(source.y, -100000, 100000), width: number(source.width, 0, 100000), height: number(source.height, 0, 100000) };
}
function parseViewport(value) {
    const source = object(value);
    return { width: number(source.width, 1, 32768), height: number(source.height, 1, 32768), scrollX: number(source.scrollX, -100000000, 100000000), scrollY: number(source.scrollY, -100000000, 100000000) };
}
export function parseAction(value) {
    const source = object(value);
    assert(source.kind === 'click' || source.kind === 'input' || source.kind === 'manual', 'Unbekannte Aktion.');
    return { eventId: identifier(source.eventId), stateRevision: integer(source.stateRevision), observedAt: number(source.observedAt, 0, 8.64e15), kind: source.kind, label: text(source.label, 100), documentToken: identifier(source.documentToken), targetToken: identifier(source.targetToken), box: source.box === null ? null : parseBounds(source.box), viewport: parseViewport(source.viewport) };
}
export function parseSnapshot(value) {
    const source = object(value);
    assert(Array.isArray(source.protectedAreas) && source.protectedAreas.length <= 2000, 'Zu viele geschützte Bereiche. Aufnahme aus Sicherheitsgründen ausgelassen.');
    const origin = text(source.origin, 2000);
    assert(origin === safeOrigin(origin), 'Ungültige Seitenadresse.');
    assert(typeof source.toolbarHidden === 'boolean', 'Unbekannter Zustand der Aufnahmeleiste.');
    assert(Array.isArray(source.targets) && source.targets.length <= 2000, 'Zu viele Bedienelemente.');
    const targets = source.targets.map((item) => { const target = object(item); return { token: identifier(target.token), box: parseBounds(target.box) }; });
    assert(new Set(targets.map((target) => target.token)).size === targets.length, 'Doppelte Zielkennung.');
    return { interactionRevision: integer(source.interactionRevision), stateRevision: integer(source.stateRevision), toolbarHidden: source.toolbarHidden, targets, documentToken: identifier(source.documentToken), origin, viewport: parseViewport(source.viewport), protectedAreas: source.protectedAreas.map(parseBounds) };
}
function parseStep(value) {
    const source = object(value);
    assert(source.kind === 'click' || source.kind === 'input' || source.kind === 'navigation' || source.kind === 'manual' || source.kind === 'note', 'Unbekannter Schritttyp.');
    assert(Array.isArray(source.annotations) && source.annotations.length <= 100, 'Zu viele Markierungen.');
    const origin = text(source.origin, 2000);
    assert(origin === '' || origin === safeOrigin(origin), 'Nur die Domain darf als Seitenadresse gespeichert werden.');
    return { id: identifier(source.id), kind: source.kind, title: text(source.title, 200), body: text(source.body, 10000), origin, warning: text(source.warning, 1000), createdAt: number(source.createdAt, 0, 8.64e15), imageId: source.imageId === null ? null : identifier(source.imageId), annotations: source.annotations.map(parseRect) };
}
export function parseGuide(value) {
    const source = object(value);
    assert(source.status === 'draft' || source.status === 'ready', 'Unbekannter Status.');
    assert(source.language === 'de' || source.language === 'en', 'Unbekannte Sprache.');
    assert(Array.isArray(source.steps) && source.steps.length <= MAX_STEPS, `Höchstens ${MAX_STEPS} Schritte sind erlaubt.`);
    assert(Array.isArray(source.tags) && source.tags.length <= 12, 'Höchstens zwölf Tags sind erlaubt.');
    const accent = text(source.accent, 7);
    assert(/^#[0-9a-fA-F]{6}$/.test(accent), 'Ungültige Akzentfarbe.');
    const steps = source.steps.map(parseStep);
    assert(new Set(steps.map((step) => step.id)).size === steps.length, 'Schritt-IDs dürfen nicht doppelt vorkommen.');
    const imageIds = steps.flatMap((step) => step.imageId ? [step.imageId] : []);
    assert(new Set(imageIds).size === imageIds.length, 'Jeder Screenshot muss einem eigenen Schritt gehören.');
    const revision = number(source.revision, 0, Number.MAX_SAFE_INTEGER);
    assert(Number.isInteger(revision), 'Ungültige Versionsnummer.');
    return { id: identifier(source.id), title: text(source.title, 200), description: text(source.description, 5000), author: text(source.author, 120), tags: source.tags.map((tag) => text(tag, 40)), status: source.status, language: source.language, accent, createdAt: number(source.createdAt, 0, 8.64e15), updatedAt: number(source.updatedAt, 0, 8.64e15), revision, steps };
}
export function parseSettings(value) {
    const source = object(value);
    assert(source.guideLanguage === 'de' || source.guideLanguage === 'en', 'Unbekannte Sprache.');
    assert(typeof source.maskMedia === 'boolean' && typeof source.keepOrigin === 'boolean', 'Ungültige Aufnahmeeinstellung.');
    const autoRedactSensitiveAreas = source.autoRedactSensitiveAreas === undefined ? false : source.autoRedactSensitiveAreas;
    assert(typeof autoRedactSensitiveAreas === 'boolean', 'Ungültige Aufnahmeeinstellung.');
    assert(Array.isArray(source.maskSelectors) && source.maskSelectors.length <= 20, 'Höchstens zwanzig CSS-Selektoren sind erlaubt.');
    return { guideLanguage: source.guideLanguage, autoRedactSensitiveAreas, maskMedia: source.maskMedia, keepOrigin: source.keepOrigin, maskSelectors: source.maskSelectors.map((selector) => text(selector, 300, 'CSS-Selektor')).filter(Boolean) };
}
export function settingsOrDefaults(value) {
    try {
        return parseSettings(value);
    }
    catch {
        return { ...DEFAULT_SETTINGS, maskSelectors: [] };
    }
}
/** Never trust file names, MIME headers or version fields supplied by an import. */
export function parseBackup(contents) {
    assert(new TextEncoder().encode(contents).length <= MAX_IMPORT_BYTES, 'Die Sicherungsdatei ist zu groß (maximal 80 MB).');
    let parsed;
    try {
        parsed = JSON.parse(contents);
    }
    catch {
        throw new AppError('invalid-data', 'Die Datei enthält kein gültiges JSON.');
    }
    const source = object(parsed);
    assert(source.format === 'klickguide' && source.version === BACKUP_VERSION, 'Dieses Sicherungsformat wird nicht unterstützt.');
    const guide = parseGuide(source.guide);
    assert(Array.isArray(source.images) && source.images.length <= MAX_STEPS, 'Ungültige Bilderliste.');
    const images = source.images.map((item) => {
        const image = object(item);
        const dataUrl = text(image.dataUrl, Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 100, 'Bild');
        assert(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl), 'Sicherungen dürfen nur eingebettete PNG-Bilder enthalten.');
        return { id: identifier(image.id), dataUrl };
    });
    const ids = new Set(images.map((image) => image.id));
    assert(ids.size === images.length, 'Doppelte Bild-IDs in der Sicherung.');
    const referencedIds = new Set(guide.steps.flatMap((step) => step.imageId ? [step.imageId] : []));
    assert(ids.size === referencedIds.size && [...referencedIds].every((id) => ids.has(id)), 'Bilder fehlen oder sind keinem Schritt zugeordnet.');
    return { format: 'klickguide', version: 1, guide, images };
}
