# Architecture

## Scope and design decisions

KlickGuide is a Manifest V3 extension with a deliberately small dependency surface. Native browser APIs provide DOM rendering, IndexedDB, image rasterization, dialogs and downloads. TypeScript is the only npm development dependency. Python/Playwright is a separate integration-test toolchain, not part of the extension.

There is no backend, external identity, LLM, analytics client, remote font or runtime CDN. Captions are deterministic. UI text uses German; generated document captions and export labels can use German or English.

The narrow hand-written Chrome declaration file documents the APIs actually called. It is not a substitute for the complete official API definition; changes to browser capabilities need documentation and integration tests.

## Dependency direction

```text
UI ───────────────> platform/database + platform/files
 │                                │
 └─ runtime messages ─> worker ─> recorder ─> platform/images
                           │                     │
                     session storage          core models
                           │
                injected content script
```

`core` has no DOM or browser-extension dependency. Pure functions implement domain operations, geometry, input validation, captions, escaping and document/ZIP generation. `platform` owns browser APIs and all persistent side effects. The recorder collects limited semantic information; the worker owns the recording lifecycle and authorization. The UI uses text nodes, not HTML interpolation, for user-authored content.

## Recording lifecycle

A user opens the extension action on the target tab. `START` checks persistent website permission, creates a draft and injects the classic, self-contained content script into the main frame. No content script is registered to run on every visited website.

A session stores the guide ID, target tab/window, origin, status, capture timestamp and random document token in `chrome.storage.session`. The storage outlives ordinary service-worker idle termination but is not intended to continue a recording after a browser restart. An independent IndexedDB draft already contains committed steps.

All worker commands and tab/window events enter a `SerialQueue`. A failed operation does not poison the queue. The worker registers event listeners synchronously at module initialization. Pausing and stopping do not depend on a long-lived worker timer.

Each injected document creates a new document token. Recorded actions must match the active tab, main frame, authorized origin and browser/document identity. Current-session controls require the current document. A previously authorized document may submit a delayed action for up to ten seconds only when its timestamp predates retirement and belongs to the same guide; this never authorizes control commands. Unknown, expired or forged origins/documents are rejected. Duplicate event IDs are ignored within the active worker. Only known extension pages can start a session or query unrestricted extension state. There is no `externally_connectable` surface.

Switching tabs or windows pauses recording. Normal HTTP(S) navigation, including cross-origin navigation, reconnects the same selected tab using the declared `<all_urls>` host permission. This does not start a session in any other tab or override a manual pause. Store pages, browser URLs, local file URLs, incognito and recognized split-view tabs are refused.

Navigation processing reads the current tab rather than trusting a queued event's URL. Loading clears the active session token; a new connection retires the previous document and connects the current document and checks the returned origin before saving its token. Inactive or unfocused target tabs are paused before reconnection. A navigation that overtakes injection is left for the next tab event rather than being incorrectly classified as a permanent permission failure.

`platform/access` checks the actual all-sites grant. The popup requests withheld access only inside an explicit button handler, preserving Chrome's user gesture. Missing access blocks starting/resuming; revocation pauses an existing session. The broad match is necessary for persistent `captureVisibleTab` access, not a justification for injecting content scripts into every visited page. `activeTab` remains available for toolbar-invoked tab metadata when persistent permission is withheld; it is not treated as a substitute for all-sites recording permission.

## Capture timing and evidence

Automatic actions and manual screenshots have different semantics. An automatic click describes the control **before** it was activated. A manual screenshot captures the current state on request. The recorder does not prevent, replay or replace real clicks and does not use a debugger or video stream.

The content script keeps a weak mapping of elements to random tokens. It captures intent at trusted pointer-down or keyboard activation, then submits the step only after a trusted click. Focus/change tracking describes fields without reading values or placeholders. Rich links prefer a visible heading. Caption extraction ignores hidden/private/form contents and joins text nodes with whitespace. Captions are capped at 90 characters before the instruction prefix.

Two revisions serve different purposes. A state revision changes for observed DOM mutations, field changes, scrolling and resizing. An interaction revision additionally invalidates screenshots that overlap an interaction, without invalidating every earlier snapshot of an unchanged page. Open shadow roots discovered during a privacy scan are observed too. Pure CSS animation, closed shadow roots and arbitrary rendering changes remain limitations.

### Preparing a frame

1. A started, visible recording requests a warm frame after relevant changes or pointer/focus activity. Requests are coalesced and actual screenshot starts are separated by at least 650 ms. Prepared states expire; a 25-second refresh prevents a green indicator for indefinitely old evidence.
2. The worker checks website permission, active/focused tab, origin, main document and loading state.
3. The content script acquires a uniquely keyed capture lease, hides the toolbar with `visibility: hidden !important`, and waits for two animation frames. A timeout is a failure, not successful preparation. The snapshot confirms computed visibility, revisions, viewport, target rectangles and privacy areas.
4. The worker captures the visible tab, obtains another document-specific snapshot, and rechecks tab/window state. Both snapshots must agree on document, state/interaction revisions and viewport. Target rectangles must be stable before and after capture.
5. The union of before/after privacy rectangles is permanently rasterized into the PNG. Only the masked result enters the in-memory `FrameBuffer`.
6. The matching lease is released in `finally`. A bounded recovery timer prevents a toolbar staying hidden after a failed message. Idempotent injection avoids replacing the toolbar in the middle of a screenshot.

The buffer holds at most four masked frames and at most 24 MiB, with no IndexedDB persistence until a frame becomes part of a step. Pause, stop and new recording clear the buffer. An ordinary worker restart loses prepared frames, not committed steps. Session metadata restores authorization for the current document; a new frame is still required before another verified image is available.

### Committing an action

`FrameBuffer.find` requires the same guide, document token, observed state revision, viewport, target token and target rectangle (within one CSS pixel). A frame must be no older than 30 seconds and must have completed **before** the action timestamp. No automatic action falls back to a fresh post-click screenshot. A previously authorized navigation action may use the old document's matching buffered frame, never the new page's image.

The masked PNG and step are committed together in one IndexedDB transaction. Missing evidence produces a truthful text step with a warning. This does not guarantee reception of every browser event during arbitrary navigation, nor pixel-equivalence for every animated page. The readiness indicator helps users wait for a settled page; it is not a certification of every possible control on it.

Manual screenshots wait for the remaining API rate interval and then capture the current page with the same hiding, privacy and document checks. Raw screenshot data is transient process memory only. The extension does not keep a recoverable original in its database.

The API's two-captures-per-second limit is documented in [Chrome Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs#property-MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND). No change to permissions or special policy bypass is used for the timing fix.

## IndexedDB and concurrency

Database `klickguide`, version 1:

- `guides`: key `id`, validated guide metadata and steps.
- `images`: key `id`, index `guideId`, PNG Blob and dimensions.

Every screenshot belongs to exactly one step and guide. Save operations compare an expected revision with the current stored revision inside a read/write transaction. A stale editor receives a conflict, not a silent last-write-wins overwrite. Metadata and removal of orphan images commit together. Step recording and image replacement likewise commit together.

Transactions only await IndexedDB requests; image decoding is completed outside the transaction. Success is returned after the transaction's completion event, not merely after an individual request. A version-change event closes old connections; blocked upgrades display an actionable error.

The editor also preserves text typed while an asynchronous save is committing. These later edits remain dirty and receive the newly committed revision. A pending destructive image edit cannot be silently attached to another selected step.

## Images and redaction

Input signatures and dimensions are checked before decoding. PNG/JPEG inputs are rasterized and stored as PNG. SVG and active formats are not accepted. Raster re-encoding does not copy source EXIF or other original metadata.

Coordinates are image-relative. Redaction rectangles round outward to avoid leaving unmasked edge pixels. Cropping adjusts the remaining vector highlights. On confirmation, raster edits replace the stored image, using its existing image ID when applicable. There is no hidden application-level original or post-save redaction undo.

That guarantee covers the application's logical stored raster only. Previous backups, duplicate guides, downloads, browser internals, memory, filesystem snapshots and physical disk erasure are outside that guarantee.

## Export/import boundary

HTML is standalone, escaped and non-scripted, with data-PNG images and a restrictive CSP. Markdown accepts only generated relative image paths. The ZIP writer emits deterministic, uncompressed ZIP entries with CRC32; it does not parse user-supplied ZIP archives.

Editable backups use `format: "klickguide"`, `version: 1`, a validated guide and a bounded list of embedded PNGs. Import rejects invalid JSON, unsupported versions, duplicate IDs, unmatched images, remote image URLs and excessive sizes. Every imported image is decoded and re-encoded before an atomic import. All imported guide, step and image IDs are replaced, preventing archive-controlled overwrites.

The export dialog displays the saved snapshot and requires explicit review. The print page additionally checks the expected guide revision and waits for image decoding. Browser print/save-to-PDF is used; no separate PDF renderer is embedded.

## Limits and non-goals

300 steps per guide; 100 highlights per step; 12 tags; 20 custom selectors; 2,000 privacy rectangles per snapshot; 12 MiB and 20 million pixels per image; 80 MiB per editable backup. These are safety limits, not performance or storage-capacity guarantees.

Not included: desktop/video capture, guaranteed coverage of closed shadow roots, OCR, full-page stitching, password capture, audio, collaborative editing, encrypted storage, cloud sync, automatic publishing, a browser-store listing or a legal compliance certification.

## Primary platform references

- [Permission checks and explicit requests](https://developer.chrome.com/docs/extensions/reference/api/permissions)
- [Declaring host permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
- [activeTab permission](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- [Content scripts and isolated worlds](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Tabs API and capture limits](https://developer.chrome.com/docs/extensions/reference/api/tabs)
- [Service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Extension storage](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies)
- [Playwright extension testing](https://playwright.dev/python/docs/chrome-extensions)
