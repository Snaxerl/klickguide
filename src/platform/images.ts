import { AppError, assert } from '../core/errors.js';
import { pixelBounds } from '../core/geometry.js';
import { MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS } from '../core/model.js';
import type { Rect } from '../core/model.js';
export interface Raster {
  blob: Blob;
  width: number;
  height: number;
}
export interface ImageEdits {
  redactions?: Rect[];
  crop?: Rect;
  annotations?: Rect[];
  accent?: string;
}
function dimensions(width: number, height: number): void {
  assert(width > 0 && height > 0 && width * height <= MAX_IMAGE_PIXELS && width <= 32768 && height <= 32768, 'Das Bild ist zu groß. Erlaubt sind bis zu 20 Millionen Pixel.');
}
/** Validate the container before decoding, so an oversized PNG is rejected early. */
async function inspectImage(blob: Blob): Promise<'image/png' | 'image/jpeg'> {
  assert(blob.size > 0 && blob.size <= MAX_IMAGE_BYTES, 'Das Bild darf höchstens 12 MB groß sein.');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) {
    const view = new DataView(bytes.buffer);
    assert(view.getUint32(12) === 0x49484452, 'Ungültiger PNG-Header.');
    dimensions(view.getUint32(16), view.getUint32(20));
    return 'image/png';
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset] !== 0xff)
        break;
      while (bytes[offset] === 0xff)
        offset += 1;
      const marker = bytes[offset++];
      if (marker === undefined || marker === 0xd9 || marker === 0xda)
        break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7))
        continue;
      const high = bytes[offset];
      const low = bytes[offset + 1];
      if (high === undefined || low === undefined)
        break;
      const length = high * 256 + low;
      if (length < 2 || offset + length > bytes.length)
        break;
      if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) {
        const view = new DataView(bytes.buffer);
        dimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
        return 'image/jpeg';
      }
      offset += length;
    }
  }
  throw new AppError('invalid-data', 'Bitte ein gültiges PNG- oder JPEG-Bild auswählen. SVG und andere aktive Formate werden nicht importiert.');
}
export function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  assert(match?.[1] && match[2], 'Ungültige Bilddaten.');
  assert(match[2].length <= Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 4, 'Das Bild ist zu groß.');
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: `image/${match[1]}` });
}
export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const pieces: string[] = [];
  for (let start = 0; start < bytes.length; start += 0x8000)
    pieces.push(String.fromCharCode(...bytes.subarray(start, start + 0x8000)));
  return `data:${blob.type};base64,${btoa(pieces.join(''))}`;
}
/** Re-encoding strips metadata and flattens redactions into the stored pixels. */
export async function editImage(blob: Blob, edits: ImageEdits = {}): Promise<Raster> {
  const mime = await inspectImage(blob);
  const bitmap = await createImageBitmap(new Blob([blob], { type: mime }), { imageOrientation: 'from-image' });
  try {
    dimensions(bitmap.width, bitmap.height);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d', { alpha: false });
    if (!context)
      throw new AppError('invalid-data', 'Die Bildbearbeitung wird von diesem Browser nicht unterstützt.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    context.fillStyle = '#111827';
    for (const rect of edits.redactions ?? []) {
      const area = pixelBounds(rect, canvas.width, canvas.height);
      context.fillRect(area.x, area.y, area.width, area.height);
    }
    const accent = /^#[0-9a-fA-F]{6}$/.test(edits.accent ?? '') ? edits.accent : '#5144d8';
    context.strokeStyle = accent ?? '#5144d8';
    context.lineWidth = Math.max(3, canvas.width / 400);
    for (const rect of edits.annotations ?? []) {
      const area = pixelBounds(rect, canvas.width, canvas.height);
      context.strokeRect(area.x + 1, area.y + 1, Math.max(0, area.width - 2), Math.max(0, area.height - 2));
    }
    let output = canvas;
    if (edits.crop) {
      const crop = pixelBounds(edits.crop, canvas.width, canvas.height);
      assert(crop.width >= 4 && crop.height >= 4, 'Der Bildausschnitt ist zu klein.');
      output = new OffscreenCanvas(crop.width, crop.height);
      const cropped = output.getContext('2d', { alpha: false });
      if (!cropped)
        throw new AppError('invalid-data', 'Der Bildausschnitt konnte nicht erstellt werden.');
      cropped.drawImage(canvas, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
    }
    const result = await output.convertToBlob({ type: 'image/png' });
    assert(result.size <= MAX_IMAGE_BYTES, 'Das bearbeitete Bild überschreitet die Grenze von 12 MB. Bitte einen kleineren Ausschnitt verwenden.');
    return { blob: result, width: output.width, height: output.height };
  }
  finally {
    bitmap.close();
  }
}
