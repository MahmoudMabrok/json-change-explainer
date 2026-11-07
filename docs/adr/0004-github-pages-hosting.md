# ADR 0004 — Serve from GitHub Pages without a build

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

The app is static and dependency-free, so it can be hosted anywhere. The project lives on GitHub and needs a stable public demo URL that non-developers can open.

## Decision

Publish the repository root through GitHub Pages, with no Actions workflow and no generated artifact. `index.html` at the root is the site entry point, and assets are referenced with relative paths.

## Consequences

- The demo is available at `https://mahmoudmabrok.github.io/json-change-explainer/`.
- Deploying is "push to `main`"; there is no build step that can drift from source.
- The site cannot use server-side logic, which matches the privacy requirement: documents stay in the browser.
- Any file committed to the repository root is publicly served, so scratch files and unrelated folders must not be placed there.
- There is no preview environment; changes are validated locally before pushing.

## Alternatives considered

- **GitHub Actions + Pages artifact:** useful for compiled sites, but adds a workflow for a site that needs no compilation.
- **Netlify/Vercel:** extra accounts and configuration for no benefit at this scale.
- **Distributing a downloadable file only:** loses the instant "open a link" demo.
