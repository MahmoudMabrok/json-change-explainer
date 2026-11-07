# ADR 0001 — Ship as a single static HTML file

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

The tool is a small, self-contained utility: paste JSON, diff it, read the report. Its value comes from being instantly usable and trustworthy with sensitive data. Users should not need Node, a package manager, a build pipeline, or a server to run it, and the source should be auditable in one place.

## Decision

Keep the entire application — styles, UI, diff engine, and exporters — in a single `index.html` with no runtime or build-time dependencies.

## Consequences

- Opening the file directly (`file://`) works, including offline.
- Deployment is a file copy; GitHub Pages can serve the repository root as-is.
- Reviewing a change means reading one file rather than tracing a module graph.
- The file is large (~1,500 lines) and the UI, engine, and styles share one namespace. This is acceptable at the current size but is the main pressure to split if the app grows.
- No framework or bundler means DOM rendering is manual and there is no component model.

## Alternatives considered

- **Vite/React SPA:** better component structure and testability, but adds tooling, a build artifact, and a dependency upgrade treadmill for a one-screen tool.
- **Multiple ES modules:** cleaner separation, but module imports do not work when the file is opened directly from disk without a local server.
