#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SessionManager } from './session/session-manager.js';
import { registerBreakpointTools } from './tools/breakpoints.js';
import { registerConnectionTools } from './tools/connection.js';
import { registerConsoleTools } from './tools/console.js';
import { registerExecutionTools } from './tools/execution.js';
import { registerInspectionTools } from './tools/inspection.js';

const server = new McpServer({
  name: 'inspector-mcp',
  version: '0.1.0',
});

const sessionManager = new SessionManager();

registerConnectionTools(server, sessionManager);
registerConsoleTools(server, sessionManager);
registerBreakpointTools(server, sessionManager);
registerExecutionTools(server, sessionManager);
registerInspectionTools(server, sessionManager);

const transport = new StdioServerTransport();
await server.connect(transport);
