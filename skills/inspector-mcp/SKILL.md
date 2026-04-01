---
name: inspector-mcp
description: Debug a live Node.js process via CDP — connect to --inspect, set TypeScript breakpoints, step through code, and inspect variables at runtime. Use when the user mentions debugging, --inspect port, breakpoints, wants to trace a bug, inspect what a variable holds, or understand why code behaves unexpectedly at runtime.
argument-hint: "[port]"
---

# Inspector MCP Debug

You have access to a full Node.js debugger via Chrome DevTools Protocol (CDP). You can connect to any running Node.js process started with `--inspect`, set breakpoints on TypeScript source files, step through execution, inspect variables, and read console output.

## Step 0 — Load the tools (required before anything else)

All inspector tools are deferred. Load them all at once:

```
ToolSearch: select:mcp__inspector__debug_connect,mcp__inspector__debug_disconnect,mcp__inspector__debug_list_sessions,mcp__inspector__debug_read_console,mcp__inspector__debug_clear_console,mcp__inspector__debug_set_breakpoint,mcp__inspector__debug_remove_breakpoint,mcp__inspector__debug_list_breakpoints,mcp__inspector__debug_continue,mcp__inspector__debug_pause,mcp__inspector__debug_step_over,mcp__inspector__debug_step_into,mcp__inspector__debug_step_out,mcp__inspector__debug_stack_trace,mcp__inspector__debug_get_variables,mcp__inspector__debug_evaluate,mcp__inspector__debug_get_properties
```

## Workflow

### 1. Connect
```
debug_connect({ host: "localhost", port: 9229 })
```
- Default port is `9229`. Next.js dev uses `9230`.
- If already connected, returns the existing session — no error.
- Save the `session_id` — required for every subsequent call.

### 2. Read existing console output (optional but useful)
```
debug_read_console({ session_id, level: "all", limit: 50 })
```
Do this before setting breakpoints to understand what the process is already doing.

### 3. Set a breakpoint
```
debug_set_breakpoint({ session_id, file_path: "/abs/path/to/src/server.ts", line_number: 42 })
```

**Check the response:**
- `verified: true` → breakpoint is live. The process will pause when execution reaches that line.
- `verified: false` → source map resolution failed. See pitfalls below.

### 4. Wait for pause

Poll `debug_list_sessions` until `status === "paused"`. Do not call `debug_get_variables` or `debug_evaluate` before this — they require a paused process and will return an error.

### 5. Inspect

Once paused, use any combination of:

| Tool | When to use |
|---|---|
| `debug_stack_trace` | See the full call stack with TypeScript file paths and line numbers |
| `debug_get_variables` | Inspect variables in scope (`scope_filter: "local"` to start) |
| `debug_evaluate` | Evaluate any JS expression in the current frame |
| `debug_get_properties` | Drill into a nested object (use the `objectId` from `get_variables`) |

### 6. Step through code (optional)

| Tool | Effect |
|---|---|
| `debug_step_over` | Execute next line, skip into function bodies |
| `debug_step_into` | Enter the next function call |
| `debug_step_out` | Run until the current function returns |
| `debug_continue` | Resume until the next breakpoint |

After each step call `debug_stack_trace` + `debug_get_variables` to see updated state.

### 7. Clean up
```
debug_continue({ session_id })    // resume if still paused
debug_disconnect({ session_id })  // close the session when done
```

---

## Critical Pitfalls

### Pitfall 1 — `evaluate` / `get_variables` require a PAUSED process

Calling these while the process is running returns:
```
MCP error -32600: Session is 'connected'. Pause execution or wait for a breakpoint to pause it.
```
**Fix:** Always check `status === "paused"` via `debug_list_sessions` before calling inspection tools.

---

### Pitfall 2 — Breakpoint returns `verified: false`

Source map resolution requires the compiled `.js` file to have a `//# sourceMappingURL=` comment or a sibling `.js.map` file. If `verified: false`, execution will never pause there.

**Fix A — use the compiled `.js` path:**
Find the equivalent line in `build/` or `dist/`. TypeScript annotations are stripped during compilation so line numbers shift slightly (usually -1 to -3 lines).

**Fix B — verify source maps exist:**
```
ls build/server.js.map       # external map
grep sourceMappingURL build/server.js  # or inline map
```

**Fix C — set the breakpoint on the `.js` file with a condition:**
```
debug_set_breakpoint({ session_id, file_path: "/abs/path/build/server.js", line_number: 38, condition: "userId === undefined" })
```

---

### Pitfall 3 — Port mismatch / ECONNREFUSED

| Runtime | Default `--inspect` port |
|---|---|
| `node --inspect` | 9229 |
| Next.js (`NODE_OPTIONS='--inspect'`) | 9230 |
| nodemon | 9229 |

If `debug_connect` fails with `ECONNREFUSED`, the process is not running with `--inspect` or is on a different port. Ask the user to confirm with:
```sh
node --inspect src/index.js
# or
NODE_OPTIONS='--inspect' next dev
```

---

### Pitfall 4 — Nested objects show as `[Object]`

`debug_get_variables` returns shallow previews. To see the full contents of a nested object, take its `objectId` from the response and call:
```
debug_get_properties({ session_id, object_id: "obj-123", own_properties: true })
```

---

## Tips

- **Conditional breakpoints** — pass `condition: "count > 100"` to `debug_set_breakpoint` to only pause when a predicate is true. Avoids stepping through hot loops.
- **Console filter** — `debug_read_console({ session_id, level: "error" })` cuts through noise.
- **Inspect a caller's frame** — `debug_get_variables` accepts `frame_index` (0 = innermost). Increment to inspect the caller's scope.
- **Auto-reconnect** — set `auto_reconnect: true` in `debug_connect`. If the process restarts, the session reconnects automatically and breakpoints are re-registered.
- **Evaluate side-effect-free expressions** — prefer `return_by_value: true` in `debug_evaluate` for primitives; it avoids creating remote object references that must be garbage-collected.
