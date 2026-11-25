import { z } from "zod";
import { loadCore } from "./load-core.js";

const core = loadCore();

export const LIMITS = {
  maxJsonChars: 1_000_000,
  maxEvents: 2000,
  maxValueChars: 4000,
  maxDescriptionChars: 1500,
  maxOutputChars: 200_000,
};

const OPERATIONS = ["ADD", "REMOVE", "UPDATE", "TYPE_CHANGE"];
const STRATEGIES = ["auto", "index", "identity"];
const EXPORT_FORMATS = ["descriptions", "compact", "markdown", "csv", "json"];

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const compareFields = {
  before: z.string().describe("Original JSON document, as text."),
  after: z.string().describe("Updated JSON document, as text."),
  arrayStrategy: z.enum(["auto", "index", "identity"]).optional().describe(
    'How arrays are aligned. "auto" (default) pairs objects that share identityKey, then aligns what remains by value. "index" pairs by position. "identity" pairs objects by identityKey.'
  ),
  identityKey: z.string().optional().describe("Object property used to pair array items. Default: id."),
  ignoredPaths: z.array(z.string()).optional().describe(
    "Paths to skip, one pattern per entry. Dotted keys, with [*] for any array index. Example: users[*].lastSeen."
  ),
  query: z.string().optional().describe("Case-insensitive search across path, property, description, and values. Omit to return every change."),
  operations: z.array(z.enum(["ADD", "REMOVE", "UPDATE", "TYPE_CHANGE"])).optional().describe(
    "If set, only these operations are included."
  ),
};

function fail(text) {
  return { isError: true, content: [{ type: "text", text: String(text) }] };
}

function capString(value, max) {
  if (typeof value !== "string" || value.length <= max) return value;
  return value.slice(0, max) + "…";
}

function ok(text, structured) {
  let body = String(text);
  if (body.length > LIMITS.maxOutputChars) {
    body = body.slice(0, LIMITS.maxOutputChars) +
      `\n\n… output truncated at ${LIMITS.maxOutputChars.toLocaleString("en-US")} characters.`;
  }
  const result = { content: [{ type: "text", text: body }] };
  if (structured !== undefined) {
    const copy = { ...structured };
    if (typeof copy.json === "string") copy.json = capString(copy.json, LIMITS.maxOutputChars);
    if (typeof copy.export === "string") copy.export = capString(copy.export, LIMITS.maxOutputChars);
    if (typeof copy.tree === "string") copy.tree = capString(copy.tree, LIMITS.maxOutputChars);
    result.structuredContent = copy;
  }
  return result;
}

function sizeError(label, text) {
  if (typeof text !== "string") {
    return `${label} must be a string of JSON text, not ${text === null ? "null" : typeof text}.`;
  }
  if (text.length > LIMITS.maxJsonChars) {
    return `${label} is ${text.length.toLocaleString("en-US")} characters, above the limit of ${LIMITS.maxJsonChars.toLocaleString("en-US")}. Compare a smaller document.`;
  }
  return null;
}

function readDocument(text, label) {
  const problem = sizeError(label, text);
  if (problem) return { error: problem };
  const parsed = core.parseJson(text);
  if (!parsed.ok) return { error: `${label}: ${parsed.error}` };
  return { value: parsed.value, text };
}

function readCompareOptions(args) {
  const strategy = args.arrayStrategy || "auto";
  if (!STRATEGIES.includes(strategy)) {
    return { error: `arrayStrategy must be auto, index, or identity. Received ${JSON.stringify(args.arrayStrategy)}.` };
  }
  const identityKey = typeof args.identityKey === "string" && args.identityKey.trim()
    ? args.identityKey.trim()
    : "id";
  let ignoredPaths = [];
  if (args.ignoredPaths != null) {
    if (!Array.isArray(args.ignoredPaths) || args.ignoredPaths.some((p) => typeof p !== "string")) {
      return { error: "ignoredPaths must be an array of strings, for example [\"metadata.updatedAt\", \"users[*].lastSeen\"]." };
    }
    ignoredPaths = args.ignoredPaths.map((p) => p.trim()).filter(Boolean);
  }
  let operations = null;
  if (args.operations != null) {
    if (!Array.isArray(args.operations)) {
      return { error: "operations must be an array of ADD, REMOVE, UPDATE, or TYPE_CHANGE." };
    }
    const unknown = args.operations.filter((op) => !OPERATIONS.includes(op));
    if (unknown.length) {
      return { error: `Unknown operation ${unknown.map((op) => JSON.stringify(op)).join(", ")}. Use ADD, REMOVE, UPDATE, or TYPE_CHANGE.` };
    }
    operations = args.operations;
  }
  const query = args.query == null ? "" : String(args.query);
  const groupBy = args.groupBy || "path";
  if (!["path", "operation", "none"].includes(groupBy)) {
    return { error: 'groupBy must be "path", "operation", or "none".' };
  }
  return { strategy, identityKey, ignoredPaths, operations, query, groupBy };
}

function diffDocuments(beforeText, afterText, options) {
  const before = readDocument(beforeText, "before");
  if (before.error) return { error: before.error };
  const after = readDocument(afterText, "after");
  if (after.error) return { error: after.error };
  const opts = readCompareOptions(options || {});
  if (opts.error) return { error: opts.error };
  let events;
  try {
    events = core.compareAll(before.value, after.value, {
      arrayStrategy: opts.strategy,
      identityKey: opts.identityKey,
      ignoredPaths: opts.ignoredPaths,
    });
  } catch (err) {
    return { error: `Comparison failed: ${err && err.message ? err.message : String(err)}` };
  }
  const filtered = core.filterEvents(events, { operations: opts.operations, query: opts.query });
  return { events: filtered, allCount: events.length, options: opts, before: before.value, after: after.value };
}

function clipText(text, max) {
  const s = String(text ?? "");
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}

function clipJsonValue(value) {
  if (value === undefined) return { value: null, missing: true };
  let encoded;
  try {
    encoded = JSON.stringify(value);
  } catch {
    return { value: "[unserializable]", missing: false, truncated: true };
  }
  if (encoded == null) return { value: null, missing: false };
  if (encoded.length <= LIMITS.maxValueChars) return { value, missing: false };
  return { value: encoded.slice(0, LIMITS.maxValueChars) + "…", missing: false, truncated: true };
}

function presentEvent(ev) {
  const oldV = clipJsonValue(ev.oldValue);
  const newV = clipJsonValue(ev.newValue);
  const item = {
    operation: ev.operation,
    path: core.eventFullPath(ev),
    parentPath: ev.path,
    property: ev.property,
    index: ev.index,
    oldType: ev.oldType,
    newType: ev.newType,
    oldValue: oldV.value,
    newValue: newV.value,
    description: clipText(ev.description, LIMITS.maxDescriptionChars),
  };
  if (oldV.missing) item.oldValueMissing = true;
  if (newV.missing) item.newValueMissing = true;
  if (oldV.truncated) item.oldValueTruncated = true;
  if (newV.truncated) item.newValueTruncated = true;
  return item;
}

function changeReport(events, meta) {
  const summary = core.summarizeEvents(events);
  const lines = [];
  lines.push(
    `${summary.total} change${summary.total === 1 ? "" : "s"} · ${summary.added} added, ${summary.removed} removed, ${summary.updated} updated, ${summary.typeChanges} type change${summary.typeChanges === 1 ? "" : "s"}`
  );
  lines.push(`Array strategy: ${meta.strategy} · identity key: ${meta.identityKey}`);
  if (meta.ignoredPaths.length) lines.push(`Ignored paths: ${meta.ignoredPaths.join(", ")}`);
  if (meta.query) lines.push(`Search: ${meta.query}`);
  if (meta.operations && meta.operations.length) lines.push(`Operations: ${meta.operations.join(", ")}`);
  if (summary.total === 0) {
    lines.push("");
    lines.push(meta.query || (meta.operations && meta.operations.length && meta.operations.length < 4)
      ? "No changes match the current filters."
      : "No changes detected. Both JSON documents are identical.");
    return { text: lines.join("\n"), summary, shown: [] };
  }
  const shown = events.slice(0, LIMITS.maxEvents);
  lines.push("");
  const groups = core.groupEvents(shown, meta.groupBy || "path");
  for (const group of groups) {
    if (group.key) lines.push(group.key);
    for (const ev of group.events) lines.push("- " + clipText(ev.description, LIMITS.maxDescriptionChars));
    lines.push("");
  }
  if (events.length > shown.length) {
    lines.push(`Showing the first ${shown.length} of ${events.length} changes. Narrow the result with query, operations, or ignoredPaths.`);
  }
  return { text: lines.join("\n").trimEnd(), summary, shown: shown.map(presentEvent) };
}

function rootShape(value) {
  const type = core.typeOf(value);
  if (type === "object") return `${Object.keys(value).length} ${Object.keys(value).length === 1 ? "key" : "keys"}`;
  if (type === "array") return `${value.length} ${value.length === 1 ? "item" : "items"}`;
  if (type === "string") return `${value.length} character${value.length === 1 ? "" : "s"}`;
  return null;
}

export function validateJson(args) {
  const problem = sizeError("json", args && args.json);
  if (problem) return fail(problem);
  const parsed = core.parseJson(args.json);
  if (!parsed.ok) {
    return fail(parsed.error + "\n\nFix the syntax, or call fix_json to repair common mistakes (smart quotes, comments, trailing commas, unquoted keys).");
  }
  const type = core.typeOf(parsed.value);
  const shape = rootShape(parsed.value);
  const lines = [`Valid JSON.`, `Root type: ${type}.`];
  if (shape) lines.push(`Root size: ${shape}.`);
  return ok(lines.join("\n"), { valid: true, type, shape });
}

export function formatJson(args) {
  const problem = sizeError("json", args && args.json);
  if (problem) return fail(problem);
  const indent = args && args.indent === undefined ? 2 : args.indent;
  const result = core.formatJson(args.json, indent);
  if (!result.ok) return fail(result.error);
  return ok(result.json, { json: result.json });
}

export function compactJson(args) {
  const problem = sizeError("json", args && args.json);
  if (problem) return fail(problem);
  const result = core.compactJson(args.json);
  if (!result.ok) return fail(result.error);
  return ok(result.json, { json: result.json });
}

export function fixJson(args) {
  const problem = sizeError("json", args && args.json);
  if (problem) return fail(problem);
  let fixed, fixes;
  try {
    ({ fixed, fixes } = core.fixJson(args.json));
  } catch (err) {
    return fail(`Auto-fix failed: ${err && err.message ? err.message : String(err)}`);
  }
  const parsed = core.parseJson(fixed);
  const lines = [];
  if (!fixes.length && parsed.ok) {
    lines.push("No fixes needed — already valid JSON.");
  } else if (parsed.ok) {
    lines.push(`Applied ${fixes.length} fix${fixes.length === 1 ? "" : "es"}. The result is valid JSON.`);
    for (const fix of fixes) lines.push("- " + fix);
  } else if (!fixes.length) {
    lines.push("Could not auto-fix this input.");
    lines.push(parsed.error);
  } else {
    lines.push("Partially fixed, but the result is still invalid JSON.");
    for (const fix of fixes) lines.push("- " + fix);
    lines.push(parsed.error);
  }
  lines.push("");
  lines.push(fixed);
  return ok(lines.join("\n").trimEnd(), {
    valid: parsed.ok,
    fixes,
    json: fixed,
    error: parsed.ok ? null : parsed.error,
  });
}

export function jsonPath(args) {
  const doc = readDocument(args && args.json, "json");
  if (doc.error) return fail(doc.error);
  const hasOffset = args.offset !== undefined && args.offset !== null;
  const query = args.query == null ? "" : String(args.query);
  if (hasOffset) {
    if (typeof args.offset !== "number" || !Number.isInteger(args.offset) || args.offset < 0) {
      return fail("offset must be a non-negative integer: the caret position in the JSON text, counting from 0.");
    }
    if (args.offset > args.json.length) {
      return fail(`offset ${args.offset} is past the end of the document (${args.json.length} characters).`);
    }
    let path = null;
    try {
      path = core.findPathAtOffset(args.json, args.offset);
    } catch (err) {
      return fail(`Could not read a path at that offset: ${err && err.message ? err.message : String(err)}`);
    }
    if (!path) {
      return fail(`No JSON value contains offset ${args.offset}. Move it onto a key or a value. Document length: ${args.json.length}.`);
    }
    return ok(`Path: ${path}`, { path, via: "offset" });
  }
  const path = core.findPathInJson(doc.value, query);
  if (!path) {
    return fail(query
      ? `No key or value matching ${JSON.stringify(query)} was found. The match is exact (after trimming quotes), and the search stops at the first hit.`
      : "The document has no path to report. Pass offset, or query with a key or primitive value.");
  }
  const via = query ? "query" : "first-key";
  const note = via === "first-key" ? "\nNo query or offset was given, so this is the first top-level key." : "";
  return ok(`Path: ${path}${note}`, { path, via });
}

export function browseJson(args) {
  const doc = readDocument(args && args.json, "json");
  if (doc.error) return fail(doc.error);
  let maxDepth = 8;
  let maxNodes = 500;
  if (args.maxDepth != null) {
    if (typeof args.maxDepth !== "number" || !Number.isInteger(args.maxDepth) || args.maxDepth < 0 || args.maxDepth > 30) {
      return fail("maxDepth must be an integer from 0 to 30.");
    }
    maxDepth = args.maxDepth;
  }
  if (args.maxNodes != null) {
    if (typeof args.maxNodes !== "number" || !Number.isInteger(args.maxNodes) || args.maxNodes < 1 || args.maxNodes > 5000) {
      return fail("maxNodes must be an integer from 1 to 5000.");
    }
    maxNodes = args.maxNodes;
  }
  const outline = core.outlineJson(doc.value, { maxDepth, maxNodes });
  const lines = outline.nodes.map((node) => {
    const pad = "  ".repeat(node.depth);
    let detail = node.type;
    if (node.type === "object") detail += ` (${node.keyCount} ${node.keyCount === 1 ? "key" : "keys"})`;
    else if (node.type === "array") detail += ` (${node.length} ${node.length === 1 ? "item" : "items"})`;
    else if (node.type === "string") detail += " " + core.fmtValue(clipText(node.value, 80));
    else detail += " " + core.fmtValue(node.value);
    if (node.collapsed) detail += " …";
    return `${pad}${node.path}  ${detail}`;
  });
  if (outline.truncated) lines.push(`… stopped after ${outline.nodes.length} nodes. Raise maxNodes or lower maxDepth.`);
  if (!lines.length) lines.push("(empty outline)");
  return ok(lines.join("\n"), {
    truncated: outline.truncated,
    nodes: outline.nodes.map((node) => {
      if (node.type !== "string") return node;
      const text = String(node.value);
      if (text.length <= 200) return node;
      return { ...node, value: text.slice(0, 200) + "…", valueTruncated: true };
    }),
  });
}

export function compareJson(args) {
  const diff = diffDocuments(args && args.before, args && args.after, args || {});
  if (diff.error) return fail(diff.error);
  const report = changeReport(diff.events, diff.options);
  return ok(report.text, {
    summary: report.summary,
    matchedChanges: diff.events.length,
    totalChangesBeforeFilter: diff.allCount,
    truncated: diff.events.length > report.shown.length,
    events: report.shown,
  });
}

export function exportJsonChanges(args) {
  const format = args && args.format;
  if (!EXPORT_FORMATS.includes(format)) {
    return fail(`format must be one of ${EXPORT_FORMATS.join(", ")}.`);
  }
  const diff = diffDocuments(args.before, args.after, args || {});
  if (diff.error) return fail(diff.error);
  const text = core.exportEvents(diff.events, format);
  const summary = core.summarizeEvents(diff.events);
  const header = `${summary.total} change${summary.total === 1 ? "" : "s"} exported as ${format}.`;
  return ok(`${header}\n\n${text}`, { format, summary, export: text });
}

export function visualDiffJson(args) {
  const before = readDocument(args && args.before, "before");
  if (before.error) return fail(before.error);
  const after = readDocument(args && args.after, "after");
  if (after.error) return fail(after.error);
  const opts = readCompareOptions(args || {});
  if (opts.error) return fail(opts.error);
  let tree;
  try {
    tree = core.renderVisualTreeText(before.value, after.value, {
      arrayStrategy: opts.strategy,
      identityKey: opts.identityKey,
    });
  } catch (err) {
    return fail(`Visual diff failed: ${err && err.message ? err.message : String(err)}`);
  }
  const header = [
    `Visual diff · array strategy: ${opts.strategy} · identity key: ${opts.identityKey}`,
    "Legend: + added, - removed, ~ updated or type-changed.",
    "Ignored paths are not applied here, matching the web app's visual tree.",
    "",
  ].join("\n");
  return ok(header + tree, { tree });
}

export const toolDefinitions = [
  {
    name: "validate_json",
    config: {
      title: "Validate JSON",
      description: "Check whether text is valid JSON and report the root type. Invalid input returns the parser error with line and column, instead of throwing. Use this before trusting a document, or when the user asks if JSON is valid.",
      inputSchema: {
        json: z.string().describe("JSON text to validate."),
      },
      annotations: readOnly,
    },
    handler: async (args) => validateJson(args),
  },
  {
    name: "format_json",
    config: {
      title: "Format JSON",
      description: "Pretty-print valid JSON. Default indent is 2 spaces, the same as the Format button in JSON Kit. Key order is preserved. Invalid JSON returns a line and column error.",
      inputSchema: {
        json: z.string().describe("JSON text to pretty-print."),
        indent: z.number().int().min(0).max(10).optional().describe("Spaces of indentation. Default 2. Use 0 for a compact document with no extra whitespace."),
      },
      annotations: readOnly,
    },
    handler: async (args) => formatJson(args),
  },
  {
    name: "compact_json",
    config: {
      title: "Compact JSON",
      description: "Minify valid JSON by removing insignificant whitespace, the same as the Compact button in JSON Kit. Invalid JSON returns a line and column error.",
      inputSchema: {
        json: z.string().describe("JSON text to minify."),
      },
      annotations: readOnly,
    },
    handler: async (args) => compactJson(args),
  },
  {
    name: "fix_json",
    config: {
      title: "Auto-fix JSON",
      description: "Repair common JSON mistakes in place and report what changed: smart or guillemet quotes, single quotes, comments, trailing or missing commas, unquoted keys and string values, NaN/Infinity, unclosed braces or brackets, and raw control characters inside strings. Returns the repaired text even when something is still invalid. Does not invent missing colons.",
      inputSchema: {
        json: z.string().describe("JSON-like text to repair."),
      },
      annotations: readOnly,
    },
    handler: async (args) => fixJson(args),
  },
  {
    name: "json_path",
    config: {
      title: "Get JSON path",
      description: "Return the JSON path at a caret offset, or the path of the first key or primitive value equal to query. This is the Get Path action from JSON Kit. Paths use dotted keys for identifiers and [\"bracket\"] notation for other keys, plus [index] for arrays. If both offset and query are set, offset wins. The document must be valid JSON.",
      inputSchema: {
        json: z.string().describe("JSON text to inspect."),
        offset: z.number().int().nonnegative().optional().describe("Zero-based caret offset into json. Use this when you know where in the text the value sits."),
        query: z.string().optional().describe("Exact key name, or exact primitive value (after trimming one pair of surrounding quotes). Returns the first match."),
      },
      annotations: readOnly,
    },
    handler: async (args) => jsonPath(args),
  },
  {
    name: "browse_json",
    config: {
      title: "Browse JSON outline",
      description: "List a JSON document as an outline of paths, types, and short values. This is the agent-facing form of the editor Browse mode (collapsible tree). Paths match the diff engine: user.profile.name, tags[0]. Large documents are capped by maxDepth and maxNodes.",
      inputSchema: {
        json: z.string().describe("JSON text to outline."),
        maxDepth: z.number().int().min(0).max(30).optional().describe("How many levels below the root to expand. Default 8."),
        maxNodes: z.number().int().min(1).max(5000).optional().describe("Maximum outline rows. Default 500."),
      },
      annotations: readOnly,
    },
    handler: async (args) => browseJson(args),
  },
  {
    name: "compare_json",
    config: {
      title: "Compare JSON",
      description: "Compare two JSON documents and explain every change in a sentence. Reports ADD, REMOVE, UPDATE, and TYPE_CHANGE with paths, types, and old/new values. Use arrayStrategy and identityKey to control array alignment, and ignoredPaths to skip noisy fields such as timestamps. This is the main JSON Kit comparison, including the human-readable explanations. Results are grouped by parent path unless groupBy says otherwise.",
      inputSchema: {
        ...compareFields,
        groupBy: z.enum(["path", "operation", "none"]).optional().describe('How to group the text report. Default "path" (parent path), matching the web app. "operation" groups by ADD/REMOVE/UPDATE/TYPE_CHANGE. "none" is a flat list.'),
      },
      annotations: readOnly,
    },
    handler: async (args) => compareJson(args),
  },
  {
    name: "export_json_changes",
    config: {
      title: "Export JSON changes",
      description: "Compare two JSON documents and render the changes in one of the JSON Kit export formats: descriptions (one sentence per change), compact (grouped plain text), markdown, csv, or json (a reconstructed object; removed values are marked with __removed__). Accepts the same array, ignore, search, and operation filters as compare_json.",
      inputSchema: {
        ...compareFields,
        format: z.enum(["descriptions", "compact", "markdown", "csv", "json"]).describe("Export format. descriptions, compact, markdown, csv, or json."),
      },
      annotations: readOnly,
    },
    handler: async (args) => exportJsonChanges(args),
  },
  {
    name: "visual_diff_json",
    config: {
      title: "Visual JSON diff",
      description: "Render a text tree of the after document annotated with additions (+), removals (-), and updates (~). Uses the same array alignment as the web app's visual diff. Ignored paths are not applied, also matching the web app. Prefer compare_json when you need a change list or explanations.",
      inputSchema: {
        before: compareFields.before,
        after: compareFields.after,
        arrayStrategy: compareFields.arrayStrategy,
        identityKey: compareFields.identityKey,
      },
      annotations: readOnly,
    },
    handler: async (args) => visualDiffJson(args),
  },
];
