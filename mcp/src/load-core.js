import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

/**
 * The web app and this server share core/json-kit.js.
 * A published package vendors that file next to the server entry (prepack),
 * because npm cannot include a path outside the package.
 */
export function resolveCorePath() {
  const candidates = [
    join(here, "..", "..", "core", "json-kit.js"),
    join(here, "json-kit-core.cjs"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    "JSON Kit core module not found. Expected core/json-kit.js next to the repository, or src/json-kit-core.cjs inside the published package."
  );
}

export function loadCore() {
  return require(resolveCorePath());
}
