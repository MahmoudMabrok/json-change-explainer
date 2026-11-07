# JSON Change Explainer

Compare two JSON documents and get a human-readable explanation of every change — plus search, filtering, a visual diff tree, and exports.

**Live demo: [mahmoudmabrok.github.io/json-change-explainer](https://mahmoudmabrok.github.io/json-change-explainer/)**

Everything runs locally in your browser. There is no backend, no account, no upload, and no telemetry. The app is a single static `index.html` with zero dependencies and no build step.

## Screenshots

| Input | Results |
| --- | --- |
| ![Before and after JSON editors, comparison options, and Compare button](docs/screenshots/input.png) | ![Summary cards, change list grouped by parent path, and export panel](docs/screenshots/results-light.png) |

| Visual diff | Dark theme |
| --- | --- |
| ![Tree view highlighting added, removed, updated, and type-changed values](docs/screenshots/visual-diff.png) | ![Results view in dark theme](docs/screenshots/results-dark.png) |

## Features

- **Side-by-side editors** — paste JSON or upload `.json` files; format, compact, clear, or swap the two sides. Both editors get live syntax highlighting and a validity pill (✓ Valid / ✕ Invalid) as you type.
- **Auto-fix** — per-editor “✦ Auto-fix” button repairs common JSON mistakes in place: smart/guillemet quotes (`“age”: 25`), single quotes, missing or trailing commas, unquoted keys/values, `//` and `/* */` comments, `NaN`/`Infinity`, control characters, and unclosed braces/brackets. A report lists what was changed, or confirms the input was already valid.
- **Get Path** — place the cursor in either editor to extract the JSON path at that position and copy it.
- **Structured diff** — reports `ADD`, `REMOVE`, `UPDATE`, and `TYPE_CHANGE` events with old and new values and types.
- **Array strategies** — compare arrays by index, by an identity key (default `id`), or automatically.
- **Ignored paths** — skip noisy fields with one path per line, including wildcards such as `users[*].lastSeen`.
- **Human-readable descriptions** — every change is explained in a sentence, not just rendered as a JSON Patch.
- **Old/new value chips** — each change shows the before and after values side by side (click a chip to copy its value).
- **Search and filter** — full-text search (`/` to focus, `Esc` to clear), operation filters, and grouping by operation or parent path.
- **Clickable summary cards** — the counts double as filters; click "Added" to see only additions.
- **Keyboard shortcuts** — `Ctrl/⌘`+`Enter` runs a comparison with whatever is in the editors.
- **Visual diff tree** — a color-coded tree of the resulting document showing exactly what was added, removed, or updated.
- **Exports** — plain-text descriptions, compact summaries, Markdown, CSV, or JSON; copy or download from the browser.
- **Light and dark themes** — theme follows the system by default and persists in `localStorage`.
- **Private by design** — all parsing and comparison happens client-side.

## Quick start

```bash
git clone https://github.com/MahmoudMabrok/json-change-explainer.git
cd json-change-explainer
open index.html
```

That's it — no install, no build. The page also works when opened directly via `file://`.

If you prefer a local server:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## How it works

1. Both editors are parsed with `JSON.parse`. Invalid input is reported with line and column.
2. The diff engine walks both documents and emits an event for each difference.
3. The UI derives summary counts, filters, groups, renders the change list, and builds the visual tree from those events.
4. Export builders transform the same event list into Markdown, CSV, JSON, or plain text.

### Array comparison

| Strategy | Behavior |
| --- | --- |
| `Automatic` (default) | Uses identity matching when array items are objects containing the identity key; otherwise aligns items with a longest-common-subsequence pass over stable value signatures. Falls back to index alignment for very large arrays. |
| `Index-based` | Pairs items by position; extra items are reported as added or removed. |
| `Identity-based` | Pairs object items by the identity key (default `id`), even when their positions change. |

### Ignored paths

Patterns use dotted keys and `[*]` for any array index:

```
metadata.updatedAt
users[*].lastSeen
debug
```

Paths are matched on the parsed path segments, so array positions do not need to be known in advance.

## Architecture

![Architecture diagram](docs/adr/architecture.svg)

The app is deliberately a single file. It has three cooperating layers:

- **Diff engine** — pure functions (`typeOf`, `parsePathString`, `alignArrays`, `compareAll`) that know nothing about the DOM. The engine is authored inside a `<script type="text/plain">` block and evaluated on the main thread so the page still works from `file://`, where blob-based Web Workers are unreliable.
- **Event model** — the only contract between engine and UI: `{ operation, path, property, index, oldValue, newValue, oldType, newType, description, ... }`.
- **Presentation** — editors, summary, filtering/grouping, visual tree, and export builders, all derived from the event list.

```text
index.html                 # app: styles, UI, diff engine, exports
docs/screenshots/          # images used in this README
docs/adr/                  # architecture decision records
```

Key implementation choices are documented as ADRs:

- [ADR 0001 — Ship as a single static HTML file](docs/adr/0001-single-static-file.md)
- [ADR 0002 — Emit a flat event list instead of a patch](docs/adr/0002-event-based-diff-model.md)
- [ADR 0003 — Multiple array alignment strategies](docs/adr/0003-array-alignment.md)
- [ADR 0004 — Serve from GitHub Pages without a build](docs/adr/0004-github-pages-hosting.md)

### Limits

- Values are compared with strict equality after parsing, so `1` and `1.0` are equal, while key order is ignored for objects but significant for arrays unless an identity strategy is used.
- The visual tree is a rendering of the *after* document annotated with changes; deeply nested additions may be summarized at their parent.
- Very large documents are processed on the main thread. The UI shows a progress overlay while comparing.

## Deployment

GitHub Pages serves the repository root directly — no Actions workflow or build artifact is required:

1. Push to `main`.
2. In **Settings → Pages**, set the source to the branch root.
3. The site is published at `https://<user>.github.io/<repo>/`.

## Contributing

Issues and pull requests are welcome at [MahmoudMabrok/json-change-explainer](https://github.com/MahmoudMabrok/json-change-explainer). Since the app is a single file, test changes by opening `index.html` and comparing a few JSON pairs in both themes; there is no test runner or package manager.
