import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DEFAULT_HOST, DEFAULT_PORT } from '../constants.js';
import { toMcpError } from '../errors.js';
import type { SessionManager } from '../session/session-manager.js';

export function registerConnectionTools(
  server: McpServer,
  sessionManager: SessionManager,
): void {
  server.tool(
    'debug_connect',
    'Connect to a running Node.js process via Chrome DevTools Protocol. The process must be started with --inspect or --inspect-brk.',
    {
      host: z
        .string()
        .default(DEFAULT_HOST)
        .describe('Hostname of the Node.js debug server'),
      port: z
        .number()
        .int()
        .min(1)
        .max(65535)
        .default(DEFAULT_PORT)
        .describe('CDP port (default 9229 for --inspect, 9230 for Next.js)'),
      auto_reconnect: z
        .boolean()
        .default(true)
        .describe('Automatically reconnect when the process restarts'),
    },
    async ({ host, port, auto_reconnect }) => {
      try {
        const session = await sessionManager.connect(
          host,
          port,
          auto_reconnect,
        );
        return {
          content: [
            { type: 'text', text: JSON.stringify(session.info, null, 2) },
          ],
        };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );

  server.tool(
    'debug_disconnect',
    'Disconnect from a Node.js debug session and remove it.',
    {
      session_id: z
        .string()
        .describe('Session ID in the form "host:port", e.g. "localhost:9229"'),
    },
    async ({ session_id }) => {
      try {
        await sessionManager.disconnect(session_id);
        return {
          content: [{ type: 'text', text: `Disconnected from ${session_id}` }],
        };
      } catch (err) {
        throw toMcpError(err);
      }
    },
  );

  server.tool(
    'debug_list_sessions',
    'List all active debug sessions with their current status.',
    {},
    async () => {
      const sessions = sessionManager.listAll().map((s) => s.info);
      return {
        content: [{ type: 'text', text: JSON.stringify(sessions, null, 2) }],
      };
    },
  );
}
