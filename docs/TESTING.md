# Testing

## Fast local gate

```sh
npm ci
npm run check
```

The gate checks source formatting, TypeScript strictness, the actual build, all Node tests and static release constraints. It does not invoke Chromium implicitly.

`npm run test:coverage` reports coverage for modules reached by Node. A large aggregate percentage is not used as a substitute for testing browser behavior.

## Unit and contract tests

The suite currently contains 204 tests covering geometric clipping/cropping, outward redaction bounds, safe captions, filenames, escaping, guide operations, input schemas, backup validation, deterministic ZIP output and recording state transitions.

The recorder contract suite uses the real recorder and worker modules with test doubles for Chrome, IndexedDB and raster operations. It verifies message authorization, frame/document checks, pause/resume, navigation, rate limiting, target movement, storage failures and fail-closed screenshot decisions.

These tests do **not** establish that the real browser grants permissions, decodes every image correctly, renders the UI correctly, retains transactions across browser behavior, or produces correctly laid-out PDF output.

## Chromium DOM, pixel and layout suite

`npm run test:dom` runs 13 tests in real headless Chromium with pages created by `set_content`. It executes the production recorder and production frame-selection module. Pointer and keyboard events are browser-generated, not fabricated with `dispatchEvent`.

The Chrome messaging transport, capture API and persistence boundary are replaced by a test adapter; Playwright obtains the screenshot pixels. The fixture contains only invented data. This suite does **not** install an extension, run the native capture API or validate the full privacy rasterization pipeline. It must not be reported as successful native extension integration.

Cases cover pre-click dialog pixels after dismissal, excluding the toolbar from pixels, heading-only search-link captions, keyboard input, duplicate injection, independent capture leases, hover without steps, unchanged rapid clicks, newly rendered controls, private field captions and open-shadow mutations. Two layout cases check proportional height-bounded previews without bitmap resampling and a three-line title display without truncating the saved text.

Install the Python dependencies and Chromium as shown below, build, then run `npm run test:dom`. This suite does not need a display server. `KLICKGUIDE_CHROMIUM` can select an existing executable without changing managed policies.

## Native Chromium extension integration suite

Use a machine where installing test extensions is permitted. Do not change managed security policies merely to make a test pass.

Install Python 3.12 or a compatible Python version, then:

```sh
python -m venv .venv
```

Activate the environment:

```sh
# macOS / Linux
. .venv/bin/activate
```

```powershell
# Windows PowerShell, subject to your organization's execution policy
.venv\Scripts\Activate.ps1
```

Install and run:

```sh
python -m pip install -r tests/browser/requirements.txt
python -m playwright install chromium
npm run build
npm run test:browser
```

Linux CI needs the browser system packages and a display server:

```sh
python -m playwright install --with-deps chromium
xvfb-run -a npm run test:browser
```

The suite uses a persistent Playwright Chromium profile per test and a local HTTP fixture server. Profiles and test packages are temporary and cleaned up after the run. Prefer Playwright's bundled Chromium rather than a branded Chrome installation, as described in the [official extension-testing guide](https://playwright.dev/python/docs/chrome-extensions).

`KLICKGUIDE_CHROMIUM` may point to an explicitly selected Chromium executable. `KLICKGUIDE_HEADLESS=1` requests headless mode; focus-sensitive capture behavior still needs manual verification in a visible browser. Neither setting disables managed browser policies.

### Production permission boundary

The suite copies `dist` into an isolated temporary folder **without changing its manifest**. It verifies that the copy declares exactly the production `<all_urls>` host grant. There are no extra testing permissions. Native site-access dialogs, user-withheld grants and administrator restrictions still need manual testing in the actual target browser.

These tests exercise DOM events, PNG processing, IndexedDB, editing and exports. A passing test run is not a general guarantee that every third-party website can be captured.

### Integration cases

The 16 test cases cover manual editing/persistence, step duplication/reordering, permanent redaction, real crop dimensions, the export-review gate and three download formats, backup roundtrips, transaction conflicts/deletion, malformed imports, real screenshot masks, input-value exclusion, tab-switch pause, cross-origin continuation, reload reconnection, manual pauses across navigation, non-recording of unselected tabs and cleanup after stopping.

The CI configuration runs the fast gate first, then the DOM/pixel suite and native extension suite on an appropriate hosted runner. A workflow file is supplied; that is not a claim that a hosted CI run has already passed.

## Manual release checklist: unmodified production build

- Load the real `dist` folder with `activeTab`, `scripting`, `storage` and the declared `<all_urls>` host permission.
- Click the toolbar action on the local demo page. Start, record and finish a workflow.
- Check every captured screenshot against the actual page. Test browser zoom, display scaling and scrolling separately.
- Confirm the permanent site-access setting is **On all sites**. Test both a fresh installation and in-place updates from 1.0.0 and 1.0.1.
- Confirm a domain change in the selected recording tab continues without another permission request; same-origin reload and several redirects also reconnect.
- Confirm tab/window switches still pause. Manually pause, navigate to another domain, and verify it remains paused.
- Withhold site access in Chrome. Starting/resuming must be blocked with an actionable message; declining the request must not create a guide.
- Regrant access using the popup and separately using Chrome's details page. Neither operation alone may start or resume a recording.
- Confirm restricted browser/store pages and managed-policy restrictions are not bypassed.
- Wait for **Bild bereit**, then dismiss a dialog. The stored screenshot must show the dialog before dismissal, not the page after it.
- Activate a search-result link with a heading, publisher and URL. The caption should prefer the heading. The screenshot must show the link before navigation.
- Inspect screenshots: the recorder toolbar must not be present. Repeated initialization must not produce multiple toolbars/listeners.
- Use slow and rapid actions. A newly opened dialog may need another ready frame; missing evidence must produce a warning, not an unrelated screenshot. Unchanged repeated controls should reuse matching evidence.
- Scroll, resize, move between monitors and trigger CSS-only animations; ensure warnings and remaining limitations are visible and documented.
- Confirm real application handlers run once with trusted input. No synthetic click should be replayed to save or purchase twice.
- Confirm password, contact and `data-private` areas are fully masked in the stored PNG and each export.
- Try an open shadow root, a custom privacy selector and an iframe. Check closed-shadow and free-text limitations manually.
- Confirm no guide is lost after stopping, worker idle suspension, closing the target tab or restarting the browser. A restart ends the recording session, not its committed draft.
- Edit from two tabs. The second stale save must report a conflict.
- Apply a redaction and export/import the project. The removed raster content must not return.
- Inspect HTML offline, unpack Markdown ZIP, import a backup and review the native print/PDF output.
- Navigate all dialogs by keyboard. Check visible focus, labels, narrow screens and 200% zoom.
- Inspect extension-page network traffic and confirm the extension sends no application data externally.
- Check the actual target OS/browser versions and record them with the release.

## Dependency and security review

After installing dependencies on a network-enabled development machine, run `npm audit` and review dependency update pull requests. npm audit covers npm packages, not browser APIs, Python dependencies or the whole application. A separate security review should inspect capture timing, authorization, data retention, import bounds and destructive raster behavior.
