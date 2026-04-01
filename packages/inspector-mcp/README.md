# inspector-mcp

> A full Node.js debugger for AI agents, powered by Chrome DevTools Protocol.

[![npm version](https://img.shields.io/npm/v/inspector-mcp?style=flat-square)](https://www.npmjs.com/package/inspector-mcp)
[![npm downloads](https://img.shields.io/npm/dm/inspector-mcp?style=flat-square)](https://www.npmjs.com/package/inspector-mcp)
[![CI](https://img.shields.io/github/actions/workflow/status/AbianS/inspector-mcp/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/AbianS/inspector-mcp/actions)
[![Node >=18](https://img.shields.io/node/v/inspector-mcp?style=flat-square)](https://nodejs.org)
[![License: MIT](https://img.shields.io/npm/l/inspector-mcp?style=flat-square)](LICENSE)

---

Your AI can already read and write code. With `inspector-mcp` it can also **run it, pause it, and look inside it**.

Connect any MCP-compatible AI agent to a running Node.js process. Set breakpoints on your TypeScript source files, step through execution line by line, inspect every variable in scope, and read console output — all through natural language, without leaving your AI chat.

---

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Setup](#setup)
- [Make your AI smarter with the skill](#make-your-ai-smarter-with-the-skill)
- [Available tools](#available-tools)
- [How it works](#how-it-works)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Features

- **Source-map aware breakpoints** — set breakpoints using your `.ts` file paths; the server resolves them to the compiled `.js` positions automatically
- **Full step execution** — step over, step into, step out, continue
- **Variable inspection** — local, closure, and global scope; drill into nested objects
- **Expression evaluation** — run any JS expression in the context of the paused frame
- **Console buffer** — last 1,000 log entries, filterable by level and text
- **Auto-reconnect** — survives process restarts and re-registers all breakpoints automatically
- **Works with any MCP client** — Claude Desktop, Cursor, VS Code, or any client supporting MCP stdio transport

---

## Requirements

- **Node.js ≥ 18**
- Your app running with `--inspect` or `--inspect-brk`
- An [MCP-compatible AI client](https://modelcontextprotocol.io/clients)

---

## Installation

**Try it without installing:**

```sh
npx inspector-mcp
```

**Install globally:**

```sh
npm install -g inspector-mcp
```

---

## Setup

### 1. Start your app in debug mode

```sh
# Node.js
node --inspect src/server.js

# Next.js
NODE_OPTIONS='--inspect' next dev

# nodemon
nodemon --inspect src/server.js

# Pause on first line (useful for startup bugs)
node --inspect-brk src/server.js
```

### 2. Register the MCP server with your AI client

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "inspector": {
      "command": "npx",
      "args": ["inspector-mcp"]
    }
  }
}
```

**Cursor / VS Code** (`.cursor/mcp.json` or `.vscode/mcp.json`):

```json
{
  "servers": {
    "inspector": {
      "command": "npx",
      "args": ["inspector-mcp"]
    }
  }
}
```

**Claude Code** (`.mcp.json` at your project root):

```json
{
  "mcpServers": {
    "inspector": {
      "type": "stdio",
      "command": "npx",
      "args": ["inspector-mcp"]
    }
  }
}
```

### 3. Ask your AI to debug

Once the MCP server is connected, describe the problem in plain language:

```
My /api/users endpoint is returning 500. Connect to the process on port 9229,
set a breakpoint at line 34 of src/routes/users.ts, and tell me what the
database query result looks like when the error happens.
```

The agent will connect, set the breakpoint, wait for the pause, and report back with the actual values — no extra tooling needed.

---

## Make your AI smarter with the skill

The [`skills/inspector-mcp/SKILL.md`](https://github.com/AbianS/inspector-mcp/blob/main/skills/inspector-mcp/SKILL.md) file in this repo is a ready-to-use skill that teaches your AI exactly how to use this tool — the correct workflow order, pitfalls to avoid, and advanced tips.

Add it to your project so your AI agent picks it up automatically:

```sh
mkdir -p .claude/skills/inspector-mcp
curl -o .claude/skills/inspector-mcp/SKILL.md \
  https://raw.githubusercontent.com/AbianS/inspector-mcp/main/skills/inspector-mcp/SKILL.md
```

Once in place, your AI will know how to connect, set breakpoints, and inspect variables correctly — without you having to explain it every time.

---

## Available tools

### 🔌 Connection

| Tool | Description |
|---|---|
| `debug_connect` | Connect to a Node.js process. Accepts `host`, `port`, and `auto_reconnect`. |
| `debug_disconnect` | Close a session. |
| `debug_list_sessions` | List active sessions and their status (`connecting` / `connected` / `paused` / `reconnecting`). |

### 🔴 Breakpoints

| Tool | Description |
|---|---|
| `debug_set_breakpoint` | Set a breakpoint on a `.ts` or `.js` file. Supports `condition` for conditional breaks. |
| `debug_remove_breakpoint` | Remove a breakpoint by its ID. |
| `debug_list_breakpoints` | List all breakpoints and whether they are verified (will trigger) or not. |

### ▶️ Execution

| Tool | Description |
|---|---|
| `debug_continue` | Resume until the next breakpoint. |
| `debug_pause` | Pause at the next statement. |
| `debug_step_over` | Next line — skip into function bodies. |
| `debug_step_into` | Enter the next function call. |
| `debug_step_out` | Run until the current function returns. |

### 🔍 Inspection _(requires paused session)_

| Tool | Description |
|---|---|
| `debug_stack_trace` | Current call stack with TypeScript file paths and line numbers. |
| `debug_get_variables` | Variables in scope. Use `scope_filter`: `local`, `closure`, `global`, or `all`. |
| `debug_evaluate` | Evaluate a JS expression in the paused frame. |
| `debug_get_properties` | Expand a nested object using its `objectId` from `get_variables`. |

### 📋 Console

| Tool | Description |
|---|---|
| `debug_read_console` | Read buffered logs. Filter by `level` and `filter` text; paginate with `limit` / `offset`. |
| `debug_clear_console` | Clear the buffer. |

---

## How it works

```
Your AI ──(MCP / stdio)──► inspector-mcp ──(CDP / WebSocket)──► node --inspect
                                  │
                            source maps
                           (.ts ↔ .js)
```

`inspector-mcp` is a stdio MCP server. On `debug_connect` it opens a WebSocket to the Chrome DevTools Protocol endpoint that Node.js exposes on the `--inspect` port. Source maps are read from the compiled output to translate between TypeScript source positions and the generated JavaScript that's actually running. Console output is captured into a ring buffer as events arrive.

---

## Troubleshooting

**`ECONNREFUSED` on connect**

The process is not running with `--inspect`, or is on a different port. Restart with:
```sh
node --inspect src/server.js   # port 9229
NODE_OPTIONS='--inspect' next dev  # port 9230
```

**Breakpoint is `verified: false` and never triggers**

Source maps are missing or the compiled file doesn't exist. Run a build first, then check:
```sh
ls build/server.js.map                # external source map
grep sourceMappingURL build/server.js # inline source map
```
As a fallback, set the breakpoint on the `.js` file in `build/` directly and adjust the line number — TypeScript strips type annotations so lines shift by 1–3.

**`get_variables` / `evaluate` return error `-32600`**

The session is not paused. These tools only work when the process is stopped at a breakpoint. Verify with `debug_list_sessions` that `status === "paused"`.

**Variables show as `[Object]`**

`debug_get_variables` returns shallow previews. Use `debug_get_properties` with the `objectId` to expand nested values.

---

## License

MIT © [Abian Suarez](https://github.com/AbianS)
