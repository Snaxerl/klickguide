# Security

KlickGuide handles screenshots and potentially sensitive workflow information. Its local architecture reduces external transfer but does not make all captured content safe to share.

## Reporting a vulnerability

For a hosted repository whose maintainers have enabled GitHub private vulnerability reporting, use **Security → Report a vulnerability**. This source distribution cannot enable that repository setting or guarantee an active reporting channel.

If that channel is not available, ask the repository owner for a private contact using a non-sensitive general inquiry. Do not publish exploit details, private screenshots, account data or unredacted project backups in a public issue. Supply a minimal reproduction with fabricated data and the exact extension/browser versions through an agreed private channel.

Maintainers should enable private reporting before publishing the project. No response-time commitment or managed security service is implied.

## Security boundaries

The extension performs explicit user-started capture, local data storage, bounded import validation, authorization of recorder messages and raster-based redaction. It does not claim to identify every sensitive value, protect a compromised browser/OS, encrypt stored data or securely erase prior exports and filesystem backups.

Report any path that captures another tab without consent, accepts an unauthorized runtime message, imports executable content, revives applied redactions, bypasses import size bounds or silently overwrites a newer guide revision.

## Release review

Use the unmodified production manifest for consent tests. Since 1.0.1 it declares persistent all-sites host access. The integration suite uses the same manifest without granting extra capabilities. Review that broad access never leads to recording a tab without an explicit session. Review release checksums, browser behavior, dependencies and the manual checklist in `docs/TESTING.md`.

Version 1.0.1 fixes the cross-origin permission flow introduced in the initial 1.0.0 release. There is no established long-term support or independent security audit. Exact executed checks and open verification items are recorded in `docs/VALIDATION.md`.
