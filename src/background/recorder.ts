import { AppError, assert } from '../core/errors.js';
import { FrameBuffer, sameBounds } from '../core/frame-buffer.js';
import { normalizeBounds, sameViewport } from '../core/geometry.js';
import { CAPTURE_INTERVAL, MAX_STEPS } from '../core/model.js';
import type { CaptureSnapshot, FrameReceipt, PreparedFrame, RecordedAction, RecordingSession, Reply, Settings } from '../core/model.js';
import { createGuide, createStep } from '../core/operations.js';
import { actionTitle, safeOrigin } from '../core/text.js';
import { object, parseSnapshot, settingsOrDefaults } from '../core/validation.js';
import { hasWebsiteAccess, requireWebsiteAccess, WEBSITE_ACCESS_MESSAGE } from '../platform/access.js';
import { appendRecordedStep, createStoredGuide, getGuide } from '../platform/database.js';
import { dataUrlToBlob, editImage } from '../platform/images.js';
const SESSION_KEY = 'recordingSession';
const frames = new FrameBuffer();
const documents = new Map<string, ActionSource>();
const recordedEvents = new Set<string>();
let lastCaptureStartedAt = 0;
export interface ActionSource {
  guideId: string;
  tabId: number;
  origin: string;
  documentToken: string;
  browserDocumentId: string;
  connectedAt: number;
  retiredAt: number | null;
}
function rememberDocument(session: RecordingSession): void {
  const now = Date.now();
  for (const [token, document] of documents) {
    if (token !== session.documentToken && document.retiredAt === null)
      document.retiredAt = now;
    if (document.guideId !== session.guideId || (document.retiredAt !== null && now - document.retiredAt > 10000))
      documents.delete(token);
  }
  if (!documents.has(session.documentToken) || documents.get(session.documentToken)?.retiredAt !== null) {
    documents.set(session.documentToken, {
      guideId: session.guideId, tabId: session.tabId, origin: session.origin,
      documentToken: session.documentToken, browserDocumentId: session.browserDocumentId,
      connectedAt: now, retiredAt: null,
    });
  }
}
/** Delayed click messages may refer to the previous document, but not control it. */
export function sourceForAction(sender: chrome.runtime.MessageSender, action: RecordedAction): ActionSource | undefined {
  const source = documents.get(action.documentToken);
  const now = Date.now();
  if (!source || sender.id !== chrome.runtime.id || sender.tab?.id !== source.tabId || sender.frameId !== 0 ||
    safeOrigin(sender.url ?? '') !== source.origin || (source.browserDocumentId && sender.documentId !== source.browserDocumentId) ||
    action.observedAt > now + 100 || now - action.observedAt > 10000 || action.observedAt < source.connectedAt ||
    (source.retiredAt !== null && (action.observedAt > source.retiredAt || now - source.retiredAt > 10000))) {
    return undefined;
  }
  return { ...source };
}
export async function getSettings(): Promise<Settings> {
  const saved = await chrome.storage.local.get('settings');
  return settingsOrDefaults(saved.settings);
}
export async function readSession(): Promise<RecordingSession | null> {
  const saved = await chrome.storage.session.get(SESSION_KEY);
  if (!saved[SESSION_KEY])
    return null;
  const value = object(saved[SESSION_KEY]);
  if (typeof value.guideId !== 'string' || typeof value.tabId !== 'number' || typeof value.windowId !== 'number' ||
    typeof value.origin !== 'string' || typeof value.documentToken !== 'string' ||
    typeof value.stepCount !== 'number' || typeof value.lastCaptureAt !== 'number' || typeof value.reason !== 'string' ||
    (value.status !== 'recording' && value.status !== 'paused')) {
    await chrome.storage.session.remove(SESSION_KEY);
    return null;
  }
  const session: RecordingSession = {
    guideId: value.guideId, tabId: value.tabId, windowId: value.windowId, origin: value.origin, documentToken: value.documentToken,
    browserDocumentId: typeof value.browserDocumentId === 'string' ? value.browserDocumentId : '',
    stepCount: value.stepCount, lastCaptureAt: value.lastCaptureAt, reason: value.reason, status: value.status, settings: settingsOrDefaults(value.settings)
  };
  // MV3 may suspend the worker while a tab stays open. The current document
  // remains authenticated by session storage; only its image cache is volatile.
  if (session.documentToken && !documents.has(session.documentToken)) {
    documents.set(session.documentToken, { guideId: session.guideId, tabId: session.tabId, origin: session.origin, documentToken: session.documentToken, browserDocumentId: session.browserDocumentId, connectedAt: 0, retiredAt: null });
  }
  return session;
}
async function saveSession(session: RecordingSession | null): Promise<void> {
  if (session)
    await chrome.storage.session.set({ [SESSION_KEY]: session });
  else
    await chrome.storage.session.remove(SESSION_KEY);
  await chrome.action.setBadgeText({ text: session ? (session.status === 'paused' ? 'II' : 'REC') : '' });
  if (session)
    await chrome.action.setBadgeBackgroundColor({ color: session.status === 'recording' ? '#bd2451' : '#8c5e08' });
}
async function broadcast(session: RecordingSession): Promise<void> {
  try {
    await chrome.tabs.sendMessage(session.tabId, { type: 'CONFIGURE_RECORDER', session }, { frameId: 0 });
  }
  catch { /* Navigation may have removed the old document; onUpdated reconnects. */ }
}
async function connectRecorder(session: RecordingSession): Promise<void> {
  const injections = await chrome.scripting.executeScript({ target: { tabId: session.tabId, allFrames: false }, files: ['recorder/content.js'] });
  session.browserDocumentId = injections.find((result) => result.frameId === 0)?.documentId ?? '';
  const response = object(await chrome.tabs.sendMessage(session.tabId, { type: 'CONFIGURE_RECORDER', session }, { frameId: 0 }));
  assert(typeof response.documentToken === 'string' && response.documentToken !== '', 'Die Aufnahme konnte nicht mit der Seite verbunden werden.');
  assert(response.origin === session.origin, 'Die Seite hat sich beim Verbinden geändert.');
  session.documentToken = response.documentToken;
  rememberDocument(session);
  await saveSession(session);
}
function allowedTab(tab: chrome.tabs.Tab): boolean {
  return tab.id !== undefined && !tab.incognito && safeOrigin(tab.url ?? '') !== '' &&
    !/^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore|microsoftedge\.microsoft\.com\/addons)/.test(tab.url ?? '') &&
    (tab.splitViewId === undefined || tab.splitViewId === -1);
}
export async function startRecording(tabId: number, title: string): Promise<RecordingSession> {
  if (await readSession())
    throw new AppError('busy', 'Es läuft bereits eine Aufnahme. Beende sie zuerst.');
  await requireWebsiteAccess();
  const tab = await chrome.tabs.get(tabId);
  if (!allowedTab(tab) || !tab.active)
    throw new AppError('permission', 'Öffne eine normale Webseite im aktiven Tab. Browserseiten, Erweiterungs-Stores, Inkognito und geteilte Tabs werden nicht aufgenommen.');
  frames.clear();
  documents.clear();
  recordedEvents.clear();
  const settings = await getSettings();
  const guide = await createStoredGuide(createGuide(title.trim() || 'Neue Anleitung', settings.guideLanguage));
  const session: RecordingSession = { guideId: guide.id, tabId, windowId: tab.windowId, origin: safeOrigin(tab.url ?? ''), status: 'recording', reason: '', stepCount: 0, lastCaptureAt: 0, documentToken: '', browserDocumentId: '', settings };
  try {
    await connectRecorder(session);
  }
  catch {
    await saveSession(null);
    throw new AppError('permission', 'Die Seite konnte nicht mit KlickGuide verbunden werden. Prüfe den Websitezugriff in den Erweiterungsdetails, lade die Webseite neu und starte erneut. Browserrichtlinien können den Zugriff sperren. Die leere Anleitung bleibt in der Bibliothek erhalten.');
  }
  return session;
}
export async function pauseRecording(reason = 'Aufnahme pausiert.'): Promise<RecordingSession | null> {
  const session = await readSession();
  if (!session)
    return null;
  session.status = 'paused';
  session.reason = reason;
  frames.clear();
  await saveSession(session);
  await broadcast(session);
  return session;
}
export async function resumeRecording(): Promise<RecordingSession> {
  const session = await readSession();
  if (!session)
    throw new AppError('missing', 'Es gibt keine pausierte Aufnahme.');
  await requireWebsiteAccess();
  const tab = await chrome.tabs.get(session.tabId);
  if (!allowedTab(tab) || !tab.active)
    throw new AppError('permission', 'Öffne den ursprünglichen Aufnahmetab auf einer normalen Webseite und setze dort die Aufnahme fort.');
  const window = await chrome.windows.get(tab.windowId);
  if (!window.focused)
    throw new AppError('permission', 'Aktiviere zuerst das Fenster mit dem Aufnahmetab.');
  session.windowId = tab.windowId;
  session.origin = safeOrigin(tab.url ?? '');
  session.status = 'recording';
  session.reason = '';
  try {
    await connectRecorder(session);
  }
  catch {
    await pauseRecording('Die Verbindung zur Seite ist fehlgeschlagen. Lade den Aufnahmetab neu und prüfe den Websitezugriff in den Erweiterungsdetails.');
    throw new AppError('permission', 'Die Verbindung zur Seite ist fehlgeschlagen. Lade den Aufnahmetab neu und prüfe den Websitezugriff in den Erweiterungsdetails.');
  }
  return session;
}
export async function stopRecording(openEditor = true): Promise<string | null> {
  const session = await readSession();
  if (!session)
    return null;
  await saveSession(null);
  frames.clear();
  documents.clear();
  recordedEvents.clear();
  try {
    await chrome.tabs.sendMessage(session.tabId, { type: 'DISPOSE_RECORDER' }, { frameId: 0 });
  }
  catch { /* Tab may be closed. */ }
  if (openEditor)
    await chrome.tabs.create({ url: chrome.runtime.getURL(`app.html#guide/${session.guideId}`) });
  return session.guideId;
}
async function verifyTarget(session: RecordingSession): Promise<void> {
  await requireWebsiteAccess();
  const [tab, window] = await Promise.all([chrome.tabs.get(session.tabId), chrome.windows.get(session.windowId)]);
  if (!allowedTab(tab) || !tab.active || !window.focused || tab.status === 'loading' || tab.windowId !== session.windowId || safeOrigin(tab.url ?? '') !== session.origin) {
    throw new AppError('permission', 'Der Aufnahmetab ist nicht mehr aktiv oder die Domain wurde gewechselt.');
  }
}
function documentAddress(session: RecordingSession): {
  documentId: string;
} | {
  frameId: number;
} {
  return session.browserDocumentId ? { documentId: session.browserDocumentId } : { frameId: 0 };
}
async function snapshotFrom(session: RecordingSession, type: string, captureId: string): Promise<CaptureSnapshot> {
  const reply = await chrome.tabs.sendMessage<Reply<unknown>>(session.tabId, { type, captureId, documentToken: session.documentToken }, documentAddress(session));
  if (!reply.ok)
    throw new AppError('permission', reply.error);
  const snapshot = parseSnapshot(reply.value);
  assert(snapshot.documentToken === session.documentToken && snapshot.origin === session.origin, 'Die Seite hat sich während der Aufnahme geändert.');
  assert(snapshot.toolbarHidden, 'Die Aufnahmeleiste ist noch sichtbar. Das Bild wurde verworfen.');
  return snapshot;
}
function captureDelay(session: RecordingSession): number {
  return Math.max(0, Math.max(session.lastCaptureAt, lastCaptureStartedAt) + CAPTURE_INTERVAL - Date.now());
}
type CaptureResult = {
  ok: true;
  frame: PreparedFrame;
} | {
  ok: false;
  warning: string;
};
async function captureCurrentPage(session: RecordingSession): Promise<CaptureResult> {
  const captureId = crypto.randomUUID();
  try {
    await verifyTarget(session);
    const before = await snapshotFrom(session, 'PREPARE_CAPTURE', captureId);
    await verifyTarget(session);
    session.lastCaptureAt = lastCaptureStartedAt = Date.now();
    await saveSession(session);
    const dataUrl = await chrome.tabs.captureVisibleTab(session.windowId, { format: 'png' });
    const capturedAt = Date.now();
    const after = await snapshotFrom(session, 'CAPTURE_SNAPSHOT', captureId);
    await verifyTarget(session);
    assert(before.stateRevision === after.stateRevision && before.interactionRevision === after.interactionRevision && sameViewport(before.viewport, after.viewport), 'Der Seitenzustand hat sich während der Aufnahme geändert.');
    const redactions = session.settings.autoRedactSensitiveAreas ? [...before.protectedAreas, ...after.protectedAreas].flatMap((bounds) => {
      const rect = normalizeBounds(bounds, before.viewport);
      return rect ? [rect] : [];
    }) : [];
    const image = await editImage(dataUrlToBlob(dataUrl), { redactions });
    // CSS-driven moves can happen without a DOM mutation. Keep only targets whose
    // positions and visibility were stable across the actual screenshot call.
    const targets = before.targets.filter((target) => after.targets.some((other) => target.token === other.token && sameBounds(target.box, other.box)));
    return { ok: true, frame: { guideId: session.guideId, snapshot: { ...before, targets }, capturedAt, image } };
  }
  catch {
    return { ok: false, warning: 'Kein geprüftes Bild verfügbar: Die Seite, der Bildausschnitt oder die Sichtbarkeit hat sich während der Aufnahme geändert. Auch gesperrte Seiten oder eine fehlgeschlagene Datenschutzprüfung können die Ursache sein.' };
  }
  finally {
    try {
      await chrome.tabs.sendMessage(session.tabId, { type: 'RESTORE_RECORDER', captureId }, documentAddress(session));
    }
    catch { /* The old document may no longer exist. Its recovery timer is bounded. */ }
  }
}
/** Prepare the current state while the user is reading, not after their click. */
export async function cacheFrame(): Promise<FrameReceipt> {
  const session = await readSession();
  const unavailable: FrameReceipt = { ready: false, stateRevision: -1, capturedAt: 0, retryAfter: 0 };
  if (!session || session.status !== 'recording' || !session.documentToken)
    return unavailable;
  const delay = captureDelay(session);
  if (delay)
    return { ...unavailable, retryAfter: delay };
  const result = await captureCurrentPage(session);
  if (!result.ok)
    return unavailable;
  frames.add(result.frame);
  return { ready: true, stateRevision: result.frame.snapshot.stateRevision, capturedAt: result.frame.capturedAt, retryAfter: 0 };
}
export async function recordAction(action: RecordedAction | null, source?: ActionSource): Promise<RecordingSession> {
  const session = await readSession();
  if (!session || session.status !== 'recording')
    throw new AppError('busy', 'Die Aufnahme ist nicht aktiv.');
  if (!await hasWebsiteAccess()) {
    await pauseRecording(WEBSITE_ACCESS_MESSAGE);
    throw new AppError('permission', WEBSITE_ACCESS_MESSAGE);
  }
  if (action && action.documentToken !== session.documentToken &&
    !(source?.guideId === session.guideId && source.documentToken === action.documentToken)) {
    throw new AppError('permission', 'Der Schritt gehört zu einer älteren Seite und wurde nicht übernommen.');
  }
  if (action && recordedEvents.has(action.eventId))
    return session;
  const guide = await getGuide(session.guideId);
  if (guide.steps.length >= MAX_STEPS) {
    await pauseRecording('Die Grenze von 300 Schritten ist erreicht. Bitte die Aufnahme beenden.');
    throw new AppError('limit', 'Die Anleitung enthält bereits 300 Schritte.');
  }
  const effectiveAction = action ?? { kind: 'manual' as const, label: '' };
  const step = createStep(effectiveAction.kind, actionTitle(effectiveAction, session.settings.guideLanguage));
  let frame: PreparedFrame | undefined;
  if (action) {
    // Never call captureVisibleTab here: a button may already have navigated or
    // removed itself. The action keeps the pre-interaction document and viewport.
    frame = frames.find(session.guideId, action);
    if (!frame) {
      step.warning = 'Vor dieser Aktion war noch kein geprüftes Bild des passenden Seitenzustands bereit. Es wurde bewusst kein Bild der Folgeseite eingesetzt. Nimm den Schritt erneut auf, sobald „Bild bereit“ erscheint, oder ergänze ein passendes Bild.';
    }
    else if (action.box) {
      const mark = normalizeBounds(action.box, frame.snapshot.viewport);
      if (mark)
        step.annotations = [mark];
    }
  }
  else {
    const delay = captureDelay(session);
    if (delay)
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    const result = await captureCurrentPage(session);
    if (result.ok) {
      frame = result.frame;
      frames.add(frame);
    }
    else {
      step.warning = result.warning;
    }
  }
  step.origin = session.settings.keepOrigin ? (source?.origin ?? session.origin) : '';
  try {
    const updated = await appendRecordedStep(session.guideId, step, frame?.image);
    if (action)
      recordedEvents.add(action.eventId);
    session.stepCount = updated.steps.length;
    session.reason = step.warning ? 'Ein Schritt hat kein passendes Vorher-Bild. Prüfe ihn im Editor.' : '';
    await saveSession(session);
    await broadcast(session);
    return session;
  }
  catch (error) {
    await pauseRecording('Der Schritt konnte nicht gespeichert werden. Bitte Speicherplatz prüfen und die Aufnahme beenden.');
    throw error;
  }
}
export async function onTabUpdated(tabId: number, change: {
  status?: string;
  url?: string;
}): Promise<void> {
  const session = await readSession();
  if (!session || session.tabId !== tabId || (!change.status && change.url === undefined))
    return;
  if (!await hasWebsiteAccess()) {
    await pauseRecording(WEBSITE_ACCESS_MESSAGE);
    return;
  }
  // Events may wait behind a screenshot in the serial queue. Read the current
  // tab instead of reconnecting to an obsolete event's URL after a redirect.
  const tab = await chrome.tabs.get(tabId);
  const origin = safeOrigin(tab.url ?? '');
  const loading = tab.status === 'loading' || (tab.status === undefined && change.status === 'loading');
  if (loading) {
    // Invalidate the old document immediately. A queued action must never be
    // attributed to the next page, even on a same-origin reload.
    session.documentToken = '';
    if (origin)
      session.origin = origin;
    await saveSession(session);
    return;
  }
  if (!allowedTab(tab)) {
    session.documentToken = '';
    session.status = 'paused';
    session.reason = 'Diese Seite kann nicht aufgenommen werden. Öffne im Aufnahmetab eine normale Webseite und setze die Aufnahme dort fort.';
    await saveSession(session);
    await broadcast(session);
    return;
  }
  const needsConnection = change.status === 'complete' || origin !== session.origin || !session.documentToken;
  if (!needsConnection)
    return;
  if (session.status === 'recording') {
    const window = await chrome.windows.get(tab.windowId);
    if (!tab.active || !window.focused || tab.status === 'loading' || tab.windowId !== session.windowId) {
      session.status = 'paused';
      session.reason = 'Der Aufnahmetab ist nicht aktiv. Kehre dorthin zurück und setze die Aufnahme bewusst fort.';
    }
  }
  session.origin = origin;
  session.documentToken = '';
  await saveSession(session);
  try {
    // Host access follows normal HTTP(S) navigation within the selected tab.
    // An explicit pause remains a pause; navigation never starts a new session.
    await connectRecorder(session);
  }
  catch {
    const currentTab = await chrome.tabs.get(tabId);
    if (currentTab.status === 'loading' || safeOrigin(currentTab.url ?? '') !== origin)
      return; // A subsequent navigation event will connect the final document.
    await pauseRecording(await hasWebsiteAccess()
      ? 'Die Verbindung zur Seite ist fehlgeschlagen. Lade den Aufnahmetab neu und prüfe den Websitezugriff oder mögliche Browserrichtlinien.'
      : WEBSITE_ACCESS_MESSAGE);
  }
}
export async function clearSession(): Promise<void> {
  frames.clear();
  documents.clear();
  recordedEvents.clear();
  await saveSession(null);
}
