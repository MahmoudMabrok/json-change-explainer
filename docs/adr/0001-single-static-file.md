# ADR 0001 — Ship as a single static HTML file

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

The tool is a small, self-contained utility: paste JSON, diff it, read the report. Its value comes from being instantly usable and trustworthy with sensitive data. Users should not need Node, a package manager, a build pipeline, or a server to run it, and the source should be auditable in one place.

## Decision

Keep the user interface — styles, editors, and rendering — in a single `index.html` with no runtime framework and no build step. The pure diff, path, auto-fix, and export functions live in `core/json-kit.js`, which the page loads with a relative classic `<script src>` (not an ES module) so `file://`, a local server, and GitHub Pages at `/json-kit/` all keep working. The same file is what the MCP server requires.

## Consequences

- Opening the file directly (`file://`) works, including offline.
- Deployment is a file copy; GitHub Pages can serve the repository root as-is.
- Reviewing a UI change still means reading `index.html`. Reviewing a diff or export change means reading `core/json-kit.js`, which has no DOM.
- The page file is still large, and the UI is hand-rendered. The engine is no longer in that file: `core/json-kit.js` is the shared pure module, which is what made an MCP server possible without a second implementation.
- No framework or bundler means DOM rendering is manual and there is no component model.

## Alternatives considered

- **Vite/React SPA:** better component structure and testability, but adds tooling, a build artifact, and a dependency upgrade treadmill for a one-screen tool.
- **Multiple ES modules:** cleaner separation, but module imports do not work when the file is opened directly from disk without a local server.
