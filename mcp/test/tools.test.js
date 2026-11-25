import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LIMITS,
  browseJson,
  compactJson,
  compareJson,
  exportJsonChanges,
  fixJson,
  formatJson,
  jsonPath,
  toolDefinitions,
  validateJson,
  visualDiffJson,
} from "../src/tools.js";

function textOf(result) {
  assert.equal(result.content[0].type, "text");
  return result.content[0].text;
}

const before = JSON.stringify({ user: { name: "ahmed", age: 30 }, tags: ["a", "b"] });
const after = JSON.stringify({ user: { name: "ahmed", age: 31 }, tags: ["b", "c"] });

test("every capability is one tool with a description and an input schema", () => {
  const names = toolDefinitions.map((tool) => tool.name);
  assert.deepEqual(names, [
    "validate_json",
    "format_json",
    "compact_json",
    "fix_json",
    "json_path",
    "browse_json",
    "compare_json",
    "export_json_changes",
    "visual_diff_json",
  ]);
  for (const tool of toolDefinitions) {
    assert.ok(tool.config.description.length > 40, tool.name);
    assert.ok(tool.config.inputSchema);
    assert.equal(typeof tool.handler, "function");
  }
});

test("validate_json accepts a document and explains invalid JSON", () => {
  const good = validateJson({ json: before });
  assert.equal(good.isError, undefined);
  assert.match(textOf(good), /Valid JSON/);
  assert.equal(good.structuredContent.type, "object");

  const bad = validateJson({ json: "{\n  a: 1" });
  assert.equal(bad.isError, true);
  assert.match(textOf(bad), /Invalid JSON at line 2/);

  const empty = validateJson({ json: "   " });
  assert.equal(empty.isError, true);
  assert.match(textOf(empty), /empty/i);

  const wrongType = validateJson({ json: { a: 1 } });
  assert.equal(wrongType.isError, true);
  assert.match(textOf(wrongType), /must be a string/);
});

test("format_json and compact_json round-trip text", () => {
  const pretty = formatJson({ json: '{"a":1,"b":[2]}' });
  assert.equal(textOf(pretty), '{\n  "a": 1,\n  "b": [\n    2\n  ]\n}');
  const min = compactJson({ json: textOf(pretty) });
  assert.equal(textOf(min), '{"a":1,"b":[2]}');
  const indent = formatJson({ json: '{"a":1}', indent: 4 });
  assert.match(textOf(indent), /\n {4}"a"/);
  assert.equal(formatJson({ json: "{" }).isError, true);
});

test("fix_json reports the repairs and does not throw on garbage", () => {
  const fixed = fixJson({ json: "{ name: 'Ada', /* note */ age: 36, }" });
  assert.notEqual(fixed.isError, true);
  assert.equal(fixed.structuredContent.valid, true);
  assert.deepEqual(JSON.parse(fixed.structuredContent.json), { name: "Ada", age: 36 });
  assert.ok(fixed.structuredContent.fixes.length >= 2);

  const still = fixJson({ json: "this is not even close { " });
  assert.equal(still.structuredContent.valid, false);
  assert.match(textOf(still), /still invalid|Could not auto-fix/);
});

test("json_path reads a caret offset and a key query", () => {
  const json = '{\n  "user": { "name": "ahmed" }\n}';
  const byOffset = jsonPath({ json, offset: json.indexOf('"name"') + 1 });
  assert.equal(byOffset.structuredContent.path, "user.name");
  const byQuery = jsonPath({ json, query: "ahmed" });
  assert.equal(byQuery.structuredContent.path, "user.name");
  const missing = jsonPath({ json, query: "nope" });
  assert.equal(missing.isError, true);
  const past = jsonPath({ json, offset: json.length + 5 });
  assert.equal(past.isError, true);
  assert.match(textOf(past), /past the end/);
});

test("browse_json outlines paths and honors a depth cap", () => {
  const outline = browseJson({ json: before });
  assert.match(textOf(outline), /user\.name/);
  assert.match(textOf(outline), /tags\[0\]/);
  const shallow = browseJson({ json: before, maxDepth: 0 });
  assert.equal(shallow.structuredContent.nodes.length, 1);
  assert.equal(browseJson({ json: before, maxNodes: 0 }).isError, true);
});

test("compare_json explains the sample and rejects invalid input", () => {
  const result = compareJson({ before, after });
  assert.match(textOf(result), /Updated property 'age' from 30 to 31/);
  assert.equal(result.structuredContent.summary.updated >= 1, true);
  assert.ok(result.structuredContent.events.some((e) => e.path === "user.age"));

  const filtered = compareJson({ before, after, query: "tags", operations: ["ADD"] });
  assert.match(textOf(filtered), /Added a new item/);
  assert.ok(filtered.structuredContent.events.every((e) => e.operation === "ADD"));

  const same = compareJson({ before, after: before });
  assert.match(textOf(same), /identical/);
  assert.equal(same.structuredContent.summary.total, 0);

  const bad = compareJson({ before: "{", after: "{}" });
  assert.equal(bad.isError, true);
  assert.match(textOf(bad), /before: Invalid JSON/);
  assert.doesNotMatch(textOf(bad), /TypeError/);

  const strategy = compareJson({ before: "[1,2]", after: "[0,1,2]", arrayStrategy: "index" });
  assert.match(textOf(strategy), /Updated item at index 0/);

  const ignored = compareJson({
    before: '{"user":{"age":1,"name":"a"}}',
    after: '{"user":{"age":2,"name":"b"}}',
    ignoredPaths: ["user.age"],
  });
  assert.doesNotMatch(textOf(ignored), /property 'age'/);
  assert.match(textOf(ignored), /property 'name'/);
});

test("compare_json enforces the size limit without crashing", () => {
  const huge = "{" + '"k":"' + "x".repeat(LIMITS.maxJsonChars) + '"}';
  const result = compareJson({ before: huge, after: "{}" });
  assert.equal(result.isError, true);
  assert.match(textOf(result), /exceeds the limit|above the limit/);
});

test("export_json_changes renders each format", () => {
  const markdown = exportJsonChanges({ before, after, format: "markdown" });
  assert.match(textOf(markdown), /# JSON Kit Report/);
  const csv = exportJsonChanges({ before, after, format: "csv" });
  assert.match(textOf(csv), /Operation,Path,Property/);
  const json = exportJsonChanges({ before, after, format: "json" });
  assert.equal(JSON.parse(json.structuredContent.export).user.age, 31);
  assert.equal(exportJsonChanges({ before, after, format: "yaml" }).isError, true);
});

test("visual_diff_json annotates the tree", () => {
  const diff = visualDiffJson({ before, after });
  assert.match(textOf(diff), /\+ /);
  assert.match(textOf(diff), /- /);
  assert.match(textOf(diff), /Ignored paths are not applied/);
  assert.equal(visualDiffJson({ before: "[]", after: "{" }).isError, true);
});
