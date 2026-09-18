import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
// Contract tests for recording behavior. Chrome and IndexedDB are deliberately
// test doubles here; real browser integration lives in tests/browser/.
let guides;
let sessionStorage;
let localStorage;
let currentTab;
let flags;
let captures;
let redactions;
let createdTabs;
let injections;
let permissionRequests;
let clock = Date.now();
mock.method(Date, 'now', () => clock);
let messagesToPage;
const events = new Map();
const browserEvent = (name) => ({ addListener: (handler) => events.set(name, handler), removeListener: () => { } });
mock.module('../../dist/platform/database.js', {
  namedExports: {
    createStoredGuide: async (guide) => { guides.set(guide.id, structuredClone(guide)); return guide; },
    getGuide: async (id) => {
      const guide = guides.get(id);
      if (!guide)
        throw new Error('missing');
      return structuredClone(guide);
    },
    appendRecordedStep: async (id, step, image) => {
      if (flags.storageFailure)
        throw new DOMException('Quota reached', 'QuotaExceededError');
      const guide = guides.get(id);
      const next = { ...guide, revision: guide.revision + 1, steps: [...guide.steps, { ...step, imageId: image ? 'image-id' : null }] };
      guides.set(id, next);
      return structuredClone(next);
    },
  },
});
mock.module('../../dist/platform/images.js', {
  namedExports: {
    dataUrlToBlob: () => new Blob(['test raster'], { type: 'image/png' }),
    editImage: async (_blob, edits) => { redactions = edits.redactions; return { blob: new Blob(['masked raster'], { type: 'image/png' }), width: 1000, height: 800 }; },
  },
});
function area(store) {
  return {
    get: async (key) => structuredClone(key ? { [key]: store()[key] } : store()),
    set: async (value) => Object.assign(store(), structuredClone(value)),
    remove: async (key) => { delete store()[key]; },
  };
}
function snapshot(after) {
  return {
    documentToken: flags.wrongDocument ? 'other-document' : (flags.documentToken ?? 'document-1'), origin: new URL(currentTab.url).origin,
    viewport: { width: 1000, height: 800, scrollX: 0, scrollY: after && flags.scrolled ? 100 : 0 },
    protectedAreas: [{ x: after ? 110 : 100, y: 200, width: 200, height: 40 }],
    stateRevision: flags.stateRevision ?? (after && flags.mutatedDuringCapture ? 1 : 0),
    interactionRevision: after && flags.interactedDuringCapture ? 1 : 0,
    toolbarHidden: !flags.toolbarVisible,
    targets: [{ token: 'target-1', box: after && flags.movedTarget ? { x: 50, y: 20, width: 50, height: 30 } : { x: 20, y: 20, width: 50, height: 30 } }],
  };
}
globalThis.chrome = {
  runtime: { id: 'extension-id', getURL: (path) => `chrome-extension://extension-id/${path}`, onMessage: browserEvent('message'), onStartup: browserEvent('startup'), onInstalled: browserEvent('installed') },
  storage: { session: area(() => sessionStorage), local: area(() => localStorage) },
  permissions: {
    contains: async (permissions) => {
      assert.deepEqual(permissions, { origins: ['<all_urls>'] });
      return !flags.allSitesWithheld;
    },
    request: async (permissions) => {
      permissionRequests.push(permissions);
      if (flags.requestDenied)
        return false;
      flags.allSitesWithheld = false;
      return true;
    },
    onAdded: browserEvent('permission-added'),
    onRemoved: browserEvent('permission-removed'),
  },
  action: { setBadgeText: async () => { }, setBadgeBackgroundColor: async () => { } },
  scripting: {
    executeScript: async (options) => {
      injections.push(structuredClone(options));
      if (flags.noPermission)
        throw new Error('Denied');
      return [];
    }
  },
  windows: { get: async () => ({ id: 1, focused: !flags.unfocused }), onFocusChanged: browserEvent('focus') },
  commands: { onCommand: browserEvent('command') },
  tabs: {
    get: async () => structuredClone(currentTab),
    create: async (options) => { createdTabs.push(options); return {}; },
    captureVisibleTab: async () => {
      captures += 1;
      if (flags.captureFailure)
        throw new Error('Capture failed');
      if (flags.switchDuringCapture)
        currentTab.active = false;
      return 'data:image/png;base64,dGVzdA==';
    },
    sendMessage: async (_id, message, options) => {
      messagesToPage.push({ message, options });
      if (message.type === 'CONFIGURE_RECORDER')
        return { documentToken: flags.documentToken ?? 'document-1', origin: flags.handshakeOrigin ?? new URL(currentTab.url).origin };
      if (message.type === 'PREPARE_CAPTURE')
        return flags.privacyFailure ? { ok: false, error: 'Privacy scan failed' } : { ok: true, value: snapshot(false) };
      if (message.type === 'CAPTURE_SNAPSHOT')
        return { ok: true, value: snapshot(true) };
      return { ok: true };
    },
    onUpdated: browserEvent('updated'), onRemoved: browserEvent('removed'), onActivated: browserEvent('activated'),
  },
};
const access = await import('../../dist/platform/access.js');
const recorder = await import('../../dist/background/recorder.js');
await import('../../dist/background/worker.js');
const validAction = { eventId: 'event-one', stateRevision: 0, observedAt: 0, kind: 'click', label: 'Speichern', documentToken: 'document-1', targetToken: 'target-1', box: { x: 20, y: 20, width: 50, height: 30 }, viewport: { width: 1000, height: 800, scrollX: 0, scrollY: 0 } };
beforeEach(() => {
  clock += 60000;
  validAction.observedAt = clock + 2;
  messagesToPage = [];
  guides = new Map();
  sessionStorage = {};
  localStorage = {};
  flags = {};
  captures = 0;
  redactions = [];
  createdTabs = [];
  injections = [];
  permissionRequests = [];
  currentTab = { id: 10, windowId: 1, active: true, status: 'complete', url: 'https://example.org/workspace' };
});
test('starting a recording creates an independent local draft', async () => { const session = await recorder.startRecording(10, 'A workflow'); assert.equal(session.status, 'recording'); assert.equal(session.origin, 'https://example.org'); assert.equal(guides.get(session.guideId).title, 'A workflow'); });
test('starting a second recording is rejected', async () => { await recorder.startRecording(10, 'One'); await assert.rejects(recorder.startRecording(10, 'Two'), /bereits/); assert.equal(guides.size, 1); });
test('browser pages cannot be recorded', async () => { currentTab.url = 'chrome://settings'; await assert.rejects(recorder.startRecording(10, 'Blocked'), /normale Webseite/); });
test('incognito tabs cannot be recorded', async () => { currentTab.incognito = true; await assert.rejects(recorder.startRecording(10, 'Blocked')); });
test('split-view tabs cannot be recorded', async () => { currentTab.splitViewId = 3; await assert.rejects(recorder.startRecording(10, 'Blocked')); });
test('extension stores cannot be recorded', async () => { currentTab.url = 'https://chromewebstore.google.com/detail/test'; await assert.rejects(recorder.startRecording(10, 'Blocked')); });
test('failed permission leaves a draft but no active session', async () => { flags.noPermission = true; await assert.rejects(recorder.startRecording(10, 'Draft'), /Websitezugriff/); assert.equal(await recorder.readSession(), null); assert.equal(guides.size, 1); });
async function warm() { clock += 650; validAction.observedAt = clock + 2; return recorder.cacheFrame(); }
test('a click stores a screenshot and a caption without page input values', async () => { const session = await recorder.startRecording(10, 'Guide'); await warm(); await recorder.recordAction(validAction); const step = guides.get(session.guideId).steps[0]; assert.equal(step.title, 'Klicke auf „Speichern“'); assert.equal(step.imageId, 'image-id'); assert.equal(step.origin, ''); assert.equal(step.warning, ''); });
test('automatic redaction is disabled by default', async () => { await recorder.startRecording(10, 'Guide'); await warm(); await recorder.recordAction(validAction); assert.deepEqual(redactions, []); });
test('protected regions are rasterized only when automatic redaction is enabled', async () => { localStorage.settings = { guideLanguage: 'de', autoRedactSensitiveAreas: true, maskMedia: false, keepOrigin: false, maskSelectors: [] }; await recorder.startRecording(10, 'Guide'); await warm(); await recorder.recordAction(validAction); assert.equal(redactions.length, 2); assert.equal(redactions[0].x, .1); assert.equal(redactions[1].x, .11); });
test('a target that moved during capture is not misleadingly highlighted', async () => { flags.movedTarget = true; const session = await recorder.startRecording(10, 'Guide'); await warm(); await recorder.recordAction(validAction); assert.deepEqual(guides.get(session.guideId).steps[0].annotations, []); assert.equal(guides.get(session.guideId).steps[0].imageId, null); });
test('rapid clicks on the same verified state can share a frame without a new capture', async () => {
  const session = await recorder.startRecording(10, 'Guide');
  await warm();
  await recorder.recordAction(validAction);
  await recorder.recordAction({ ...validAction, eventId: 'event-two' });
  assert.equal(captures, 1);
  const steps = guides.get(session.guideId).steps;
  assert.equal(steps.length, 2);
  assert.equal(steps[1].warning, '');
  assert.equal(steps[1].imageId, 'image-id');
});
test('failed privacy scanning stores no screenshot', async () => { flags.privacyFailure = true; const session = await recorder.startRecording(10, 'Guide'); await warm(); await recorder.recordAction(validAction); assert.equal(captures, 0); assert.equal(guides.get(session.guideId).steps[0].imageId, null); });
test('navigation during capture cannot save a different document', async () => { flags.wrongDocument = true; const session = await recorder.startRecording(10, 'Guide'); await warm(); await recorder.recordAction(validAction); assert.equal(captures, 0); assert.equal(guides.get(session.guideId).steps[0].imageId, null); });
test('scrolling during capture discards the raster', async () => { flags.scrolled = true; const session = await recorder.startRecording(10, 'Guide'); await warm(); await recorder.recordAction(validAction); assert.equal(captures, 1); assert.equal(guides.get(session.guideId).steps[0].imageId, null); });
test('switching active tabs during capture discards the raster', async () => { flags.switchDuringCapture = true; const session = await recorder.startRecording(10, 'Guide'); await warm(); await recorder.recordAction(validAction); assert.equal(guides.get(session.guideId).steps[0].imageId, null); });
test('capture API failure is surfaced as a missing-image warning', async () => { flags.captureFailure = true; const session = await recorder.startRecording(10, 'Guide'); await warm(); await recorder.recordAction(validAction); assert.match(guides.get(session.guideId).steps[0].warning, /Vor dieser Aktion/); });
test('actions from older documents are rejected', async () => { await recorder.startRecording(10, 'Guide'); await assert.rejects(recorder.recordAction({ ...validAction, documentToken: 'old-document' }), /älteren Seite/); });
test('paused sessions do not accept recorded actions', async () => { await recorder.startRecording(10, 'Guide'); await recorder.pauseRecording(); await assert.rejects(recorder.recordAction(validAction), /nicht aktiv/); });
test('paused sessions can resume after an explicit command', async () => { await recorder.startRecording(10, 'Guide'); await recorder.pauseRecording(); const session = await recorder.resumeRecording(); assert.equal(session.status, 'recording'); });
test('domain changes continue the same recording without a new permission request', async () => {
  const started = await recorder.startRecording(10, 'Guide');
  currentTab.url = 'https://other.example/path';
  flags.documentToken = 'document-2';
  await recorder.onTabUpdated(10, { url: currentTab.url, status: 'complete' });
  const session = await recorder.readSession();
  assert.equal(session.status, 'recording');
  assert.equal(session.guideId, started.guideId);
  assert.equal(session.origin, 'https://other.example');
  assert.equal(session.documentToken, 'document-2');
  assert.equal(session.reason, '');
  assert.deepEqual(permissionRequests, []);
  await warm();
  await recorder.recordAction({ ...validAction, documentToken: 'document-2' });
  assert.equal(guides.get(started.guideId).steps[0].imageId, 'image-id');
});
test('storage failure pauses instead of silently losing a step', async () => { await recorder.startRecording(10, 'Guide'); flags.storageFailure = true; await assert.rejects(recorder.recordAction(validAction)); assert.equal((await recorder.readSession()).status, 'paused'); });
test('stopping clears the session and opens the saved guide', async () => { const session = await recorder.startRecording(10, 'Guide'); assert.equal(await recorder.stopRecording(), session.guideId); assert.equal(await recorder.readSession(), null); assert.equal(createdTabs.length, 1); assert.ok(createdTabs[0].url.includes(session.guideId)); });
test('closing a tab can stop without opening another tab', async () => { await recorder.startRecording(10, 'Guide'); await recorder.stopRecording(false); assert.equal(createdTabs.length, 0); });
test('startup clearing does not erase already stored drafts', async () => { await recorder.startRecording(10, 'Guide'); await recorder.clearSession(); assert.equal(guides.size, 1); assert.equal(await recorder.readSession(), null); });
function message(command, sender) { return new Promise((resolve) => events.get('message')(command, sender, resolve)); }
const pageSender = { id: 'extension-id', url: 'chrome-extension://extension-id/app.html' };
test('trusted extension views can query state', async () => { const result = await message({ type: 'GET_STATE' }, pageSender); assert.equal(result.ok, true); });
test('untrusted web pages cannot invoke recording controls', async () => { const result = await message({ type: 'START', tabId: 10, title: 'Attack' }, { id: 'extension-id', url: 'https://example.org/' }); assert.equal(result.ok, false); assert.equal(guides.size, 0); });
test('other extensions cannot invoke recording controls', async () => { const result = await message({ type: 'GET_STATE' }, { id: 'different-extension', url: 'chrome-extension://extension-id/app.html' }); assert.equal(result.ok, false); });
test('top-frame recorder messages require the document token', async () => { await recorder.startRecording(10, 'Guide'); const result = await message({ type: 'STOP', documentToken: 'wrong' }, { id: 'extension-id', url: currentTab.url, tab: currentTab, frameId: 0 }); assert.equal(result.ok, false); assert.ok(await recorder.readSession()); });
test('child frames cannot invoke recording controls', async () => { await recorder.startRecording(10, 'Guide'); const result = await message({ type: 'STOP', documentToken: 'document-1' }, { id: 'extension-id', url: currentTab.url, tab: currentTab, frameId: 2 }); assert.equal(result.ok, false); });
test('unknown commands fail without performing any operation', async () => { const result = await message({ type: 'DELETE_EVERYTHING' }, pageSender); assert.equal(result.ok, false); });
test('missing all-sites access prevents starting before any draft is created', async () => {
  flags.allSitesWithheld = true;
  await assert.rejects(recorder.startRecording(10, 'Guide'), /Auf allen Websites/);
  assert.equal(guides.size, 0);
  assert.equal(injections.length, 0);
  assert.equal(await recorder.readSession(), null);
  assert.deepEqual(permissionRequests, []);
});
test('permission requests are explicit and do not start a recording', async () => {
  flags.allSitesWithheld = true;
  await access.requestWebsiteAccess();
  assert.deepEqual(permissionRequests, [{ origins: ['<all_urls>'] }]);
  assert.equal(await access.hasWebsiteAccess(), true);
  assert.equal(await recorder.readSession(), null);
  assert.equal(guides.size, 0);
});
test('declining access does not create a guide or a session', async () => {
  flags.allSitesWithheld = true;
  flags.requestDenied = true;
  await assert.rejects(access.requestWebsiteAccess(), /nicht erteilt/);
  assert.equal(await access.hasWebsiteAccess(), false);
  assert.equal(await recorder.readSession(), null);
  assert.equal(guides.size, 0);
});
test('missing access cannot be worked around by resuming from a toolbar', async () => {
  await recorder.startRecording(10, 'Guide');
  await recorder.pauseRecording();
  flags.allSitesWithheld = true;
  await assert.rejects(recorder.resumeRecording(), /Auf allen Websites/);
  assert.equal((await recorder.readSession()).status, 'paused');
  assert.equal(injections.length, 1);
});
test('revoking access blocks the next capture and pauses before creating a step', async () => {
  const started = await recorder.startRecording(10, 'Guide');
  flags.allSitesWithheld = true;
  await assert.rejects(recorder.recordAction(validAction), /Auf allen Websites/);
  assert.equal((await recorder.readSession()).status, 'paused');
  assert.equal(guides.get(started.guideId).steps.length, 0);
  assert.equal(captures, 0);
});
test('permission removal events pause the real worker state', async () => {
  await recorder.startRecording(10, 'Guide');
  flags.allSitesWithheld = true;
  events.get('permission-removed')({ origins: ['<all_urls>'] });
  // GET_STATE goes through the same serial queue and therefore observes the event.
  const state = await message({ type: 'GET_STATE' }, pageSender);
  assert.equal(state.value.status, 'paused');
  assert.match(state.value.reason, /Auf allen Websites/);
});
test('unrelated permission events do not interrupt all-sites recording', async () => {
  await recorder.startRecording(10, 'Guide');
  events.get('permission-removed')({ origins: ['https://unused.example/*'] });
  assert.equal((await message({ type: 'GET_STATE' }, pageSender)).value.status, 'recording');
});
test('restoring access does not automatically resume a paused session', async () => {
  await recorder.startRecording(10, 'Guide');
  flags.allSitesWithheld = true;
  await assert.rejects(recorder.recordAction(validAction));
  await access.requestWebsiteAccess();
  assert.equal((await recorder.readSession()).status, 'paused');
  assert.equal((await recorder.resumeRecording()).status, 'recording');
});
test('navigation without a running session never injects the recorder', async () => {
  await recorder.onTabUpdated(10, { status: 'complete', url: currentTab.url });
  assert.equal(injections.length, 0);
  assert.equal(await recorder.readSession(), null);
});
test('unrelated tabs and non-navigation updates do not reconnect a session', async () => {
  const before = await recorder.startRecording(10, 'Guide');
  await recorder.onTabUpdated(11, { status: 'complete', url: 'https://other.example' });
  await recorder.onTabUpdated(10, {});
  assert.equal(injections.length, 1);
  assert.deepEqual(await recorder.readSession(), before);
});
test('a loading document invalidates old tokens without requiring new consent', async () => {
  await recorder.startRecording(10, 'Guide');
  currentTab.status = 'loading';
  currentTab.url = 'https://other.example/next';
  await recorder.onTabUpdated(10, { status: 'loading', url: currentTab.url });
  const session = await recorder.readSession();
  assert.equal(session.status, 'recording');
  assert.equal(session.documentToken, '');
  assert.equal(injections.length, 1);
  await assert.rejects(recorder.recordAction(validAction), /älteren Seite/);
});
test('same-origin reloads invalidate the old document and then reconnect', async () => {
  await recorder.startRecording(10, 'Guide');
  currentTab.status = 'loading';
  await recorder.onTabUpdated(10, { status: 'loading' });
  assert.equal((await recorder.readSession()).documentToken, '');
  currentTab.status = 'complete';
  flags.documentToken = 'reloaded-document';
  await recorder.onTabUpdated(10, { status: 'complete' });
  assert.equal((await recorder.readSession()).documentToken, 'reloaded-document');
  assert.equal((await recorder.readSession()).status, 'recording');
});
test('same-document URL updates do not replace the recorder token', async () => {
  await recorder.startRecording(10, 'Guide');
  currentTab.url = 'https://example.org/workspace#details';
  await recorder.onTabUpdated(10, { url: currentTab.url });
  assert.equal(injections.length, 1);
  assert.equal((await recorder.readSession()).documentToken, 'document-1');
});
test('redirects connect the current final URL, not a queued event URL', async () => {
  await recorder.startRecording(10, 'Guide');
  currentTab.status = 'loading';
  currentTab.url = 'https://login.example/redirect';
  await recorder.onTabUpdated(10, { status: 'loading', url: currentTab.url });
  currentTab.status = 'complete';
  currentTab.url = 'https://app.example/home';
  flags.documentToken = 'final-document';
  await recorder.onTabUpdated(10, { status: 'complete', url: 'https://login.example/redirect' });
  const session = await recorder.readSession();
  assert.equal(session.origin, 'https://app.example');
  assert.equal(session.status, 'recording');
  assert.equal(session.documentToken, 'final-document');
  assert.equal(injections.length, 2);
});
test('a queued completion event cannot inject into a newer loading page', async () => {
  await recorder.startRecording(10, 'Guide');
  currentTab.status = 'loading';
  currentTab.url = 'https://other.example/next';
  await recorder.onTabUpdated(10, { status: 'complete', url: 'https://example.org/workspace' });
  assert.equal(injections.length, 1);
  assert.equal((await recorder.readSession()).documentToken, '');
});
test('manual pauses remain paused across domain changes', async () => {
  await recorder.startRecording(10, 'Guide');
  await recorder.pauseRecording('Bewusste Pause.');
  currentTab.url = 'https://other.example/next';
  flags.documentToken = 'next-document';
  await recorder.onTabUpdated(10, { status: 'complete', url: currentTab.url });
  const session = await recorder.readSession();
  assert.equal(session.status, 'paused');
  assert.equal(session.reason, 'Bewusste Pause.');
  assert.equal(session.origin, 'https://other.example');
});
test('blocked pages do not get an injected recorder even with all-sites access', async () => {
  await recorder.startRecording(10, 'Guide');
  currentTab.url = 'chrome://settings';
  await recorder.onTabUpdated(10, { status: 'complete', url: currentTab.url });
  assert.equal(injections.length, 1);
  const session = await recorder.readSession();
  assert.equal(session.status, 'paused');
  assert.equal(session.documentToken, '');
  assert.match(session.reason, /nicht aufgenommen/);
});
test('background navigation cannot resume or continue recording an inactive tab', async () => {
  await recorder.startRecording(10, 'Guide');
  currentTab.active = false;
  currentTab.url = 'https://other.example/next';
  await recorder.onTabUpdated(10, { status: 'complete', url: currentTab.url });
  assert.equal((await recorder.readSession()).status, 'paused');
  assert.equal(captures, 0);
});
test('navigation in an unfocused window is paused before connecting', async () => {
  await recorder.startRecording(10, 'Guide');
  flags.unfocused = true;
  await recorder.onTabUpdated(10, { status: 'complete' });
  assert.equal((await recorder.readSession()).status, 'paused');
});
test('navigation with withheld access shows the persistent access instruction', async () => {
  await recorder.startRecording(10, 'Guide');
  flags.allSitesWithheld = true;
  currentTab.url = 'https://other.example/next';
  await recorder.onTabUpdated(10, { status: 'complete', url: currentTab.url });
  const session = await recorder.readSession();
  assert.equal(session.status, 'paused');
  assert.match(session.reason, /Auf allen Websites/);
  assert.equal(injections.length, 1);
});
test('a failed reconnect does not misleadingly claim a domain needs fresh consent', async () => {
  await recorder.startRecording(10, 'Guide');
  flags.noPermission = true;
  currentTab.url = 'https://other.example/next';
  await recorder.onTabUpdated(10, { status: 'complete', url: currentTab.url });
  const session = await recorder.readSession();
  assert.equal(session.status, 'paused');
  assert.match(session.reason, /Verbindung/);
  assert.doesNotMatch(session.reason, /erneut.*freigeben|neue Freigabe/);
});
test('the connection handshake cannot bind a token from a different origin', async () => {
  flags.handshakeOrigin = 'https://unexpected.example';
  await assert.rejects(recorder.startRecording(10, 'Guide'), /verbunden/);
  assert.equal(await recorder.readSession(), null);
});
test('new-origin recorder messages are authorized after reconnecting', async () => {
  await recorder.startRecording(10, 'Guide');
  currentTab.url = 'https://other.example/next';
  flags.documentToken = 'next-document';
  await recorder.onTabUpdated(10, { status: 'complete', url: currentTab.url });
  const reply = await message({ type: 'PAUSE', documentToken: 'next-document' }, { id: 'extension-id', url: currentTab.url, tab: currentTab, frameId: 0 });
  assert.equal(reply.ok, true);
  assert.equal(reply.value.status, 'paused');
});
test('previous-origin recorder messages are rejected after reconnecting', async () => {
  await recorder.startRecording(10, 'Guide');
  const previousTab = structuredClone(currentTab);
  currentTab.url = 'https://other.example/next';
  flags.documentToken = 'next-document';
  await recorder.onTabUpdated(10, { status: 'complete', url: currentTab.url });
  const reply = await message({ type: 'STOP', documentToken: 'document-1' }, { id: 'extension-id', url: previousTab.url, tab: previousTab, frameId: 0 });
  assert.equal(reply.ok, false);
  assert.equal((await recorder.readSession()).status, 'recording');
});
test('navigation tokens cannot be forged as an empty document token', async () => {
  await recorder.startRecording(10, 'Guide');
  currentTab.status = 'loading';
  await recorder.onTabUpdated(10, { status: 'loading' });
  const reply = await message({ type: 'STOP', documentToken: '' }, { id: 'extension-id', url: currentTab.url, tab: currentTab, frameId: 0 });
  assert.equal(reply.ok, false);
  assert.ok(await recorder.readSession());
});
test('an automatic click never captures the page after the action', async () => {
  const session = await recorder.startRecording(10, 'Guide');
  await recorder.recordAction(validAction);
  assert.equal(captures, 0);
  assert.equal(guides.get(session.guideId).steps[0].imageId, null);
  assert.match(guides.get(session.guideId).steps[0].warning, /Folgeseite/);
});
test('a new DOM revision cannot reuse a previous frame', async () => {
  const session = await recorder.startRecording(10, 'Guide');
  await warm();
  await recorder.recordAction({ ...validAction, stateRevision: 1 });
  assert.equal(captures, 1);
  assert.equal(guides.get(session.guideId).steps[0].imageId, null);
});
test('duplicate deliveries do not append the same action twice', async () => {
  const session = await recorder.startRecording(10, 'Guide');
  await warm();
  await recorder.recordAction(validAction);
  await recorder.recordAction(validAction);
  assert.equal(guides.get(session.guideId).steps.length, 1);
});
test('capture requests inside the rate interval get a retry time, not an empty step', async () => {
  const session = await recorder.startRecording(10, 'Guide');
  assert.equal((await warm()).ready, true);
  const retry = await recorder.cacheFrame();
  assert.equal(retry.ready, false);
  assert.ok(retry.retryAfter > 0);
  assert.equal(captures, 1);
  assert.equal(guides.get(session.guideId).steps.length, 0);
});
test('manual screenshots wait for their turn instead of dropping the image', async () => {
  const session = await recorder.startRecording(10, 'Guide');
  await warm();
  await recorder.recordAction(null);
  assert.equal(captures, 2);
  assert.equal(guides.get(session.guideId).steps[0].imageId, 'image-id');
});
for (const [name, flag] of [['visible toolbar', 'toolbarVisible'], ['DOM mutation', 'mutatedDuringCapture'], ['user input during raster capture', 'interactedDuringCapture']]) {
  test(`${name} makes pre-capture fail closed`, async () => {
    await recorder.startRecording(10, 'Guide');
    flags[flag] = true;
    assert.equal((await warm()).ready, false);
    assert.ok(messagesToPage.some(item => item.message.type === 'RESTORE_RECORDER'));
  });
}
test('prepare and restore share a unique capture lease', async () => {
  await recorder.startRecording(10, 'Guide');
  await warm();
  const prepare = messagesToPage.find(item => item.message.type === 'PREPARE_CAPTURE');
  const restore = messagesToPage.find(item => item.message.type === 'RESTORE_RECORDER');
  assert.ok(prepare.message.captureId);
  assert.equal(prepare.message.captureId, restore.message.captureId);
  assert.equal(prepare.message.documentToken, 'document-1');
});
test('pending old-document click can retain its already captured source image after navigation', async () => {
  const started = await recorder.startRecording(10, 'Guide');
  await warm();
  const previousAction = { ...validAction };
  const previousTab = structuredClone(currentTab);
  clock += 10;
  currentTab.url = 'https://other.example/new';
  flags.documentToken = 'document-2';
  await recorder.onTabUpdated(10, { status: 'complete', url: currentTab.url });
  const reply = await message({ type: 'RECORD_ACTION', documentToken: 'document-1', action: previousAction }, { id: 'extension-id', url: previousTab.url, tab: previousTab, frameId: 0 });
  assert.equal(reply.ok, true);
  assert.equal(captures, 1);
  assert.equal(guides.get(started.guideId).steps[0].imageId, 'image-id');
  assert.equal((await recorder.readSession()).origin, 'https://other.example');
});
test('a forged action timestamp cannot revive a retired document', async () => {
  await recorder.startRecording(10, 'Guide');
  const previousTab = structuredClone(currentTab);
  clock += 20;
  currentTab.url = 'https://other.example/new';
  flags.documentToken = 'document-2';
  await recorder.onTabUpdated(10, { status: 'complete', url: currentTab.url });
  clock += 10;
  const reply = await message({ type: 'RECORD_ACTION', documentToken: 'document-1', action: { ...validAction, observedAt: clock } }, { id: 'extension-id', url: previousTab.url, tab: previousTab, frameId: 0 });
  assert.equal(reply.ok, false);
});
test('a browser-restored document is reauthenticated on history return', async () => {
  await recorder.startRecording(10, 'Guide');
  clock += 10;
  currentTab.url = 'https://other.example/new';
  flags.documentToken = 'document-2';
  await recorder.onTabUpdated(10, { status: 'complete', url: currentTab.url });
  clock += 10;
  currentTab.url = 'https://example.org/workspace';
  flags.documentToken = 'document-1';
  await recorder.onTabUpdated(10, { status: 'complete', url: currentTab.url });
  const result = await message({ type: 'RECORD_ACTION', documentToken: 'document-1', action: { ...validAction, observedAt: clock } }, { id: 'extension-id', url: currentTab.url, tab: currentTab, frameId: 0 });
  assert.equal(result.ok, true);
});
test('stopping removes previous-document authority as well as buffered frames', async () => {
  await recorder.startRecording(10, 'Guide');
  await warm();
  await recorder.stopRecording(false);
  assert.equal(recorder.sourceForAction({ id: 'extension-id', url: currentTab.url, tab: currentTab, frameId: 0 }, validAction), undefined);
});
test('a different browser document cannot impersonate a recording document', async () => {
  const started = await recorder.startRecording(10, 'Guide');
  sessionStorage.recordingSession.browserDocumentId = 'browser-source';
  await recorder.clearSession();
  sessionStorage.recordingSession = { ...started, browserDocumentId: 'browser-source' };
  const result = await message({ type: 'RECORD_ACTION', documentToken: 'document-1', action: { ...validAction, observedAt: clock } }, { id: 'extension-id', url: currentTab.url, tab: currentTab, frameId: 0, documentId: 'browser-other' });
  assert.equal(result.ok, false);
});
test('current document authorization survives a worker-local cache reset', async () => {
  const saved = await recorder.startRecording(10, 'Guide');
  await recorder.clearSession();
  sessionStorage.recordingSession = structuredClone(saved); // persisted session after worker restart
  const result = await message({ type: 'RECORD_ACTION', documentToken: 'document-1', action: { ...validAction, observedAt: clock } }, { id: 'extension-id', url: currentTab.url, tab: currentTab, frameId: 0 });
  assert.equal(result.ok, true);
  assert.equal(guides.get(saved.guideId).steps.length, 1);
});
