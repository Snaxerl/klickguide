import type { Bounds, Rect, Viewport } from './model.js';
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
export function rectangleFromPoints(startX: number, startY: number, endX: number, endY: number): Rect {
  const left = clamp(Math.min(startX, endX), 0, 1);
  const top = clamp(Math.min(startY, endY), 0, 1);
  return {
    x: left,
    y: top,
    width: clamp(Math.max(startX, endX), 0, 1) - left,
    height: clamp(Math.max(startY, endY), 0, 1) - top,
  };
}
export function normalizeBounds(bounds: Bounds, viewport: Viewport): Rect | null {
  if (viewport.width <= 0 || viewport.height <= 0)
    return null;
  const left = clamp(bounds.x, 0, viewport.width);
  const top = clamp(bounds.y, 0, viewport.height);
  const right = clamp(bounds.x + bounds.width, 0, viewport.width);
  const bottom = clamp(bounds.y + bounds.height, 0, viewport.height);
  if (right <= left || bottom <= top)
    return null;
  return { x: left / viewport.width, y: top / viewport.height, width: (right - left) / viewport.width, height: (bottom - top) / viewport.height };
}
export function sameViewport(first: Viewport, second: Viewport): boolean {
  return first.width === second.width && first.height === second.height &&
    first.scrollX === second.scrollX && first.scrollY === second.scrollY;
}
/** Outward rounding matters for redaction: no edge pixel may remain visible. */
export function pixelBounds(rect: Rect, width: number, height: number): Bounds {
  const x = Math.floor(rect.x * width);
  const y = Math.floor(rect.y * height);
  return { x, y, width: Math.ceil((rect.x + rect.width) * width) - x, height: Math.ceil((rect.y + rect.height) * height) - y };
}
export function annotationsAfterCrop(annotations: Rect[], crop: Rect): Rect[] {
  if (crop.width <= 0 || crop.height <= 0)
    return [];
  return annotations.flatMap((rect) => {
    const left = Math.max(rect.x, crop.x);
    const top = Math.max(rect.y, crop.y);
    const right = Math.min(rect.x + rect.width, crop.x + crop.width);
    const bottom = Math.min(rect.y + rect.height, crop.y + crop.height);
    if (right <= left || bottom <= top)
      return [];
    return [{ x: (left - crop.x) / crop.width, y: (top - crop.y) / crop.height, width: (right - left) / crop.width, height: (bottom - top) / crop.height }];
  });
}
