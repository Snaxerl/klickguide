export const APP_VERSION = '1.0.3';
export const BACKUP_VERSION = 1;
export const MAX_STEPS = 300;
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_IMPORT_BYTES = 80 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 20000000;
export const CAPTURE_INTERVAL = 650;
export type Language = 'de' | 'en';
export type StepKind = 'click' | 'input' | 'navigation' | 'manual' | 'note';
export type GuideStatus = 'draft' | 'ready';
/** Image-relative coordinates. All four values are in the range [0, 1]. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
/** CSS pixel coordinates, before a screenshot is scaled. */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Viewport {
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
}
export interface Step {
  id: string;
  kind: StepKind;
  title: string;
  body: string;
  origin: string;
  warning: string;
  createdAt: number;
  imageId: string | null;
  annotations: Rect[];
}
export interface Guide {
  id: string;
  title: string;
  description: string;
  author: string;
  tags: string[];
  status: GuideStatus;
  language: Language;
  accent: string;
  createdAt: number;
  updatedAt: number;
  revision: number;
  steps: Step[];
}
export interface StoredImage {
  id: string;
  guideId: string;
  blob: Blob;
  width: number;
  height: number;
}
export interface GuideBundle {
  guide: Guide;
  images: StoredImage[];
}
export interface Settings {
  guideLanguage: Language;
  autoRedactSensitiveAreas: boolean;
  maskMedia: boolean;
  maskSelectors: string[];
  keepOrigin: boolean;
}
export const DEFAULT_SETTINGS: Readonly<Settings> = {
  guideLanguage: 'de',
  autoRedactSensitiveAreas: false,
  maskMedia: false,
  maskSelectors: [],
  keepOrigin: false,
};
export interface RecordingSession {
  guideId: string;
  tabId: number;
  windowId: number;
  origin: string;
  status: 'recording' | 'paused';
  reason: string;
  stepCount: number;
  lastCaptureAt: number;
  documentToken: string;
  browserDocumentId: string;
  settings: Settings;
}
export interface RecordedAction {
  eventId: string;
  stateRevision: number;
  observedAt: number;
  kind: 'click' | 'input' | 'manual';
  label: string;
  documentToken: string;
  targetToken: string;
  box: Bounds | null;
  viewport: Viewport;
}
export interface CaptureSnapshot {
  interactionRevision: number;
  stateRevision: number;
  toolbarHidden: boolean;
  targets: {
    token: string;
    box: Bounds;
  }[];
  documentToken: string;
  origin: string;
  viewport: Viewport;
  protectedAreas: Bounds[];
}
export interface PackedImage {
  id: string;
  dataUrl: string;
}
export interface BackupEnvelope {
  format: 'klickguide';
  version: 1;
  guide: Guide;
  images: PackedImage[];
}
export type Reply<T> = {
  ok: true;
  value: T;
} | {
  ok: false;
  error: string;
};
/** A masked image held in memory, never a post-click substitute for a step. */
export interface PreparedFrame {
  guideId: string;
  snapshot: CaptureSnapshot;
  capturedAt: number;
  image: {
    blob: Blob;
    width: number;
    height: number;
  };
}
export interface FrameReceipt {
  ready: boolean;
  stateRevision: number;
  capturedAt: number;
  retryAfter: number;
}
