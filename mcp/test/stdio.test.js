import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("stdio server lists tools and compares JSON", { timeout: 20_000 }, async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../src/cli.js", import.meta.url))],
    stderr: "pipe",
  });
  const client = new Client({ name: "json-kit-test", version: "0.0.0" });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name).sort();
    assert.deepEqual(names, [
      "browse_json",
      "compact_json",
      "compare_json",
      "export_json_changes",
      "fix_json",
      "format_json",
      "json_path",
      "validate_json",
      "visual_diff_json",
    ]);
    const compare = listed.tools.find((tool) => tool.name === "compare_json");
    assert.equal(compare.inputSchema.type, "object");
    assert.ok(compare.inputSchema.properties.before);
    assert.ok(compare.inputSchema.properties.after);

    const valid = await client.callTool({
      name: "validate_json",
      arguments: { json: '{"ok":true}' },
    });
    assert.equal(valid.isError, undefined);
    assert.match(valid.content[0].text, /Valid JSON/);

    const invalid = await client.callTool({
      name: "compare_json",
      arguments: { before: "{", after: "{}" },
    });
    assert.equal(invalid.isError, true);
    assert.match(invalid.content[0].text, /Invalid JSON/);
  } finally {
    await client.close();
  }
});
