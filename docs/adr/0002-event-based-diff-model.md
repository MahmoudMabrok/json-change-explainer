# ADR 0002 — Emit a flat event list instead of a patch

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

The comparison result feeds several very different views: summary counts, a searchable and grouped change list, a visual tree of the resulting document, and five export formats. A JSON Patch document is the obvious machine-readable output, but it is optimized for applying changes, not for explaining them, filtering them, or counting them by operation.

## Decision

Have the diff engine return a flat array of change events:

```js
{
  operation,      // ADD | REMOVE | UPDATE | TYPE_CHANGE
  path,           // parent path, e.g. "user.profile" or "root"
  property,       // object key, when applicable
  index,          // array index, when applicable
  oldValue, newValue,
  oldType, newType,
  description,    // pre-rendered English sentence
  identityKey, identityValue
}
```

All UI features and exports are projections of this list. The event list is the only contract between the engine and the presentation layer.

## Consequences

- Adding a view or export format does not require touching the engine.
- Summary counts, filters, grouping, pagination, and search are simple array operations.
- Every change carries a ready-to-display description, so all surfaces explain changes consistently.
- The representation is larger than a minimal patch and is not directly applicable to a document; the JSON export is a reconstruction built from events, not a patch.
- Consumers must treat the event schema as stable.

## Alternatives considered

- **RFC 6902 JSON Patch:** compact and standard, but loses human-readable explanations and requires a separate interpretation layer for every view.
- **Render HTML in the engine:** would couple diffing to presentation and make exports harder.
