# Architecture Decision Records

Decisions that shaped JSON Change Explainer. Each record states the context, the decision, its consequences, and the alternatives that were rejected.

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](0001-single-static-file.md) | Ship as a single static HTML file | Accepted |
| [0002](0002-event-based-diff-model.md) | Emit a flat event list instead of a patch | Accepted |
| [0003](0003-array-alignment.md) | Multiple array alignment strategies | Accepted |
| [0004](0004-github-pages-hosting.md) | Serve from GitHub Pages without a build | Accepted |

A runtime overview is available in [architecture.svg](architecture.svg).

## Format

New records use the next four-digit number and follow this structure:

```markdown
# ADR NNNN — Title

- **Status:** Proposed | Accepted | Superseded by ADR NNNN
- **Date:** YYYY-MM-DD

## Context

What forces are at play?

## Decision

What was decided?

## Consequences

What becomes easier or harder?

## Alternatives considered

What else was evaluated, and why was it rejected?
```
