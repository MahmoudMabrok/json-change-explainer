# ADR 0004 — Serve from GitHub Pages without a build

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

The app is static and dependency-free, so it can be hosted anywhere. The project lives on GitHub and needs a stable public demo URL that non-developers can open.

## Decision

Publish the repository root through GitHub Pages, with no Actions workflow and no generated artifact. `index.html` at the root is the site entry point, and assets are referenced with relative paths.

## Consequences

- The demo is available at `https://mo3ta.top/json-kit/`. The user site `mahmoudmabrok.github.io` owns the `mo3ta.top` CNAME, and GitHub Pages publishes this repo at `/json-kit/` because that is the repository name. This repo does not contain a `CNAME` file.
- Styles, scripts, and the icon live inside `index.html` (the icon is a data URI). There is no `<base>` tag and no root-relative asset URL, so the same file works under `/json-kit/`, at the root of a local server, and from `file://`. There is no client-side router, so a `404.html` fallback is unnecessary.
- Deploying is "push to `main`"; there is no build step that can drift from source. Pages source stays **Deploy from a branch** → `main` → `/ (root)`.
- The site cannot use server-side logic, which matches the privacy requirement: documents stay in the browser.
- Any file committed to the repository root is publicly served, so scratch files and unrelated folders must not be placed there.
- There is no preview environment; changes are validated locally before pushing.

## Alternatives considered

- **GitHub Actions + Pages artifact:** useful for compiled sites, but adds a workflow for a site that needs no compilation.
- **Netlify/Vercel:** extra accounts and configuration for no benefit at this scale.
- **Distributing a downloadable file only:** loses the instant "open a link" demo.
