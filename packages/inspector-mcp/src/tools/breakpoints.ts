import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BreakpointNotFoundError, toMcpError } from '../errors.js';
import type { SessionManager } from '../session/session-manager.js';

export function registerBreakpointTools(
  server: McpServer,
  sessionManager: SessionManager,
): void {
  server.tool(
    'debug_set_breakpoint',
    'Set a breakpoint at a specific line in a TypeScript source file. The session must be connected. Uses source maps to translate .ts paths to compiled .js locations.',
    {
      session_id: z.string().describe('Session ID, e.g. "localhost:9229"'),
      file_path: z
        .string()
        .describe(
          'Absolute path to the TypeScript source file, e.g. /project/src/server.ts',
        ),
      line_number: z
        .number()
        .int()
        .min(1)
        .describe('Line number in the source file (1-based)'),
      column_number: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe('Column number (0-based, default 0)'),
      condition: z
        .string()
        .optional()
        .describe(
          'JavaScript expression that must be truthy for the breakpoint to pause',
        ),
    },
    async ({
      session_id,
      file_path,
      line_number,
      column_number,
      condition,
    }) => {
      try {
        const session = sessionManager.get(session_id);
        const bp = await session.setBreakpoint({
          filePath: file_path,
          lineNumber: line_number,
          columnNumber: column_number,
          condition,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(bp, null, 2) }],
        };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );

  server.tool(
    'debug_remove_breakpoint',
    'Remove a breakpoint by its ID.',
    {
      session_id: z.string().describe('Session ID, e.g. "localhost:9229"'),
      breakpoint_id: z
        .string()
        .describe('Breakpoint ID returned by debug_set_breakpoint'),
    },
    async ({ session_id, breakpoint_id }) => {
      try {
        const session = sessionManager.get(session_id);
        const bp = session
          .listBreakpoints()
          .find((b) => b.id === breakpoint_id);
        if (!bp) throw new BreakpointNotFoundError(breakpoint_id);
        await session.removeBreakpoint(breakpoint_id);
        return {
          content: [
            { type: 'text', text: `Breakpoint ${breakpoint_id} removed` },
          ],
        };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );

  server.tool(
    'debug_list_breakpoints',
    'List all breakpoints set in a session.',
    {
      session_id: z.string().describe('Session ID, e.g. "localhost:9229"'),
    },
    async ({ session_id }) => {
      try {
        const session = sessionManager.get(session_id);
        const bps = session.listBreakpoints();
        return {
          content: [{ type: 'text', text: JSON.stringify(bps, null, 2) }],
        };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );
}
