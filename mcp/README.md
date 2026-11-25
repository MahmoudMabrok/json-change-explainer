# json-kit-mcp

MCP server for [JSON Kit](https://mo3ta.top/json-kit/). Agents call the same pure functions as the web app (`core/json-kit.js`): compare two JSON documents and explain every change, format or minify, validate, auto-fix common mistakes, look up a path, outline a document, export a report, or render a visual diff.

Nothing is uploaded. The server speaks [stdio](https://modelcontextprotocol.io) and runs in the client process. It is ready to publish as `json-kit-mcp` (`npx json-kit-mcp`) but this repository does not publish it.

Requires Node.js 18 or newer.

## Tools

| Tool | Purpose |
| --- | --- |
| `validate_json` | Check that text is JSON and report the root type, or the line and column of the parse error. |
| `format_json` | Pretty-print JSON (2-space indent by default, same as the Format button). |
| `compact_json` | Minify JSON, same as the Compact button. |
| `fix_json` | Repair smart quotes, single quotes, comments, commas, unquoted keys, `NaN`/`Infinity`, unclosed brackets, and raw control characters. |
| `json_path` | JSON path at a caret offset, or of the first key or value equal to a query. |
| `browse_json` | Outline of paths, types, and short values (the Browse mode, as text). |
| `compare_json` | Diff two documents. Explains `ADD`, `REMOVE`, `UPDATE`, and `TYPE_CHANGE`, with array strategy, identity key, ignored paths, search, and operation filters. |
| `export_json_changes` | The same diff as descriptions, compact text, Markdown, CSV, or JSON. |
| `visual_diff_json` | Text tree annotated with `+` / `-` / `~`. Ignored paths are not applied, matching the web visual diff. |

Each document is limited to 1,000,000 characters. Comparison results include at most 2,000 events in detail; the summary counts still cover the full diff. Invalid JSON returns an error the model can read. It does not throw.

`compare_json` options:

- `arrayStrategy`: `auto` (default), `index`, or `identity`.
- `identityKey`: property used to pair array items. Default `id`.
- `ignoredPaths`: array of patterns such as `metadata.updatedAt` or `users[*].lastSeen`.
- `query`, `operations` (`ADD`, `REMOVE`, `UPDATE`, `TYPE_CHANGE`), `groupBy` (`path`, `operation`, `none`).

## Run locally

From a clone of this repository:

```bash
cd mcp
npm install
npm test
node src/cli.js
```

`node src/cli.js` waits on stdin for an MCP client. Logs must stay off stdout; the process is quiet until a client connects.

The published command, once the package is on npm, is:

```bash
npx -y json-kit-mcp
```

`npm pack` (and `npm publish`, which this repo does not run) copies `core/json-kit.js` into the package via `prepack`, so the published tarball does not depend on the repository layout. Locally the server reads `core/json-kit.js` directly.

## Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, or `%APPDATA%\Claude\claude_desktop_config.json` on Windows. Use a published install:

```json
{
  "mcpServers": {
    "json-kit": {
      "command": "npx",
      "args": ["-y", "json-kit-mcp"]
    }
  }
}
```

Or this clone, with the absolute path to `mcp/src/cli.js`:

```json
{
  "mcpServers": {
    "json-kit": {
      "command": "node",
      "args": ["/absolute/path/to/json-kit/mcp/src/cli.js"]
    }
  }
}
```

Restart Claude Desktop after saving.

## Cursor

Project file `.cursor/mcp.json`, or the global `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "json-kit": {
      "command": "npx",
      "args": ["-y", "json-kit-mcp"]
    }
  }
}
```

From a clone, point `command` at `node` and `args` at the absolute path of `mcp/src/cli.js`, same as the Claude Desktop local example.

## Claude Code

Published package:

```bash
claude mcp add json-kit -- npx -y json-kit-mcp
```

This clone:

```bash
claude mcp add json-kit -- node /absolute/path/to/json-kit/mcp/src/cli.js
```

## Remote MCP later

The tool handlers do not depend on stdio. A follow-up can expose the same `registerTool` list over Streamable HTTP — for example a Cloudflare Worker on a subdomain of mo3ta.top — without reimplementing the diff. The static site on GitHub Pages would stay as it is. That transport is not part of this package.
