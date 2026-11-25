import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toolDefinitions } from "./tools.js";

const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8")
);

export function createServer() {
  const server = new McpServer(
    { name: "json-kit", version: pkg.version },
    { instructions: "JSON Kit runs entirely locally. Pass JSON as text. It compares documents, explains changes, and formats, validates, or repairs JSON. It does not upload anything." }
  );
  for (const tool of toolDefinitions) {
    server.registerTool(tool.name, tool.config, tool.handler);
  }
  return server;
}
