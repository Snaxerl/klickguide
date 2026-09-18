import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHtml, buildMarkdown } from '../../dist/core/export.js';
import { createGuide, createStep } from '../../dist/core/operations.js';
import { crc32, makeZip } from '../../dist/core/zip.js';
function guide() { return { ...createGuide('Safe guide'), steps: [createStep('note', 'First step')] }; }
test('HTML is self-contained and disallows scripts and network connections', () => { const output = buildHtml(guide(), []); assert.ok(output.startsWith('<!doctype html>')); assert.ok(output.includes("default-src 'none'")); assert.ok(output.includes("img-src data:")); assert.ok(!output.includes('<script')); assert.ok(!output.includes('<link')); });
test('guide titles cannot inject markup into HTML', () => { const source = guide(); source.title = '</title><script>alert(1)</script>'; const output = buildHtml(source, []); assert.ok(!output.includes('<script>')); assert.ok(output.includes('&lt;script&gt;')); });
test('step bodies and descriptions are escaped', () => { const source = guide(); source.description = '<iframe src=x>'; source.steps[0].body = '<img onerror="attack()">'; const output = buildHtml(source, []); assert.ok(!output.includes('<iframe')); assert.ok(!output.includes('<img onerror')); });
test('export rejects remote and scriptable image URLs', () => { const source = guide(); const output = buildHtml(source, [{ stepId: source.steps[0].id, dataUrl: 'javascript:alert(1)' }]); assert.ok(!output.includes('javascript:')); });
test('HTML checkboxes work without embedded scripts', () => { assert.ok(buildHtml(guide(), []).includes('type="checkbox"')); });
test('missing screenshots remain visibly marked', () => { const source = guide(); source.steps[0].warning = 'Screenshot fehlt'; assert.ok(buildHtml(source, []).includes('Screenshot fehlt')); });
test('invalid accent colors fall back to the default', () => { const source = guide(); source.accent = 'red;}body{display:none'; const output = buildHtml(source, []); assert.ok(output.includes('--accent:#5144d8')); assert.ok(!output.includes('display:none</style>')); });
test('Markdown uses only known generated image paths', () => { const source = guide(); const good = buildMarkdown(source, new Map([[source.steps[0].id, 'images/step-001.png']])); const bad = buildMarkdown(source, new Map([[source.steps[0].id, '../../secret.png']])); assert.ok(good.includes('images/step-001.png')); assert.ok(!bad.includes('secret.png')); });
test('Markdown escapes executable HTML and link injection', () => { const source = guide(); source.steps[0].body = '<script>run()</script> [link](javascript:run())'; const output = buildMarkdown(source, new Map()); assert.ok(!output.includes('<script>')); assert.ok(!output.includes('[link](')); });
test('CRC32 matches a standard test vector', () => { assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926); });
test('ZIP includes local headers, directory and end record', () => { const data = new TextEncoder().encode('hello'); const zip = makeZip([{ name: 'README.md', data }]); const view = new DataView(zip.buffer); assert.equal(view.getUint32(0, true), 0x04034b50); assert.equal(view.getUint32(zip.length - 22, true), 0x06054b50); assert.equal(view.getUint16(zip.length - 12, true), 1); assert.equal(view.getUint32(14, true), crc32(data)); });
test('ZIP bytes are deterministic for unchanged entries', () => { const entries = [{ name: 'README.md', data: new TextEncoder().encode('text') }]; assert.deepEqual(makeZip(entries), makeZip(entries)); });
for (const name of ['../secret', '/absolute', 'images/../../file', 'C:\\Windows\\file'])
  test(`reject unsafe ZIP path ${name}`, () => { assert.throws(() => makeZip([{ name, data: new Uint8Array() }])); });
test('duplicate ZIP entries are rejected', () => { const file = { name: 'README.md', data: new Uint8Array() }; assert.throws(() => makeZip([file, file])); });
test('empty ZIP is a valid empty end record', () => { assert.equal(makeZip([]).byteLength, 22); });
