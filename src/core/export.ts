import type { Guide } from './model.js';
import { escapeHtml, escapeMarkdown } from './text.js';
export interface ExportImage {
  stepId: string;
  dataUrl: string;
}
export const GUIDE_STYLES = `
:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f3f4f8;color:#172033;font:16px/1.7 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:980px;margin:48px auto;padding:64px;background:#fff;border:1px solid #e4e7ef;border-radius:20px}header{padding-bottom:30px;border-bottom:1px solid #e4e7ef;margin-bottom:36px}.eyebrow{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#596177;font-weight:700}h1{font-size:40px;line-height:1.15;letter-spacing:-.04em;margin:14px 0 18px;overflow-wrap:anywhere}h2{font-size:22px;line-height:1.4;margin:0;overflow-wrap:anywhere}.description,.body{white-space:pre-wrap;overflow-wrap:anywhere}.meta{color:#596177;font-size:13px}article{margin:0 0 44px;break-inside:avoid}.step-heading{display:flex;gap:16px;align-items:flex-start}.number{display:grid;place-items:center;flex-shrink:0;min-width:34px;height:34px;border-radius:10px;background:var(--accent);color:white;font-size:14px;font-weight:700}.body{margin:14px 0 18px 50px}img{display:block;width:auto;max-width:100%;height:auto;max-height:650px;object-fit:contain;border:1px solid #dce0e9;border-radius:10px;margin:20px 0}.check{font-size:12px;color:#596177;display:block;margin-top:10px}input{accent-color:var(--accent)}.warning{padding:12px 16px;border-left:3px solid #ad6415;background:#fff7e8;color:#694210;font-size:13px}.origin{font-size:12px;color:#596177;overflow-wrap:anywhere}footer{border-top:1px solid #e4e7ef;padding-top:20px;color:#596177;font-size:12px}@media(max-width:700px){main{margin:0;border:0;border-radius:0;padding:24px}h1{font-size:30px}.body{margin-left:0}}@media print{@page{margin:16mm}body{background:white}main{max-width:none;margin:0;padding:0;border:0;border-radius:0}h1{font-size:30px}article{break-inside:avoid}img{max-height:180mm}.check{display:none}footer{font-size:10px}}
`;
function safeImageData(value: string | undefined): string {
  return value && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : '';
}
export function guideBody(guide: Guide, images: ExportImage[]): string {
  const english = guide.language === 'en';
  const imageMap = new Map(images.map((image) => [image.stepId, safeImageData(image.dataUrl)]));
  const date = new Intl.DateTimeFormat(english ? 'en-GB' : 'de-DE', { dateStyle: 'medium' }).format(guide.updatedAt);
  const metadata = [guide.author, `${guide.steps.length} ${english ? 'steps' : 'Schritte'}`, date].filter(Boolean).map(escapeHtml).join(' · ');
  return `<main><header><div class="eyebrow">${english ? 'Step by step' : 'Schritt für Schritt'}</div><h1>${escapeHtml(guide.title)}</h1><p class="description">${escapeHtml(guide.description)}</p><div class="meta">${metadata}</div></header>${guide.steps.map((step, index) => {
    const image = imageMap.get(step.id);
    return `<article><div class="step-heading"><span class="number">${index + 1}</span><h2>${escapeHtml(step.title)}</h2></div>${step.body ? `<div class="body">${escapeHtml(step.body)}</div>` : ''}${image ? `<img src="${image}" alt="${escapeHtml(step.title)}">` : ''}${step.warning ? `<p class="warning">${escapeHtml(step.warning)}</p>` : ''}${step.origin ? `<p class="origin">${escapeHtml(step.origin)}</p>` : ''}<label class="check"><input type="checkbox"> ${english ? 'Done' : 'Erledigt'}</label></article>`;
  }).join('')}<footer>${english ? 'Created with' : 'Erstellt mit'} KlickGuide · ${english ? 'Local-first. Yours to share.' : 'Lokal erstellt. Bewusst geteilt.'}</footer></main>`;
}
export function buildHtml(guide: Guide, images: ExportImage[]): string {
  const accent = /^#[0-9a-fA-F]{6}$/.test(guide.accent) ? guide.accent : '#5144d8';
  return `<!doctype html>\n<html lang="${guide.language === 'en' ? 'en' : 'de'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><meta name="referrer" content="no-referrer"><title>${escapeHtml(guide.title)}</title><style>${GUIDE_STYLES}\n:root{--accent:${accent}}</style></head><body>${guideBody(guide, images)}</body></html>`;
}
export function buildMarkdown(guide: Guide, images: ReadonlyMap<string, string>): string {
  const pieces = [`# ${escapeMarkdown(guide.title)}`, escapeMarkdown(guide.description)];
  if (guide.author)
    pieces.push(`**${guide.language === 'en' ? 'Author' : 'Autor'}:** ${escapeMarkdown(guide.author)}`);
  guide.steps.forEach((step, index) => {
    pieces.push(`## ${index + 1}. ${escapeMarkdown(step.title)}`);
    if (step.body)
      pieces.push(escapeMarkdown(step.body));
    const image = images.get(step.id);
    if (image && /^images\/step-\d+\.png$/.test(image))
      pieces.push(`![${escapeMarkdown(step.title)}](${image})`);
    if (step.warning)
      pieces.push(`> ${escapeMarkdown(step.warning).replace(/\n/g, '\n> ')}`);
    if (step.origin)
      pieces.push(escapeMarkdown(step.origin));
  });
  pieces.push('---\nKlickGuide');
  return `${pieces.filter(Boolean).join('\n\n')}\n`;
}
