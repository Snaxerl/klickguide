import { AppError } from '../core/errors.js';
import { annotationsAfterCrop, pixelBounds, rectangleFromPoints } from '../core/geometry.js';
import type { Rect, StoredImage } from '../core/model.js';
import { editImage } from '../platform/images.js';
import type { Raster } from '../platform/images.js';
import { button, confirmDialog, element, field, iconButton, showError } from './dom.js';
import type { IconName } from './icons.js';
import { icon } from './icons.js';
type Tool = 'highlight' | 'redact' | 'crop';
type Edit = {
  kind: Tool;
  rect: Rect;
} | {
  kind: 'clear';
};
interface ImageEditorOptions {
  image: StoredImage | undefined;
  annotations: Rect[];
  accent: string;
  onApply: (raster: Raster, annotations: Rect[]) => Promise<void>;
  onUpload: () => void;
  onDirtyChange: () => void;
}
export class ImageEditor {
  readonly root = element('div', 'image-editor');
  private readonly canvas = element('canvas');
  private readonly controls = element('div', 'image-toolbar');
  private readonly hint = element('div', 'image-hint');
  private readonly applyButton: HTMLButtonElement;
  private readonly undoButton: HTMLButtonElement;
  private readonly cancelButton: HTMLButtonElement;
  private readonly toolButtons = new Map<Tool, HTMLButtonElement>();
  private readonly events = new AbortController();
  private bitmap: ImageBitmap | null = null;
  private tool: Tool = 'highlight';
  private edits: Edit[] = [];
  private draft: Rect | null = null;
  private startPoint: {
    x: number;
    y: number;
  } | null = null;
  private pointerId: number | null = null;
  private disposed = false;
  private applying = false;
  constructor(private readonly options: ImageEditorOptions) {
    this.applyButton = button('Anwenden', 'check', () => this.apply(), 'primary');
    this.undoButton = iconButton('Letzte nicht gespeicherte Bildänderung zurücknehmen', 'undo', () => { this.edits.pop(); this.update(); });
    this.cancelButton = button('Verwerfen', null, () => { this.edits = []; this.update(); }, 'ghost');
    for (const [tool, title] of [['highlight', 'Markieren'], ['redact', 'Schwärzen'], ['crop', 'Zuschneiden']] as const) {
      const control = button(title, tool as IconName, () => { this.tool = tool; this.update(); }, 'ghost');
      this.toolButtons.set(tool, control);
      this.controls.append(control);
    }
    const clear = button('Markierungen löschen', null, () => { this.edits.push({ kind: 'clear' }); this.update(); }, 'ghost');
    this.controls.append(clear, element('span', 'spacer'), this.undoButton, this.cancelButton, this.applyButton);
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', 'Screenshot bearbeiten. Ziehe mit der Maus einen Bereich auf oder verwende die Koordinatenfelder unter dem Bild.');
    const stage = element('div', 'image-stage');
    if (options.image) {
      stage.append(this.canvas);
      this.root.append(this.controls, stage, this.hint, this.coordinateControls());
      void this.load(options.image).catch(showError);
    }
    else {
      stage.append(element('div', 'image-empty', [icon('image', 35), element('p', '', ['Noch kein Bild für diesen Schritt.']), button('Screenshot hochladen', 'upload', options.onUpload)]));
      this.root.append(stage);
    }
    this.canvas.addEventListener('pointerdown', (event) => this.pointerDown(event), { signal: this.events.signal });
    this.canvas.addEventListener('pointermove', (event) => this.pointerMove(event), { signal: this.events.signal });
    this.canvas.addEventListener('pointerup', (event) => {
      try {
        this.pointerUp(event);
      }
      catch (error) {
        showError(error);
      }
    }, { signal: this.events.signal });
    this.canvas.addEventListener('pointercancel', () => { this.draft = null; this.startPoint = null; this.pointerId = null; this.draw(); }, { signal: this.events.signal });
    this.canvas.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.draft = null;
        this.startPoint = null;
        this.pointerId = null;
        this.draw();
      }
    }, { signal: this.events.signal });
    this.update();
  }
  setAccent(accent: string): void { this.options.accent = accent; this.draw(); }
  get hasChanges(): boolean { return this.edits.length > 0; }
  get isApplying(): boolean { return this.applying; }
  dispose(): void {
    this.disposed = true;
    this.events.abort();
    this.bitmap?.close();
    this.bitmap = null;
  }
  private async load(image: StoredImage): Promise<void> {
    const bitmap = await createImageBitmap(image.blob);
    if (this.disposed) {
      bitmap.close();
      return;
    }
    this.bitmap = bitmap;
    this.canvas.width = bitmap.width;
    this.canvas.height = bitmap.height;
    const metadata = element('div', 'image-meta', [element('span', '', [`${bitmap.width} × ${bitmap.height} px · PNG`]), element('span', '', ['Originale werden nach Bildänderungen nicht aufbewahrt.'])]);
    this.root.append(metadata);
    this.update();
  }
  private coordinateControls(): HTMLElement {
    const details = element('details', 'coordinate-controls');
    details.append(element('summary', '', ['Bereich per Tastatur festlegen']));
    const row = element('div', 'coordinate-row');
    const inputs = ['X (%)', 'Y (%)', 'Breite (%)', 'Höhe (%)'].map((label, index) => {
      const input = element('input', 'input');
      input.type = 'number';
      input.min = '0';
      input.max = '100';
      input.step = '0.1';
      input.value = index < 2 ? '10' : '25';
      row.append(field(label, input));
      return input;
    });
    row.append(button('Bereich hinzufügen', 'plus', () => {
      const values = inputs.map((input) => Number(input.value) / 100);
      const [x, y, width, height] = values;
      if (x === undefined || y === undefined || width === undefined || height === undefined || !values.every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1) {
        throw new AppError('invalid-data', 'Bitte einen gültigen Bereich innerhalb von 0 bis 100 Prozent angeben.');
      }
      this.addEdit({ x, y, width, height });
    }));
    details.append(row);
    return details;
  }
  private point(event: PointerEvent): {
    x: number;
    y: number;
  } {
    const bounds = this.canvas.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height };
  }
  private pointerDown(event: PointerEvent): void {
    if (event.button !== 0 || !this.bitmap || this.applying)
      return;
    event.preventDefault();
    this.canvas.focus();
    this.pointerId = event.pointerId;
    this.canvas.setPointerCapture(event.pointerId);
    this.startPoint = this.point(event);
    this.draft = null;
  }
  private pointerMove(event: PointerEvent): void {
    if (!this.startPoint || event.pointerId !== this.pointerId)
      return;
    const end = this.point(event);
    this.draft = rectangleFromPoints(this.startPoint.x, this.startPoint.y, end.x, end.y);
    this.draw();
  }
  private pointerUp(event: PointerEvent): void {
    if (!this.startPoint || event.pointerId !== this.pointerId)
      return;
    this.pointerMove(event);
    if (this.canvas.hasPointerCapture(event.pointerId))
      this.canvas.releasePointerCapture(event.pointerId);
    if (this.draft && this.draft.width * this.canvas.width >= 4 && this.draft.height * this.canvas.height >= 4)
      this.addEdit(this.draft);
    this.draft = null;
    this.startPoint = null;
    this.pointerId = null;
    this.draw();
  }
  private addEdit(rect: Rect): void {
    if (this.applying || !this.bitmap)
      return;
    if (this.edits.length >= 100)
      throw new AppError('limit', 'Bitte die bisherigen Bildänderungen zuerst anwenden.');
    if (this.tool === 'crop')
      this.edits = this.edits.filter((edit) => edit.kind !== 'crop');
    this.edits.push({ kind: this.tool, rect });
    this.update();
  }
  private currentAnnotations(): Rect[] {
    let marks = [...this.options.annotations];
    for (const edit of this.edits) {
      if (edit.kind === 'clear')
        marks = [];
      else if (edit.kind === 'highlight')
        marks.push(edit.rect);
    }
    return marks;
  }
  private draw(): void {
    const context = this.canvas.getContext('2d');
    if (!context || !this.bitmap || this.disposed)
      return;
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.drawImage(this.bitmap, 0, 0);
    const drawRect = (rect: Rect, kind: Tool): void => {
      const bounds = pixelBounds(rect, this.canvas.width, this.canvas.height);
      context.save();
      if (kind === 'redact') {
        context.fillStyle = '#111827';
        context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
      }
      else {
        context.strokeStyle = kind === 'crop' ? '#0d9775' : this.options.accent;
        context.lineWidth = Math.max(3, this.canvas.width / 400);
        if (kind === 'crop')
          context.setLineDash([12, 7]);
        context.strokeRect(bounds.x + 1, bounds.y + 1, Math.max(0, bounds.width - 2), Math.max(0, bounds.height - 2));
      }
      context.restore();
    };
    for (const edit of this.edits)
      if (edit.kind === 'redact')
        drawRect(edit.rect, 'redact');
    for (const mark of this.currentAnnotations())
      drawRect(mark, 'highlight');
    for (const edit of this.edits)
      if (edit.kind === 'crop')
        drawRect(edit.rect, 'crop');
    if (this.draft)
      drawRect(this.draft, this.tool);
  }
  private update(): void {
    for (const [tool, control] of this.toolButtons) {
      control.classList.toggle('active', tool === this.tool);
      control.setAttribute('aria-pressed', String(tool === this.tool));
    }
    this.applyButton.disabled = !this.hasChanges || this.applying;
    this.undoButton.disabled = !this.hasChanges || this.applying;
    this.cancelButton.disabled = !this.hasChanges || this.applying;
    this.hint.textContent = this.hasChanges ? `${this.edits.length} Bildänderung(en) noch nicht angewendet. Schwärzen und Zuschneiden ersetzen das gespeicherte Bild unwiderruflich.` : 'Ziehe einen Bereich auf. Markierungen bleiben bearbeitbar; Schwärzungen werden nach Bestätigung dauerhaft ins Bild geschrieben.';
    this.draw();
    this.options.onDirtyChange();
  }
  private async apply(): Promise<void> {
    if (!this.options.image || !this.bitmap || !this.hasChanges || this.applying)
      return;
    const redactions = this.edits.flatMap((edit) => edit.kind === 'redact' ? [edit.rect] : []);
    const cropEdit = this.edits.find((edit) => edit.kind === 'crop');
    const requestedCrop = cropEdit && cropEdit.kind === 'crop' ? cropEdit.rect : undefined;
    if ((redactions.length > 0 || requestedCrop) && !await confirmDialog('Gespeichertes Bild ersetzen?', 'Schwärzungen und Zuschnitt werden dauerhaft in die Bilddatei übernommen. Das bisherige Original wird in dieser Anleitung nicht behalten. Frühere Exporte und andere Kopien werden nicht verändert.', 'Dauerhaft anwenden', true))
      return;
    this.applying = true;
    this.update();
    try {
      const changes: import('../platform/images.js').ImageEdits = { redactions };
      if (requestedCrop)
        changes.crop = requestedCrop;
      const raster = await editImage(this.options.image.blob, changes);
      let annotations = this.currentAnnotations();
      if (annotations.length > 100)
        throw new AppError('limit', 'Höchstens 100 Markierungen sind erlaubt. Entferne einige Markierungen.');
      if (requestedCrop) {
        const crop = pixelBounds(requestedCrop, this.bitmap.width, this.bitmap.height);
        annotations = annotationsAfterCrop(annotations, { x: crop.x / this.bitmap.width, y: crop.y / this.bitmap.height, width: crop.width / this.bitmap.width, height: crop.height / this.bitmap.height });
      }
      await this.options.onApply(raster, annotations);
      this.edits = [];
    }
    finally {
      this.applying = false;
      if (!this.disposed)
        this.update();
    }
  }
}
