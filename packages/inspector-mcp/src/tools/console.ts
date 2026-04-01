import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toMcpError } from '../errors.js';
import type { SessionManager } from '../session/session-manager.js';

export function registerConsoleTools(
  server: McpServer,
  sessionManager: SessionManager,
): void {
  server.tool(
    'debug_read_console',
    'Read console log entries captured from the Node.js process. Supports filtering by level and text.',
    {
      session_id: z.string().describe('Session ID, e.g. "localhost:9229"'),
      level: z
        .enum(['log', 'info', 'warn', 'error', 'debug', 'all'])
        .default('all')
        .describe('Filter by log level'),
      filter: z
        .string()
        .optional()
        .describe('Text substring to search for in log messages'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .default(100)
        .describe('Maximum number of entries to return'),
      offset: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe('Number of matching entries to skip (for pagination)'),
    },
    async ({ session_id, level, filter, limit, offset }) => {
      try {
        const session = sessionManager.get(session_id);
        const result = session.readConsole({ level, filter, limit, offset });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );

  server.tool(
    'debug_clear_console',
    'Clear the console log buffer for a session.',
    {
      session_id: z.string().describe('Session ID, e.g. "localhost:9229"'),
    },
    async ({ session_id }) => {
      try {
        const session = sessionManager.get(session_id);
        const count = session.clearConsole();
        return {
          content: [
            {
              type: 'text',
              text: `Console buffer cleared (${count} entries removed)`,
            },
          ],
        };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );
}
