import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { loadCore } from "../src/load-core.js";

const core = loadCore();
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const sampleBefore = {
  user: {
    profile: {
      name: "ahmed",
      age: 30,
      address: { city: "Dubai", zip: 12345, geo: { lat: 25.2, lng: 55.3 } },
    },
    tags: ["a", "b"],
    items: [{ id: 1, name: "item1", meta: { x: 1 } }, { id: 2, name: "item2" }],
  },
  status: "active",
  count: 5,
};
const sampleAfter = {
  user: {
    profile: {
      name: "ahmed",
      age: 31,
      address: { city: "Abu Dhabi", geo: { lat: 25.2, lng: 55.4, alt: 10 } },
    },
    tags: ["b", "c"],
    items: [{ id: 1, name: "item1-updated", meta: { x: 2 } }, { id: 3, name: "item3" }],
  },
  status: "inactive",
  count: "five",
  extra: { level1: { level2: { level3: { level4: { level5: "deep" } } } } },
};

test("sample comparison matches the web app's event descriptions", () => {
  const events = core.compareAll(sampleBefore, sampleAfter, {});
  assert.deepEqual(events.map((e) => e.description), [
    "Updated property 'status' from \"active\" to \"inactive\" at path root.",
    "Changed property 'count' from number 5 to string \"five\" at path root.",
    'Added property \'extra\' with value {"level1":{"level2":{"level3":{"level4":{"level5":"deep"}}}}} at path root.',
    "Updated property 'id' from 2 to 3 at path user.items[1].",
    'Updated property \'name\' from "item2" to "item3" at path user.items[1].',
    'Updated property \'name\' from "item1" to "item1-updated" at path user.items[0].',
    "Updated property 'x' from 1 to 2 at path user.items[0].meta.",
    'Removed value "a" at index 0 from array tags.',
    "Added a new item at index 1 in array tags.",
    "Updated property 'age' from 30 to 31 at path user.profile.",
    'Updated property \'city\' from "Dubai" to "Abu Dhabi" at path user.profile.address.',
    "Removed property 'zip' from path user.profile.address.",
    "Updated property 'lng' from 55.3 to 55.4 at path user.profile.address.geo.",
    "Added property 'alt' with value 10 at path user.profile.address.geo.",
  ]);
});

test("identical documents produce no events", () => {
  assert.deepEqual(core.compareAll({ a: 1 }, { a: 1 }, {}), []);
});

test("array strategies: identity reorder, index insert, and primitive LCS", () => {
  assert.deepEqual(
    core.compareAll([{ id: 1, n: "a" }, { id: 2, n: "b" }], [{ id: 2, n: "b" }, { id: 1, n: "a" }], {}),
    []
  );
  const indexed = core.compareAll([1, 2], [0, 1, 2], { arrayStrategy: "index" });
  assert.deepEqual(indexed.map((e) => e.operation), ["UPDATE", "UPDATE", "ADD"]);
  const lcs = core.compareAll(["a", "b", "c"], ["b", "c", "d"], { arrayStrategy: "auto" });
  assert.deepEqual(lcs.map((e) => `${e.operation} ${e.path}`), ["REMOVE [0]", "ADD [2]"]);
});

test("ignored paths skip a field and accept a newline-separated string", () => {
  const events = core.compareAll(
    { user: { age: 1, name: "a" } },
    { user: { age: 2, name: "b" } },
    { ignoredPaths: "user.age" }
  );
  assert.deepEqual(events.map((e) => e.property), ["name"]);
  const wildcard = core.compareAll(
    { users: [{ id: 1, lastSeen: 1, name: "a" }] },
    { users: [{ id: 1, lastSeen: 9, name: "b" }] },
    { ignoredPaths: ["users[*].lastSeen"] }
  );
  assert.deepEqual(wildcard.map((e) => e.property), ["name"]);
});

test("type changes and root primitive updates", () => {
  const typed = core.compareAll({ a: 1 }, { a: "1" }, {});
  assert.equal(typed[0].operation, "TYPE_CHANGE");
  assert.equal(typed[0].oldType, "number");
  assert.equal(typed[0].newType, "string");
  const root = core.compareAll(1, 2, {});
  assert.equal(root[0].operation, "UPDATE");
  assert.equal(root[0].path, "root");
});

test("full paths quote keys that are not identifiers", () => {
  assert.equal(core.eventFullPath({ path: "user.profile", property: "age" }), "user.profile.age");
  assert.equal(core.eventFullPath({ path: "root", property: "status" }), "status");
  assert.equal(core.eventFullPath({ path: "tags[0]", property: null }), "tags[0]");
  assert.equal(core.eventFullPath({ path: "root", property: "a.b" }), '["a.b"]');
  assert.equal(core.findPathInJson({ "a.b": { c: 1 } }, "a.b"), '["a.b"]');
  assert.equal(core.findPathInJson({ user: { name: "ahmed" } }, "name"), "user.name");
});

test("path at a caret offset", () => {
  const text = '{\n  "user": { "name": "ahmed" }\n}';
  const name = text.indexOf('"name"');
  assert.equal(core.findPathAtOffset(text, name + 1), "user.name");
  const value = text.indexOf("ahmed");
  assert.equal(core.findPathAtOffset(text, value), "user.name");
});

test("parseJson reports line and column and rejects empty input", () => {
  assert.equal(core.parseJson("  ").ok, false);
  assert.match(core.parseJson("  ").error, /empty/i);
  const bad = core.parseJson("{\n  ");
  assert.equal(bad.ok, false);
  assert.equal(bad.line, 2);
  assert.ok(bad.column > 0);
  assert.match(bad.error, /Invalid JSON at line 2, column/);
  const good = core.parseJson('{"a":1}');
  assert.equal(good.ok, true);
  assert.deepEqual(good.value, { a: 1 });
});

test("format and compact match JSON.stringify", () => {
  assert.equal(core.formatJson('{"a":1}').json, JSON.stringify({ a: 1 }, null, 2));
  assert.equal(core.compactJson('{\n  "a": 1\n}').json, '{"a":1}');
  assert.equal(core.formatJson("{").ok, false);
  assert.equal(core.formatJson("{}", 11).ok, false);
});

test("auto-fix repairs common mistakes without corrupting escaped backslashes", () => {
  const trailing = core.fixJson('{ "a": 1, }');
  assert.deepEqual(JSON.parse(trailing.fixed), { a: 1 });
  assert.ok(trailing.fixes.some((f) => /trailing commas/i.test(f)));

  const comments = core.fixJson('{ "a": 1, /* hide */ "b": 2 }');
  assert.deepEqual(JSON.parse(comments.fixed), { a: 1, b: 2 });

  const single = core.fixJson("{'a': 'b'}");
  assert.deepEqual(JSON.parse(single.fixed), { a: "b" });

  const bare = core.fixJson("{a: 1}");
  assert.deepEqual(JSON.parse(bare.fixed), { a: 1 });

  const nan = core.fixJson("{ \"a\": NaN }");
  assert.equal(JSON.parse(nan.fixed).a, null);

  const open = core.fixJson('{ "a": [1, 2');
  assert.deepEqual(JSON.parse(open.fixed), { a: [1, 2] });

  const already = core.fixJson('{"a":1}');
  assert.equal(already.fixed, '{"a":1}');
  assert.deepEqual(already.fixes, []);

  const windowsPath = core.fixJson('{"path":"C:\\\\",\t"next":1}');
  assert.deepEqual(JSON.parse(windowsPath.fixed), { path: "C:\\", next: 1 });

  const multiline = core.fixJson('{ "a": "hello\nworld" }');
  assert.equal(JSON.parse(multiline.fixed).a, "hello\nworld");
});

test("filter, summary, group, and exports are projections of the event list", () => {
  const events = core.compareAll(sampleBefore, sampleAfter, {});
  const summary = core.summarizeEvents(events);
  assert.equal(summary.total, events.length);
  assert.equal(summary.added + summary.removed + summary.updated + summary.typeChanges, summary.total);
  const age = core.filterEvents(events, { query: "age" });
  assert.ok(age.length >= 1);
  assert.ok(age.every((e) => /age/i.test(e.description)));
  const adds = core.filterEvents(events, { operations: ["ADD"] });
  assert.ok(adds.every((e) => e.operation === "ADD"));
  const groups = core.groupEvents(events, "path");
  assert.ok(groups.some((g) => g.key === "user.profile"));
  const markdown = core.exportEvents(events, "markdown");
  assert.match(markdown, /^# JSON Kit Report/);
  assert.match(markdown, /Total changes: \d+/);
  const csv = core.exportEvents(events, "csv");
  assert.ok(csv.startsWith("Operation,Path,Property,Old Value,New Value,Old Type,New Type,Description"));
  const json = JSON.parse(core.exportEvents(events, "json"));
  assert.equal(json.status, "inactive");
  assert.equal(json.user.profile.address.zip.__removed__, true);
  assert.equal(core.exportEvents(events, "nope"), null);
});

test("visual tree marks added and removed values and outlines a document", () => {
  const html = core.renderVisualTree({ a: 1 }, { a: 2, b: true }, { arrayStrategy: "auto", identityKey: "id" });
  assert.match(html, /tree-modified/);
  assert.match(html, /tree-added/);
  const text = core.renderVisualTreeText({ a: 1, tags: ["a"] }, { a: 1, tags: ["b"] }, {});
  assert.match(text, /"tags"/);
  const outline = core.outlineJson({ user: { name: "ahmed" }, tags: ["a"] }, { maxDepth: 2 });
  assert.deepEqual(outline.nodes.map((n) => n.path), ["root", "user", "user.name", "tags", "tags[0]"]);
  const capped = core.outlineJson({ a: { b: { c: 1 } } }, { maxDepth: 0, maxNodes: 10 });
  assert.equal(capped.nodes.length, 1);
  assert.equal(capped.nodes[0].collapsed, true);
});

test("classic script installs JsonKit on the global object", () => {
  const code = readFileSync(join(root, "core", "json-kit.js"), "utf8");
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  assert.equal(typeof sandbox.JsonKit.compareAll, "function");
  assert.equal(sandbox.module, undefined);
});

test("the web page still targets /json-kit/ and loads the core with a relative URL", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  assert.match(html, /href="https:\/\/mo3ta\.top\/json-kit\/"/);
  assert.match(html, /src="core\/json-kit\.js"/);
  assert.doesNotMatch(html, /<base\b/i);
  assert.doesNotMatch(html, /src="\/core\//);
  assert.doesNotMatch(html, /self\.onmessage/);
  assert.doesNotMatch(html, /<script type="text\/plain" id="worker-code">/);
});
