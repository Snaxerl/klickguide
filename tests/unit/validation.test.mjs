import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../../dist/core/model.js';
import { createGuide, createStep } from '../../dist/core/operations.js';
import { parseAction, parseBackup, parseGuide, parseRect, parseSettings, parseSnapshot, settingsOrDefaults } from '../../dist/core/validation.js';
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
function backup() { const guide = createGuide('Test'); guide.steps = [{ ...createStep(), imageId: 'image-1' }]; return { format: 'klickguide', version: 1, guide, images: [{ id: 'image-1', dataUrl: png }] }; }
const action = { eventId: 'event-one', stateRevision: 0, observedAt: 1000, kind: 'click', label: 'Save', documentToken: 'document-1', targetToken: 'target-1', box: { x: 10, y: 20, width: 50, height: 20 }, viewport: { width: 800, height: 600, scrollX: 0, scrollY: 0 } };
test('valid guide survives schema validation', () => { const guide = createGuide('A guide'); assert.deepEqual(parseGuide(guide), guide); });
test('unknown guide fields are stripped', () => { const guide = parseGuide({ ...createGuide(), accessToken: 'secret', extra: true }); assert.equal(guide.accessToken, undefined); assert.equal(guide.extra, undefined); });
test('duplicate step IDs are rejected', () => { const step = createStep(); assert.throws(() => parseGuide({ ...createGuide(), steps: [step, step] }), /doppelt/); });
test('shared image IDs are rejected', () => { const steps = [{ ...createStep(), imageId: 'shared' }, { ...createStep(), imageId: 'shared' }]; assert.throws(() => parseGuide({ ...createGuide(), steps }), /eigenen Schritt/); });
test('invalid status values are rejected', () => { assert.throws(() => parseGuide({ ...createGuide(), status: 'published' }), /Status/); });
test('invalid colors cannot reach exported CSS', () => { assert.throws(() => parseGuide({ ...createGuide(), accent: '</style><script>' })); });
test('empty and invalid IDs are rejected', () => { assert.throws(() => parseGuide({ ...createGuide(), id: '../guide' })); assert.throws(() => parseGuide({ ...createGuide(), id: '' })); });
test('long bodies and too many tags are rejected', () => { assert.throws(() => parseGuide({ ...createGuide(), tags: Array(13).fill('a') })); assert.throws(() => parseGuide({ ...createGuide(), steps: [{ ...createStep(), body: 'x'.repeat(10001) }] })); });
test('fractional revisions are rejected', () => { assert.throws(() => parseGuide({ ...createGuide(), revision: 1.5 })); });
test('full URLs are rejected in step origins', () => { assert.throws(() => parseGuide({ ...createGuide(), steps: [{ ...createStep(), origin: 'https://example.com/customer?id=5' }] })); });
test('out-of-image rectangles are rejected', () => { assert.throws(() => parseRect({ x: .9, y: 0, width: .2, height: 1 })); });
test('NaN and infinite coordinates are rejected', () => { assert.throws(() => parseRect({ x: NaN, y: 0, width: 1, height: 1 })); assert.throws(() => parseRect({ x: 0, y: 0, width: Infinity, height: 1 })); });
test('capture messages are validated and stripped', () => { assert.deepEqual(parseAction({ ...action, inputValue: 'do not retain' }), action); });
test('unknown action types are rejected', () => { assert.throws(() => parseAction({ ...action, kind: 'run-script' })); });
test('invalid capture viewports are rejected', () => { assert.throws(() => parseAction({ ...action, viewport: { ...action.viewport, width: 0 } })); });
test('capture snapshots validate domain and redaction bounds', () => { const value = { documentToken: 'doc-1', origin: 'https://example.com', viewport: action.viewport, protectedAreas: [action.box], interactionRevision: 0, stateRevision: 0, toolbarHidden: true, targets: [{ token: 'target-1', box: action.box }] }; assert.deepEqual(parseSnapshot(value), value); });
test('too many redaction areas fail closed', () => { assert.throws(() => parseSnapshot({ documentToken: 'doc-1', origin: 'https://example.com', viewport: action.viewport, protectedAreas: Array(2001).fill(action.box), targetBox: null })); });
test('valid backup is accepted', () => { const source = backup(); assert.deepEqual(parseBackup(JSON.stringify(source)), source); });
test('future backup versions are not silently accepted', () => { assert.throws(() => parseBackup(JSON.stringify({ ...backup(), version: 2 })), /nicht unterstützt/); });
test('malformed JSON cannot be imported', () => { assert.throws(() => parseBackup('{broken')); });
test('remote screenshot URLs are rejected', () => { const source = backup(); source.images[0].dataUrl = 'https://example.com/track.png'; assert.throws(() => parseBackup(JSON.stringify(source))); });
test('SVG image data is rejected even when embedded', () => { const source = backup(); source.images[0].dataUrl = 'data:image/svg+xml;base64,PHN2Zz4='; assert.throws(() => parseBackup(JSON.stringify(source))); });
test('duplicate archive images are rejected', () => { const source = backup(); source.images.push(source.images[0]); assert.throws(() => parseBackup(JSON.stringify(source)), /Doppelte/); });
test('missing archive images are rejected', () => { const source = backup(); source.images = []; assert.throws(() => parseBackup(JSON.stringify(source)), /fehlen/); });
test('orphan images are rejected', () => { const source = backup(); source.guide.steps = []; assert.throws(() => parseBackup(JSON.stringify(source))); });
test('prototype keys do not enter the reconstructed guide', () => { const source = JSON.stringify(backup()).replace('"guide":{', '"guide":{"__proto__":{"polluted":true},'); const result = parseBackup(source); assert.equal(Object.hasOwn(result.guide, '__proto__'), false); assert.equal({}.polluted, undefined); });
test('valid privacy settings are preserved', () => { assert.deepEqual(parseSettings(DEFAULT_SETTINGS), DEFAULT_SETTINGS); });
test('legacy settings migrate with automatic redaction disabled', () => { assert.equal(parseSettings({ guideLanguage: 'de', maskMedia: true, keepOrigin: false, maskSelectors: [] }).autoRedactSensitiveAreas, false); });
test('broken stored settings fall back to conservative defaults', () => { assert.deepEqual(settingsOrDefaults({ maskMedia: false }), DEFAULT_SETTINGS); });
test('selector limits are enforced', () => { assert.throws(() => parseSettings({ ...DEFAULT_SETTINGS, maskSelectors: Array(21).fill('input') })); });
for (const patch of [{ stateRevision: -1 }, { stateRevision: 1.5 }, { stateRevision: NaN }, { observedAt: Infinity }, { eventId: '' }, { eventId: '../bad' }])
  test(`invalid capture identity or revision is rejected ${JSON.stringify(patch)}`, () => assert.throws(() => parseAction({ ...action, ...patch })));
test('capture snapshot must explicitly report toolbar visibility and input revision', () => {
  const snapshot = { documentToken: 'doc-1', origin: 'https://example.org', viewport: action.viewport, protectedAreas: [], targets: [], stateRevision: 0, interactionRevision: 0, toolbarHidden: true };
  assert.throws(() => parseSnapshot({ ...snapshot, toolbarHidden: undefined }));
  assert.throws(() => parseSnapshot({ ...snapshot, interactionRevision: undefined }));
});
test('duplicate target identities are rejected before caching', () => {
  const target = { token: 'target-1', box: action.box };
  assert.throws(() => parseSnapshot({ documentToken: 'doc-1', origin: 'https://example.org', viewport: action.viewport, protectedAreas: [], targets: [target, target], stateRevision: 0, interactionRevision: 0, toolbarHidden: true }), /Doppelte/);
});
