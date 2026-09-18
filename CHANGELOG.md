# Changelog

## 1.0.3

- Automatic screenshot redaction is disabled by default and can be enabled explicitly in Settings.
- Existing 1.0.2 settings migrate with automatic redaction turned off.
- Removed local-storage/privacy marketing copy from the main UI and popup.
- Simplified recording settings and kept manual redaction available in the image editor.

## 1.0.2 — 2026-09-18

### Fixed

- Associate automatic click steps only with a verified pre-action frame; never capture the destination page as a fallback for a navigation click.
- Track document identity, observed DOM revisions, interaction timing, viewport and stable target geometry. Preserve a short, authenticated delivery window for pre-navigation actions.
- Honor toolbar visibility despite the host's `all: initial !important`; verify hidden state and use independent capture leases with bounded recovery.
- Prefer the actual heading of rich links instead of concatenated publisher, breadcrumb and URL text. Keep field values and placeholders out of captions.
- Make content-script injection idempotent within a document. Support secure random tokens on ordinary HTTP pages as well as HTTPS.
- Reuse matching evidence for unchanged rapid actions, wait for manual capture rate limits and deduplicate repeated action messages.

### Added

- Bounded, already-masked in-memory frame buffer and a **Bild bereit** recording indicator.
- 46 additional Node regressions (204 total) and 13 actual Chromium DOM/pixel/layout tests with an explicitly documented test transport.
- Height-bounded editor image previews without resampling the stored raster; three-line sidebar captions with complete text retained.
- Updated architecture, privacy, migration instructions and reproducible test commands. Native extension integration remains unverified in the managed build environment.

### Compatibility

- No new extension permissions, no IndexedDB migration and no project-backup format change.
- Existing guides are not rewritten; missing historical screenshots cannot be reconstructed by this update.


## 1.0.1 - 2026-09-18

### Fixed

- Replace per-origin reauthorization with declared persistent all-sites access for a user-started recording.
- Reconnect the same recording after HTTP(S) domain changes and reloads; preserve explicit pauses and pause on tab/window changes.
- Invalidate stale document tokens during navigation and check the reconnect handshake origin.
- Use current tab state instead of queued event URLs, avoiding stale redirect destinations.
- Show an explicit all-sites access request and Chrome settings link instead of repeatedly asking users to click the extension icon.
- Block recording when persistent access is missing and pause on permission revocation.
- Give the page toolbar message a consistent inherited font.

### Tests and documentation

- Add 25 regression/permission contract tests; all 158 Node tests pass in the build environment.
- Extend the Chromium suite to 16 cases and use the unchanged production manifest.
- Update privacy, architecture, installation and in-place upgrade instructions for the broader permission.
- Real Chromium integration remains unexecuted in the policy-restricted build environment; see `docs/VALIDATION.md`.

## 1.0.0 - 2026-09-18

Initial standalone source release.

### Implemented

- Manifest V3 extension with explicit single-tab capture and local session control.
- Semantic click/field captions, masked screenshots, manual captures and pause/stop controls.
- Local library, editable guides, step ordering/duplication, tags and document metadata.
- PNG/JPEG import, image highlights, permanent redaction and crop tools.
- Reviewed HTML, Markdown ZIP, editable backup and native print/PDF flows.
- Transactional persistence, revision conflicts and bounded untrusted backup imports.
- Strict TypeScript build, 133 automated core/contract tests and static release checks.
- Separate 12-case Playwright integration suite, fixture site, CI configuration and documentation.

### Verification limits

The initial build's Chromium installation was blocked by managed environment policies. The integration suite and manual browser/print/accessibility checklist remain to be run on a permitted target system. No independent security audit or store publication is claimed.
