import { AppError, assert } from '../core/errors.js';
import { buildHtml, buildMarkdown } from '../core/export.js';
import type { ExportImage } from '../core/export.js';
import { MAX_IMPORT_BYTES } from '../core/model.js';
import type { BackupEnvelope, GuideBundle } from '../core/model.js';
import { parseBackup } from '../core/validation.js';
import { safeFilename } from '../core/text.js';
import { makeZip } from '../core/zip.js';
import type { ZipEntry } from '../core/zip.js';
import { blobToDataUrl, dataUrlToBlob, editImage } from './images.js';
import { importBundle } from './database.js';
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Keep the URL alive until the browser has consumed a potentially large file.
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export async function exportImages(bundle: GuideBundle): Promise<ExportImage[]> {
  const images = new Map(bundle.images.map((image) => [image.id, image]));
  const result: ExportImage[] = [];
  for (const step of bundle.guide.steps) {
    if (!step.imageId)
      continue;
    const image = images.get(step.imageId);
    if (!image)
      throw new AppError('missing', 'Ein Bild fehlt. Der Export wurde nicht erstellt.');
    const rendered = await editImage(image.blob, { annotations: step.annotations, accent: bundle.guide.accent });
    result.push({ stepId: step.id, dataUrl: await blobToDataUrl(rendered.blob) });
  }
  return result;
}
export function downloadHtml(bundle: GuideBundle, images: ExportImage[]): void {
  downloadBlob(new Blob([buildHtml(bundle.guide, images)], { type: 'text/html;charset=utf-8' }), `${safeFilename(bundle.guide.title)}.html`);
}
export async function downloadMarkdown(bundle: GuideBundle, images: ExportImage[]): Promise<void> {
  const names = new Map<string, string>();
  const entries: ZipEntry[] = [];
  for (const [index, step] of bundle.guide.steps.entries()) {
    const image = images.find((item) => item.stepId === step.id);
    if (!image)
      continue;
    const name = `images/step-${String(index + 1).padStart(3, '0')}.png`;
    names.set(step.id, name);
    entries.push({ name, data: new Uint8Array(await dataUrlToBlob(image.dataUrl).arrayBuffer()) });
  }
  entries.unshift({ name: 'README.md', data: new TextEncoder().encode(buildMarkdown(bundle.guide, names)) });
  downloadBlob(new Blob([makeZip(entries)], { type: 'application/zip' }), `${safeFilename(bundle.guide.title)}-markdown.zip`);
}
export async function downloadBackup(bundle: GuideBundle): Promise<void> {
  const backup: BackupEnvelope = { format: 'klickguide', version: 1, guide: bundle.guide, images: [] };
  for (const image of bundle.images)
    backup.images.push({ id: image.id, dataUrl: await blobToDataUrl(image.blob) });
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  assert(blob.size <= MAX_IMPORT_BYTES, 'Diese Anleitung ist für eine einzelne Sicherungsdatei zu groß. Teile sie in kleinere Anleitungen auf.');
  downloadBlob(blob, `${safeFilename(bundle.guide.title)}.klickguide.json`);
}
export async function importFile(file: File): Promise<string> {
  assert(file.size <= MAX_IMPORT_BYTES, 'Die Datei darf höchstens 80 MB groß sein.');
  const backup = parseBackup(await file.text());
  const bundle: GuideBundle = { guide: backup.guide, images: [] };
  for (const image of backup.images) {
    const raster = await editImage(dataUrlToBlob(image.dataUrl));
    bundle.images.push({ ...raster, id: image.id, guideId: backup.guide.id });
  }
  const guide = await importBundle(bundle);
  return guide.id;
}
