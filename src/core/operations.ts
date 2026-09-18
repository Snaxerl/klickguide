import { AppError } from './errors.js';
import { MAX_STEPS } from './model.js';
import type { Guide, Language, Step, StepKind } from './model.js';
export function createGuide(title = 'Neue Anleitung', language: Language = 'de'): Guide {
  const now = Date.now();
  return { id: crypto.randomUUID(), title, description: '', author: '', tags: [], status: 'draft', language, accent: '#5144d8', createdAt: now, updatedAt: now, revision: 0, steps: [] };
}
export function createStep(kind: StepKind = 'note', title = 'Neuer Schritt'): Step {
  return { id: crypto.randomUUID(), kind, title, body: '', origin: '', warning: '', createdAt: Date.now(), imageId: null, annotations: [] };
}
export function addStep(guide: Guide, step: Step, afterId?: string): Guide {
  if (guide.steps.length >= MAX_STEPS)
    throw new AppError('limit', `Eine Anleitung darf höchstens ${MAX_STEPS} Schritte enthalten.`);
  const steps = [...guide.steps];
  const previousIndex = afterId ? steps.findIndex((item) => item.id === afterId) : -1;
  steps.splice(previousIndex >= 0 ? previousIndex + 1 : steps.length, 0, step);
  return { ...guide, steps, status: 'draft' };
}
export function moveStep(guide: Guide, stepId: string, direction: -1 | 1): Guide {
  const index = guide.steps.findIndex((step) => step.id === stepId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= guide.steps.length)
    return guide;
  const steps = [...guide.steps];
  const [step] = steps.splice(index, 1);
  if (step)
    steps.splice(target, 0, step);
  return { ...guide, steps, status: 'draft' };
}
export function updateStep(guide: Guide, stepId: string, changes: Partial<Pick<Step, 'title' | 'body' | 'annotations' | 'warning'>>): Guide {
  return { ...guide, status: 'draft', steps: guide.steps.map((step) => step.id === stepId ? { ...step, ...changes } : step) };
}
export function removeStep(guide: Guide, stepId: string): Guide {
  return { ...guide, status: 'draft', steps: guide.steps.filter((step) => step.id !== stepId) };
}
