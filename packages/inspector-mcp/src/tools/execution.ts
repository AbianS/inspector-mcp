import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toMcpError } from '../errors.js';
import type { SessionManager } from '../session/session-manager.js';

const sessionIdSchema = {
  session_id: z.string().describe('Session ID, e.g. "localhost:9229"'),
};

export function registerExecutionTools(
  server: McpServer,
  sessionManager: SessionManager,
): void {
  server.tool(
    'debug_continue',
    'Resume execution after a breakpoint or pause. Requires the session to be paused.',
    sessionIdSchema,
    async ({ session_id }) => {
      try {
        const session = sessionManager.get(session_id);
        await session.resume();
        return { content: [{ type: 'text', text: 'Execution resumed' }] };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );

  server.tool(
    'debug_step_over',
    'Execute the next line without entering function calls (step over). Requires the session to be paused.',
    sessionIdSchema,
    async ({ session_id }) => {
      try {
        const session = sessionManager.get(session_id);
        await session.stepOver();
        return { content: [{ type: 'text', text: 'Stepped over' }] };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );

  server.tool(
    'debug_step_into',
    'Step into the next function call. Requires the session to be paused.',
    sessionIdSchema,
    async ({ session_id }) => {
      try {
        const session = sessionManager.get(session_id);
        await session.stepInto();
        return { content: [{ type: 'text', text: 'Stepped into' }] };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );

  server.tool(
    'debug_step_out',
    'Continue execution until the current function returns (step out). Requires the session to be paused.',
    sessionIdSchema,
    async ({ session_id }) => {
      try {
        const session = sessionManager.get(session_id);
        await session.stepOut();
        return { content: [{ type: 'text', text: 'Stepped out' }] };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );

  server.tool(
    'debug_pause',
    'Pause execution at the next JavaScript statement. Works when the session is running.',
    sessionIdSchema,
    async ({ session_id }) => {
      try {
        const session = sessionManager.get(session_id);
        await session.pauseExecution();
        return {
          content: [
            {
              type: 'text',
              text: 'Pause requested — execution will halt at the next statement',
            },
          ],
        };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );
}
