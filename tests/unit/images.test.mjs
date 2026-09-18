import test from 'node:test';
import assert from 'node:assert/strict';
import { blobToDataUrl, dataUrlToBlob, editImage } from '../../dist/platform/images.js';
import { MAX_IMAGE_BYTES } from '../../dist/core/model.js';
function pngHeader(width, height, chunk = 0x49484452) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  view.setUint32(12, chunk);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return new Blob([bytes], { type: 'image/png' });
}
test('embedded PNG bytes roundtrip without text encoding damage', async () => {
  const bytes = new Uint8Array([0, 1, 127, 128, 255]);
  const original = new Blob([bytes], { type: 'image/png' });
  const restored = dataUrlToBlob(await blobToDataUrl(original));
  assert.deepEqual(new Uint8Array(await restored.arrayBuffer()), bytes);
  assert.equal(restored.type, 'image/png');
});
test('JPEG data URLs retain their declared type for container inspection', () => {
  assert.equal(dataUrlToBlob('data:image/jpeg;base64,/9j/2Q==').type, 'image/jpeg');
});
test('remote image URLs are not accepted as embedded image data', () => {
  assert.throws(() => dataUrlToBlob('https://example.invalid/picture.png'), /Bilddaten/);
});
test('SVG data URLs are rejected even when base64 encoded', () => {
  assert.throws(() => dataUrlToBlob('data:image/svg+xml;base64,PHN2Zz4='), /Bilddaten/);
});
test('a data URL cannot contain trailing markup', () => {
  assert.throws(() => dataUrlToBlob('data:image/png;base64,YQ==<script>'), /Bilddaten/);
});
test('zero-byte uploads fail before any browser decoding', async () => {
  await assert.rejects(editImage(new Blob([])), /12 MB/);
});
test('oversized uploads fail before any browser decoding', async () => {
  await assert.rejects(editImage(new Blob([new Uint8Array(MAX_IMAGE_BYTES + 1)])), /12 MB/);
});
test('an image MIME label does not make executable SVG a PNG', async () => {
  await assert.rejects(editImage(new Blob(['<svg><script>alert(1)</script></svg>'], { type: 'image/png' })), /gültiges PNG/);
});
test('PNG dimensions are bounded before decompression', async () => {
  await assert.rejects(editImage(pngHeader(5000, 5000)), /20 Millionen/);
});
test('zero-width PNG headers are rejected before decoding', async () => {
  await assert.rejects(editImage(pngHeader(0, 100)), /20 Millionen/);
});
test('a PNG without its required first header chunk is rejected', async () => {
  await assert.rejects(editImage(pngHeader(100, 100, 0x74455874)), /PNG-Header/);
});
test('truncated JPEG data is rejected instead of passed to the decoder', async () => {
  await assert.rejects(editImage(new Blob([new Uint8Array([255, 216, 255, 192, 0])], { type: 'image/jpeg' })), /gültiges PNG/);
});
