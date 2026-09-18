import { AppError, errorMessage } from '../core/errors.js';
import { SerialQueue } from '../core/queue.js';
import { object, parseAction, text } from '../core/validation.js';
import { safeOrigin } from '../core/text.js';
import { hasWebsiteAccess, WEBSITE_ACCESS_MESSAGE } from '../platform/access.js';
import { cacheFrame, clearSession, onTabUpdated, sourceForAction, pauseRecording, readSession, recordAction, resumeRecording, startRecording, stopRecording, } from './recorder.js';
const operations = new SerialQueue();
function trustedPage(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id || !sender.url)
    return false;
  const url = new URL(sender.url);
  return url.protocol === 'chrome-extension:' && url.host === chrome.runtime.id &&
    ['/popup.html', '/app.html', '/print.html'].includes(url.pathname);
}
async function trustedRecorder(sender: chrome.runtime.MessageSender, command: Record<string, unknown>): Promise<boolean> {
  const session = await readSession();
  return Boolean(session && session.documentToken && sender.id === chrome.runtime.id && sender.tab?.id === session.tabId && sender.frameId === 0 &&
    safeOrigin(sender.url ?? '') === session.origin && command.documentToken === session.documentToken &&
    (!session.browserDocumentId || sender.documentId === session.browserDocumentId));
}
async function handleMessage(value: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> {
  const command = object(value);
  const type = text(command.type, 40, 'Nachrichtentyp');
  const fromPage = trustedPage(sender);
  if (type === 'RECORD_ACTION' && !fromPage) {
    const action = parseAction(command.action);
    await readSession(); // Restore current-document authentication after worker suspension.
    const source = sourceForAction(sender, action);
    if (!source || command.documentToken !== action.documentToken || action.kind === 'manual')
      throw new AppError('permission', 'Dieser Schritt stammt nicht aus dem Aufnahmetab.');
    return recordAction(action, source);
  }
  const fromRecorder = !fromPage && await trustedRecorder(sender, command);
  if (!fromPage && !fromRecorder)
    throw new AppError('permission', 'Diese Nachricht stammt nicht aus einer freigegebenen Ansicht.');
  if (type === 'CACHE_FRAME' && fromRecorder)
    return cacheFrame();
  if (type === 'GET_STATE' && fromPage)
    return readSession();
  if (type === 'START' && fromPage) {
    if (typeof command.tabId !== 'number' || !Number.isInteger(command.tabId))
      throw new AppError('invalid-data', 'Ungültiger Tab.');
    return startRecording(command.tabId, text(command.title, 200, 'Titel'));
  }
  if (type === 'PAUSE')
    return pauseRecording();
  if (type === 'RESUME')
    return resumeRecording();
  if (type === 'STOP')
    return stopRecording();
  if (type === 'CAPTURE_MANUAL')
    return recordAction(null);
  throw new AppError('invalid-data', 'Unbekannte oder unzulässige Aktion.');
}
// Register listeners synchronously: MV3 workers can be started for any event.
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  void operations.enqueue(() => handleMessage(message, sender)).then((value) => respond({ ok: true, value }), (error: unknown) => {
    if (!(error instanceof AppError))
      console.error('KlickGuide operation failed', error);
    respond({ ok: false, error: errorMessage(error) });
  });
  return true;
});
function backgroundTask(task: () => Promise<unknown>): void {
  void operations.enqueue(task).catch((error: unknown) => console.error('KlickGuide background event failed', error));
}
chrome.tabs.onUpdated.addListener((tabId, change) => backgroundTask(() => onTabUpdated(tabId, change)));
chrome.permissions.onRemoved.addListener(() => backgroundTask(async () => {
  if (await readSession() && !await hasWebsiteAccess())
    await pauseRecording(WEBSITE_ACCESS_MESSAGE);
}));
chrome.tabs.onRemoved.addListener((tabId) => backgroundTask(async () => {
  const session = await readSession();
  if (session?.tabId === tabId)
    await stopRecording(false);
}));
chrome.tabs.onActivated.addListener((info) => backgroundTask(async () => {
  const session = await readSession();
  if (session?.status === 'recording' && session.windowId === info.windowId && session.tabId !== info.tabId) {
    await pauseRecording('Tab gewechselt. Kehre zum Aufnahmetab zurück und setze die Aufnahme bewusst fort.');
  }
}));
chrome.windows.onFocusChanged.addListener((windowId) => backgroundTask(async () => {
  const session = await readSession();
  if (session?.status === 'recording' && session.windowId !== windowId) {
    await pauseRecording('Fenster gewechselt. Aktiviere den Aufnahmetab und setze die Aufnahme fort.');
  }
}));
chrome.commands.onCommand.addListener((command, tab) => backgroundTask(async () => {
  const session = await readSession();
  if (!session || !tab || tab.id !== session.tabId)
    return;
  if (command === 'capture-step')
    await recordAction(null);
  else if (command === 'toggle-pause') {
    if (session.status === 'recording')
      await pauseRecording();
    else
      await resumeRecording();
  }
}));
chrome.runtime.onStartup.addListener(() => backgroundTask(clearSession));
chrome.runtime.onInstalled.addListener(() => backgroundTask(clearSession));
