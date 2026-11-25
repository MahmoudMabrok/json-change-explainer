import { copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "..", "..", "core", "json-kit.js");
const dest = join(here, "..", "src", "json-kit-core.cjs");
copyFileSync(source, dest);
