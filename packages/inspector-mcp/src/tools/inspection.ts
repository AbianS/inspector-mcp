import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toMcpError } from '../errors.js';
import type { SessionManager } from '../session/session-manager.js';

export function registerInspectionTools(
  server: McpServer,
  sessionManager: SessionManager,
): void {
  server.tool(
    'debug_stack_trace',
    'Get the current call stack when execution is paused. Returns frames with source-map-translated TypeScript file paths and line numbers.',
    {
      session_id: z.string().describe('Session ID, e.g. "localhost:9229"'),
    },
    async ({ session_id }) => {
      try {
        const session = sessionManager.get(session_id);
        const frames = session.getStackTrace();
        return {
          content: [{ type: 'text', text: JSON.stringify(frames, null, 2) }],
        };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );

  server.tool(
    'debug_get_variables',
    'Get variables in scope at the current pause point. Returns names, values, types, and object IDs for expandable objects.',
    {
      session_id: z.string().describe('Session ID, e.g. "localhost:9229"'),
      frame_index: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe('Stack frame index (0 = top/current frame)'),
      scope_filter: z
        .enum(['local', 'closure', 'global', 'all'])
        .default('local')
        .describe('Which scope chain entries to include'),
    },
    async ({ session_id, frame_index, scope_filter }) => {
      try {
        const session = sessionManager.get(session_id);
        const vars = await session.getVariables(frame_index, scope_filter);
        return {
          content: [{ type: 'text', text: JSON.stringify(vars, null, 2) }],
        };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );

  server.tool(
    'debug_evaluate',
    'Evaluate a JavaScript expression in the context of a paused call frame. Can access local variables, call functions, etc.',
    {
      session_id: z.string().describe('Session ID, e.g. "localhost:9229"'),
      expression: z
        .string()
        .describe(
          'JavaScript expression to evaluate, e.g. "user.name" or "arr.length"',
        ),
      frame_index: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe('Stack frame to evaluate in (0 = top frame)'),
      return_by_value: z
        .boolean()
        .default(true)
        .describe(
          'Return the primitive value directly. Set false to get an object ID for drill-down.',
        ),
    },
    async ({ session_id, expression, frame_index, return_by_value }) => {
      try {
        const session = sessionManager.get(session_id);
        const result = await session.evaluate(
          expression,
          frame_index,
          return_by_value,
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );

  server.tool(
    'debug_get_properties',
    'Inspect properties of an object returned from debug_get_variables or debug_evaluate. Pass the objectId to drill into nested objects.',
    {
      session_id: z.string().describe('Session ID, e.g. "localhost:9229"'),
      object_id: z
        .string()
        .describe(
          'objectId from a VariableInfo or EvalResult with isExpandable=true',
        ),
      own_properties: z
        .boolean()
        .default(true)
        .describe('Only show own properties (exclude prototype chain)'),
    },
    async ({ session_id, object_id, own_properties }) => {
      try {
        const session = sessionManager.get(session_id);
        const props = await session.getProperties(object_id, own_properties);
        return {
          content: [{ type: 'text', text: JSON.stringify(props, null, 2) }],
        };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );
}
