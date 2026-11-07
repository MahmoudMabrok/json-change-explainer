# ADR 0003 — Multiple array alignment strategies

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

Arrays have no universally correct equality rule. An inserted item at the front shifts every subsequent index, so pure index comparison reports a cascade of false updates. Conversely, identity-based matching is wrong for arrays of primitives or for arrays whose identity field is not stable.

## Decision

Expose three strategies and default to automatic:

- **Index-based** — pair items by position. Predictable and cheap for tuples and parallel data.
- **Identity-based** — pair object items by a configurable key (default `id`). Correct for collections whose items can move.
- **Automatic** — use identity matching when either array contains an object with the identity key; otherwise compute a longest-common-subsequence alignment over stable, key-sorted value signatures. If the dynamic-programming table would exceed 1,000,000 cells, fall back to index alignment.

If every element in both arrays is a primitive, automatic mode always uses index alignment.

## Consequences

- "Moved item" is reported as an update at the new position instead of remove-plus-add noise.
- Automatic mode handles the common mixed-data case without asking the user to understand the algorithm.
- The LCS fallback compares full value signatures; large nested arrays can be expensive, which is why the cell threshold exists.
- Identity matching requires unique, stable keys. Duplicate keys are paired in encounter order and may produce surprising descriptions.
- Users who need deterministic behavior can choose a strategy explicitly.

## Alternatives considered

- **Always index-based:** simplest, but unusable for collections with insertions or reordering.
- **Always identity-based:** fails for primitive arrays and for objects without the key.
- **Myers diff only:** good for text lines, not for typed JSON values with nested objects.
