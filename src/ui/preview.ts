import type { GuideBundle } from '../core/model.js';
import type { ExportImage } from '../core/export.js';
import { formatDate } from '../core/text.js';
import { element, notice } from './dom.js';
export function documentPreview(bundle: GuideBundle, images: ExportImage[]): HTMLElement {
  const { guide } = bundle;
  const root = element('article', 'document-preview');
  root.style.setProperty('--accent', guide.accent);
  const metadata = [guide.author, `${guide.steps.length} ${guide.language === 'en' ? 'steps' : 'Schritte'}`, formatDate(guide.updatedAt)].filter(Boolean).join(' · ');
  root.append(element('header', '', [element('div', 'eyebrow', [guide.language === 'en' ? 'Step by step' : 'Schritt für Schritt']), element('h1', '', [guide.title]), element('p', 'description', [guide.description]), element('p', 'meta', [metadata])]));
  for (const [index, step] of guide.steps.entries()) {
    const section = element('section', 'preview-step', [element('h2', '', [element('span', 'step-number', [String(index + 1)]), step.title])]);
    if (step.body)
      section.append(element('p', 'step-body', [step.body]));
    const image = images.find((item) => item.stepId === step.id);
    if (image) {
      const img = element('img');
      img.src = image.dataUrl;
      img.alt = step.title;
      section.append(img);
    }
    if (step.warning)
      section.append(notice(step.warning, 'warning'));
    if (step.origin)
      section.append(element('p', 'meta', [step.origin]));
    root.append(section);
  }
  root.append(element('footer', '', ['KlickGuide']));
  return root;
}
