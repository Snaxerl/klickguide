/** Installed only in the explicitly selected recording tab. No clicks are replayed. */
(() => {
  type Session = import('../core/model.js').RecordingSession;
  type Action = import('../core/model.js').RecordedAction;
  type Snapshot = import('../core/model.js').CaptureSnapshot;
  type Receipt = import('../core/model.js').FrameReceipt;
  type Reply<T> = import('../core/model.js').Reply<T>;
  type Bounds = import('../core/model.js').Bounds;
  type RecorderWindow = Window & {
    __klickGuideRecorder?: {
      version?: string;
      dispose: () => void;
    };
  };
  const version = '1.0.3';
  const recorderWindow = window as RecorderWindow;
  // Duplicate completion events must not replace a toolbar during a capture.
  if (recorderWindow.__klickGuideRecorder?.version === version)
    return;
  recorderWindow.__klickGuideRecorder?.dispose();
  function randomToken(): string {
    // getRandomValues also works on ordinary HTTP pages, unlike randomUUID.
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  const documentToken = randomToken();
  const listeners = new AbortController();
  const targetTokens = new WeakMap<Element, string>();
  const dirtyFields = new WeakSet<Element>();
  const fieldIntents = new WeakMap<Element, Action>();
  const captureLocks = new Map<string, number>();
  const controlSelector = 'button,a[href],input:not([type="hidden"]),textarea,select,[contenteditable="true"],[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="checkbox"],[role="radio"],summary';
  const privateSelector = '[data-private],[data-sensitive]';
  let session: Session | null = null;
  let disposed = false;
  let stateRevision = 0;
  let interactionRevision = 0;
  let readyExpiryTimer: number | undefined;
  let refreshTimer: number | undefined;
  let refreshPending = false;
  let refreshAgain = false;
  let refreshFailures = 0;
  let readyRevision = -1;
  let readyAt = 0;
  let pointerIntent: {
    element: Element;
    action: Action;
  } | null = null;
  let keyboardIntent: {
    element: Element;
    action: Action;
  } | null = null;
  const host = document.createElement('div');
  host.setAttribute('data-klickguide-recorder', '');
  host.style.cssText = 'all:initial!important;position:fixed!important;right:18px!important;top:18px!important;z-index:2147483647!important;display:block!important;visibility:visible!important;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = ':host{color-scheme:light}.wrap{background:#171b2b;border:1px solid #42485d;border-radius:12px;box-shadow:0 8px 32px #0003;color:#fff;font:12px/1.5 system-ui,sans-serif}.bar{display:flex;align-items:center;gap:8px;padding:8px 10px}.label{min-width:100px;font-weight:650;margin:0 6px}.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#fbbf24;margin-right:7px}.ready .dot{background:#4ade80}button{border:1px solid #565c71;color:#fff;background:#2b3043;padding:5px 9px;border-radius:6px;cursor:pointer;font:inherit}button:hover{background:#424861}button:focus-visible{outline:2px solid #a5b4fc;outline-offset:2px}button:disabled{opacity:.5;cursor:default}.message{max-width:400px;white-space:normal;color:#fcd38b;padding:0 12px 6px;font:11px/1.5 system-ui,sans-serif}.ready .message{color:#a7f3d0}';
  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  const bar = document.createElement('div');
  bar.className = 'bar';
  const label = document.createElement('span');
  label.className = 'label';
  const message = document.createElement('div');
  message.className = 'message';
  message.setAttribute('role', 'status');
  function control(title: string, handler: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = title;
    button.addEventListener('click', handler, { signal: listeners.signal });
    return button;
  }
  const captureButton = control('Screenshot', () => { void sendControl({ type: 'CAPTURE_MANUAL' }); });
  const pauseButton = control('Pause', () => { void sendControl({ type: session?.status === 'paused' ? 'RESUME' : 'PAUSE' }); });
  const stopButton = control('Fertig', () => { void sendControl({ type: 'STOP' }); });
  bar.append(label, captureButton, pauseButton, stopButton);
  wrap.append(bar, message);
  shadow.append(style, wrap);
  (document.body ?? document.documentElement).append(host);
  async function sendControl(command: Record<string, unknown>): Promise<void> {
    try {
      const reply = await chrome.runtime.sendMessage<Reply<unknown>>({ ...command, documentToken });
      if (!reply.ok)
        message.textContent = reply.error;
    }
    catch {
      message.textContent = 'Verbindung unterbrochen. Öffne KlickGuide über das Erweiterungssymbol.';
    }
  }
  function renderStatus(): void {
    const ready = session?.status === 'recording' && readyRevision === stateRevision && Date.now() - readyAt <= 30000;
    wrap.classList.toggle('ready', ready);
    host.setAttribute('data-capture-state', session?.status === 'paused' ? 'paused' : ready ? 'ready' : 'preparing');
    const dot = document.createElement('span');
    dot.className = 'dot';
    label.replaceChildren(dot, document.createTextNode(`KlickGuide · ${session?.stepCount ?? 0}`));
    pauseButton.textContent = session?.status === 'paused' ? 'Fortsetzen' : 'Pause';
    captureButton.disabled = session?.status !== 'recording';
    message.textContent = session?.status === 'paused' ? (session.reason || 'Aufnahme pausiert.') :
      ready ? 'Bild bereit · Nächsten Schritt ausführen' :
        refreshFailures >= 3 ? 'Seite verändert sich noch. Warte kurz oder nutze „Screenshot“.' : 'Bild wird vorbereitet …';
  }
  function viewport(): import('../core/model.js').Viewport {
    return { width: innerWidth, height: innerHeight, scrollX, scrollY };
  }
  function isOwnNode(node: Node): boolean {
    return node === host || host.contains(node) || node.getRootNode() === shadow;
  }
  function invalidate(): void {
    stateRevision += 1;
    refreshFailures = 0;
    renderStatus();
    scheduleRefresh();
  }
  function receiveMutations(records: MutationRecord[]): void {
    if (records.some((record) => !isOwnNode(record.target) &&
      (record.type !== 'childList' || [...record.addedNodes, ...record.removedNodes].some((node) => !isOwnNode(node))))) {
      invalidate();
    }
  }
  const observedRoots = new WeakSet<ShadowRoot>();
  const observer = new MutationObserver(receiveMutations);
  observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  function currentRevision(): number {
    receiveMutations(observer.takeRecords());
    return stateRevision;
  }
  function isPrivate(element: Element): boolean {
    let current: Element | null = element;
    while (current) {
      if (current.closest(privateSelector))
        return true;
      const root: Node = current.getRootNode();
      current = root instanceof ShadowRoot ? root.host : null;
    }
    return false;
  }
  function clean(value: string): string {
    const cleaned = value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleaned.length <= 90)
      return cleaned;
    const prefix = cleaned.slice(0, 89);
    const boundary = prefix.lastIndexOf(' ');
    return `${prefix.slice(0, boundary > 60 ? boundary : 89)}…`;
  }
  function labelText(element: Element): string {
    const pieces: string[] = [];
    function visit(node: Node): void {
      if (node instanceof Text) {
        pieces.push(node.textContent ?? '');
        return;
      }
      if (!(node instanceof Element) || node.matches('input,textarea,select,option,script,style,template,noscript,[hidden],[aria-hidden="true"],[contenteditable]:not([contenteditable="false"]),[role="textbox"],[data-private],[data-sensitive]'))
        return;
      const computed = getComputedStyle(node);
      if (computed.display === 'none' || computed.visibility === 'hidden')
        return;
      for (const child of node.childNodes)
        visit(child);
    }
    visit(element);
    // Joining text nodes with spaces avoids concatenated headings and breadcrumbs.
    return clean(pieces.join(' '));
  }
  function primaryLabel(element: Element): Element {
    if (element.matches('a[href],[role="link"]')) {
      const heading = Array.from(element.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')).find((item) => item.getClientRects().length && labelText(item));
      if (heading)
        return heading;
    }
    return element;
  }
  function describe(element: Element): string {
    if (isPrivate(element))
      return '';
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const root = element.getRootNode();
      const labels = labelledBy.split(/\s+/).map((id) => root instanceof Document || root instanceof ShadowRoot ? root.getElementById(id) : null);
      const combined = labels.filter((item): item is HTMLElement => Boolean(item) && !isPrivate(item as Element)).map(labelText).join(' ');
      if (combined.trim())
        return clean(combined);
    }
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel)
      return clean(ariaLabel);
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      // Never read values, placeholders, option text, or input.value attributes.
      return clean(Array.from(element.labels ?? []).filter((item) => !isPrivate(item)).map(labelText).join(' '));
    }
    if (element instanceof HTMLElement && element.isContentEditable)
      return '';
    const preferred = labelText(primaryLabel(element));
    if (preferred)
      return preferred;
    const image = element.querySelector('img[alt]');
    if (image && !isPrivate(image))
      return clean(image.getAttribute('alt') ?? '');
    return clean(element.getAttribute('title') ?? '');
  }
  function boundsOf(element: Element): Bounds {
    const box = primaryLabel(element).getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  }
  function tokenFor(element: Element): string {
    let token = targetTokens.get(element);
    if (!token) {
      token = randomToken();
      targetTokens.set(element, token);
    }
    return token;
  }
  function actionable(event: Event): Element | undefined {
    if (!session || session.status !== 'recording' || !event.isTrusted || event.composedPath().includes(host))
      return undefined;
    return event.composedPath().find((item): item is Element => item instanceof Element && item.matches(controlSelector));
  }
  function isTextField(element: Element): boolean {
    return element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement ||
      (element instanceof HTMLInputElement && !['button', 'submit', 'reset', 'checkbox', 'radio'].includes(element.type)) ||
      (element instanceof HTMLElement && element.isContentEditable);
  }
  function actionFor(element: Element, kind: 'click' | 'input'): Action {
    return {
      eventId: randomToken(), kind, label: describe(element), documentToken, targetToken: tokenFor(element),
      stateRevision: currentRevision(), observedAt: Date.now(), box: boundsOf(element), viewport: viewport()
    };
  }
  function emit(action: Action): void {
    void sendControl({ type: 'RECORD_ACTION', action });
  }
  document.addEventListener('pointerdown', (event) => {
    const element = actionable(event);
    pointerIntent = element && event.button === 0 ? { element, action: actionFor(element, 'click') } : null;
    // Capture the intent BEFORE focus changes, :active state or a pointer handler.
    if (pointerIntent) {
      interactionRevision += 1;
      scheduleRefresh();
    }
  }, { capture: true, signal: listeners.signal });
  document.addEventListener('pointercancel', () => { pointerIntent = null; }, { capture: true, signal: listeners.signal });
  document.addEventListener('keydown', (event) => {
    const element = actionable(event);
    keyboardIntent = element && ['Enter', ' '].includes(event.key) && !isTextField(element) ? { element, action: actionFor(element, 'click') } : null;
    if (keyboardIntent)
      interactionRevision += 1;
    scheduleRefresh();
  }, { capture: true, signal: listeners.signal });
  document.addEventListener('click', (event) => {
    const element = actionable(event);
    if (!element || isTextField(element))
      return;
    const intent = event.detail === 0 ? keyboardIntent : pointerIntent;
    const action = intent?.element === element && Date.now() - intent.action.observedAt < 1500 ? intent.action : actionFor(element, 'click');
    pointerIntent = null;
    keyboardIntent = null;
    emit(action);
    interactionRevision += 1;
    scheduleRefresh();
  }, { capture: true, signal: listeners.signal });
  document.addEventListener('focusin', (event) => {
    const element = actionable(event);
    if (element && isTextField(element)) {
      const beforeFocus = pointerIntent?.element === element ? pointerIntent.action : actionFor(element, 'input');
      fieldIntents.set(element, { ...beforeFocus, kind: 'input', eventId: randomToken() });
    }
    scheduleRefresh();
  }, { capture: true, signal: listeners.signal });
  document.addEventListener('input', (event) => {
    const element = actionable(event);
    if (element && isTextField(element)) {
      dirtyFields.add(element);
      invalidate();
    }
  }, { capture: true, signal: listeners.signal });
  function recordField(event: Event): void {
    const element = actionable(event);
    if (!element)
      return;
    if (!isTextField(element)) {
      invalidate(); // Native checkbox/select state may change without a DOM mutation.
      return;
    }
    if (event.type === 'focusout' && !dirtyFields.has(element))
      return;
    const fieldAction = fieldIntents.get(element) ?? actionFor(element, 'input');
    emit({ ...fieldAction, eventId: randomToken(), observedAt: Date.now() });
    fieldIntents.delete(element);
    dirtyFields.delete(element);
    invalidate();
  }
  document.addEventListener('change', recordField, { capture: true, signal: listeners.signal });
  document.addEventListener('focusout', (event) => {
    if (event.target instanceof HTMLElement && event.target.isContentEditable)
      recordField(event);
  }, { capture: true, signal: listeners.signal });
  document.addEventListener('pointerover', (event) => {
    if (actionable(event))
      scheduleRefresh();
  }, { capture: true, signal: listeners.signal });
  document.addEventListener('pointermove', (event) => {
    if (actionable(event) && Date.now() - readyAt > 20000)
      scheduleRefresh();
  }, { capture: true, passive: true, signal: listeners.signal });
  document.addEventListener('scroll', (event) => {
    if (!isOwnNode(event.target as Node))
      invalidate();
  }, { capture: true, passive: true, signal: listeners.signal });
  window.addEventListener('resize', invalidate, { signal: listeners.signal });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible')
      invalidate();
  }, { signal: listeners.signal });
  function visibleTarget(element: Element, box: Bounds): boolean {
    if (box.width <= 0 || box.height <= 0 || box.x >= innerWidth || box.y >= innerHeight || box.x + box.width <= 0 || box.y + box.height <= 0)
      return false;
    const computed = getComputedStyle(element);
    if (computed.visibility !== 'visible' || computed.display === 'none' || Number(computed.opacity) === 0)
      return false;
    const x = (Math.max(0, box.x) + Math.min(innerWidth, box.x + box.width)) / 2;
    const y = (Math.max(0, box.y) + Math.min(innerHeight, box.y + box.height)) / 2;
    const root = element.getRootNode();
    const hit = root instanceof Document || root instanceof ShadowRoot ? root.elementFromPoint(x, y) : null;
    return Boolean(hit && (hit === element || element.contains(hit)));
  }
  function snapshot(captureId: string): Snapshot {
    const protectedAreas: Bounds[] = [];
    const targets: Snapshot['targets'] = [];
    const selectors = session?.settings.autoRedactSensitiveAreas ? [
      'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"])',
      'textarea', 'select', '[contenteditable]:not([contenteditable="false"])', '[role="textbox"]',
      '[data-private]', '[data-sensitive]', 'iframe',
      ...(session.settings.maskMedia ? ['canvas', 'video'] : []), ...session.settings.maskSelectors,
    ] : [];
    let inspected = 0;
    function inspect(root: Document | ShadowRoot): void {
      if (root instanceof ShadowRoot && !observedRoots.has(root)) {
        observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
        observedRoots.add(root);
      }
      const fields = new Set<Element>();
      for (const selector of selectors)
        root.querySelectorAll(selector).forEach((element) => fields.add(element));
      for (const field of fields) {
        const box = field.getBoundingClientRect();
        if (box.width > 0 && box.height > 0 && box.right > 0 && box.bottom > 0 && box.left < innerWidth && box.top < innerHeight)
          protectedAreas.push({ x: box.x - 3, y: box.y - 3, width: box.width + 6, height: box.height + 6 });
      }
      for (const element of root.querySelectorAll(controlSelector)) {
        const box = boundsOf(element);
        if (visibleTarget(element, box))
          targets.push({ token: tokenFor(element), box });
      }
      if (protectedAreas.length > 2000 || targets.length > 2000)
        throw new Error('Page has too many visible controls or private regions');
      for (const element of root.querySelectorAll('*')) {
        inspected += 1;
        if (inspected > 100000)
          throw new Error('Page is too large for a reliable privacy scan');
        if (element.shadowRoot)
          inspect(element.shadowRoot);
      }
    }
    inspect(document);
    return {
      documentToken, origin: location.origin, interactionRevision, stateRevision: currentRevision(), viewport: viewport(), protectedAreas, targets,
      toolbarHidden: captureLocks.has(captureId) && getComputedStyle(host).visibility === 'hidden'
    };
  }
  function releaseCapture(captureId: string): void {
    window.clearTimeout(captureLocks.get(captureId));
    captureLocks.delete(captureId);
    // `all: initial !important` also resets visibility. An ordinary assignment
    // cannot override it; every visibility transition must preserve priority.
    if (!captureLocks.size)
      host.style.setProperty('visibility', 'visible', 'important');
  }
  async function prepare(captureId: string): Promise<Snapshot> {
    host.style.setProperty('visibility', 'hidden', 'important');
    window.clearTimeout(captureLocks.get(captureId));
    captureLocks.set(captureId, window.setTimeout(() => releaseCapture(captureId), 10000));
    let paintTimeout: number | undefined;
    try {
      await Promise.race([
        new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
        new Promise<never>((_resolve, reject) => { paintTimeout = window.setTimeout(() => reject(new Error('Page did not paint')), 1200); }),
      ]);
      if (document.visibilityState !== 'visible')
        throw new Error('Recording tab is not visible');
      return snapshot(captureId);
    }
    finally {
      window.clearTimeout(paintTimeout);
    }
  }
  function scheduleRefresh(delay = 120): void {
    if (disposed || session?.status !== 'recording' || document.visibilityState !== 'visible')
      return;
    if (refreshPending) {
      refreshAgain = true;
      return;
    }
    if (refreshTimer !== undefined)
      return;
    refreshTimer = window.setTimeout(() => { refreshTimer = undefined; void refreshFrame(); }, delay);
  }
  async function refreshFrame(): Promise<void> {
    if (disposed || session?.status !== 'recording' || document.visibilityState !== 'visible')
      return;
    refreshPending = true;
    refreshAgain = false;
    let retryAfter = 0;
    try {
      const reply = await chrome.runtime.sendMessage<Reply<Receipt>>({ type: 'CACHE_FRAME', documentToken });
      if (reply.ok) {
        const { value: receipt } = reply;
        if (receipt.ready) {
          readyRevision = receipt.stateRevision;
          readyAt = receipt.capturedAt;
          refreshFailures = 0;
          let focused = document.activeElement;
          while (focused?.shadowRoot?.activeElement)
            focused = focused.shadowRoot.activeElement;
          if (focused && isTextField(focused) && currentRevision() === receipt.stateRevision)
            fieldIntents.set(focused, actionFor(focused, 'input'));
          window.clearTimeout(readyExpiryTimer);
          readyExpiryTimer = window.setTimeout(() => {
            readyRevision = -1;
            renderStatus();
            scheduleRefresh();
          }, 25000);
        }
        else if (!receipt.retryAfter) {
          refreshFailures += 1;
        }
        retryAfter = receipt.retryAfter || 300;
      }
      else {
        refreshFailures += 1;
      }
    }
    catch {
      refreshFailures += 1;
    }
    finally {
      refreshPending = false;
      currentRevision();
      renderStatus();
      if (session?.status === 'recording' && refreshFailures < 3 && (refreshAgain || readyRevision !== stateRevision))
        scheduleRefresh(Math.max(120, retryAfter));
    }
  }
  const onMessage = (value: unknown, sender: chrome.runtime.MessageSender, respond: (response: unknown) => void): boolean | void => {
    if (sender.id !== chrome.runtime.id || typeof value !== 'object' || value === null)
      return;
    const command = value as {
      type?: string;
      session?: Session;
      captureId?: string;
      documentToken?: string;
    };
    if (command.type === 'CONFIGURE_RECORDER' && command.session) {
      const wasRecording = session?.status === 'recording';
      const changedGuide = session?.guideId !== command.session.guideId;
      session = command.session;
      if (changedGuide || !wasRecording) {
        readyRevision = -1;
        readyAt = 0;
      }
      if (session.status === 'recording')
        scheduleRefresh();
      else {
        window.clearTimeout(refreshTimer);
        window.clearTimeout(readyExpiryTimer);
        refreshTimer = undefined;
      }
      renderStatus();
      respond({ documentToken, origin: location.origin });
    }
    else if (command.type === 'PREPARE_CAPTURE' && command.captureId && command.documentToken === documentToken) {
      const captureId = command.captureId;
      void prepare(captureId).then((result) => respond({ ok: true, value: result }), () => {
        releaseCapture(captureId);
        respond({ ok: false, error: 'Die Seite konnte vor dem Bild nicht stabil geprüft werden.' });
      });
      return true;
    }
    else if (command.type === 'CAPTURE_SNAPSHOT' && command.captureId && command.documentToken === documentToken) {
      try {
        respond({ ok: true, value: snapshot(command.captureId) });
      }
      catch {
        respond({ ok: false, error: 'Die Seite konnte nicht zuverlässig geprüft werden.' });
      }
    }
    else if (command.type === 'RESTORE_RECORDER' && command.captureId) {
      releaseCapture(command.captureId);
      respond({ ok: true });
    }
    else if (command.type === 'DISPOSE_RECORDER') {
      dispose();
      respond({ ok: true });
    }
  };
  chrome.runtime.onMessage.addListener(onMessage);
  function dispose(): void {
    disposed = true;
    listeners.abort();
    observer.disconnect();
    window.clearTimeout(refreshTimer);
    window.clearTimeout(readyExpiryTimer);
    for (const timer of captureLocks.values())
      window.clearTimeout(timer);
    captureLocks.clear();
    chrome.runtime.onMessage.removeListener(onMessage);
    host.remove();
    delete recorderWindow.__klickGuideRecorder;
  }
  recorderWindow.__klickGuideRecorder = { version, dispose };
  renderStatus();
})();
