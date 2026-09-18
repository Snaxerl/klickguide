# Contributing

KlickGuide favors understandable code, explicit permission boundaries and small reviewable changes. Start with the [architecture](docs/ARCHITECTURE.md) and [test strategy](docs/TESTING.md).

## Local setup

Use Node.js 22.16.0 or newer. Run `npm ci`, `npm run build` and load `dist` as an unpacked extension. The fixture server (`npm run demo`) contains fictional data suitable for recording tests. Browser integration tests have a separate Python environment.

## Code conventions

Use descriptive English identifiers, typed boundaries and small functions with one responsibility. Keep pure domain logic in `core`, browser-specific effects in `platform`, and message authorization in the worker. Do not bypass the central queue for recording mutations.

Do not add `any`, unchecked assertions, hidden network requests, remote scripts, inline executable user markup or input-value collection to solve a local problem. Render user text through text nodes. Validate every new import/message boundary. Add error states that let a user recover without guessing whether their work was saved.

`npm run format` uses the pinned TypeScript compiler's syntax printer and language-service formatter rather than another formatter dependency. Review the diff, including comments. Run `npm run format:check` before submitting. JSON uses two spaces; Python uses four spaces. Prefer explanatory comments for intent and security boundaries over comments that repeat a statement.

## Before submitting a change

Run `npm run check` and relevant browser tests. For privacy, persistence, image-editing or permission changes, also complete the applicable manual checklist against the unmodified release manifest. Do not describe mocked tests as full browser tests.

A pull request should explain the user problem, design decision, tests executed and any cases that were not tested. Include a minimal fictional reproduction for bugs. Do not attach real customer data, session cookies, account screenshots or unsanitized backups.

Any new permission, runtime dependency or external service needs an explicit rationale and updated privacy documentation. Keep the integration-test manifest identical to production. The all-sites host grant has an explicit capture-API rationale; additional capabilities still require separate review.

## Repository setup and releases

This distribution is a repository-ready source tree, not an already-created remote repository. Upload the root project files to the repository you control. `.gitignore` excludes generated `dist`, dependencies and local test output. `dist` is nevertheless included in the supplied source ZIP for immediate installation.

Enable the supplied GitHub Actions workflow and dependency updates in the repository settings as needed. Review action/dependency updates, restrict workflow token permissions, and enable private vulnerability reporting before public distribution. The workflow uses versioned official actions; organizations requiring full commit-SHA pinning should pin reviewed revisions as part of their repository policy.

For a release, synchronize the version in `package.json`, `package-lock.json`, `public/manifest.json`, `src/core/model.ts` and the idempotency version in `src/recorder/content.ts`; update the changelog and validation record. Run the Node, DOM/pixel and native extension test layers and the manual production-permission checks. `npm run package` creates the deterministic extension ZIP and checksum. Publish only the original release build, never a build with extra test capabilities.

Contributions are made under the project's MIT license. There is no CLA or automatically assigned maintainer contact in this source distribution.
