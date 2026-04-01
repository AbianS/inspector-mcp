import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

export class InspectorMcpError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'InspectorMcpError';
  }
}

export class SessionNotFoundError extends InspectorMcpError {
  constructor(sessionId: string) {
    super(
      ErrorCode.InvalidParams,
      `Session '${sessionId}' not found. Use debug_list_sessions to see active sessions.`,
    );
    this.name = 'SessionNotFoundError';
  }
}

export class SessionNotPausedError extends InspectorMcpError {
  constructor(status: string) {
    super(
      ErrorCode.InvalidRequest,
      `Session is '${status}'. Pause execution or wait for a breakpoint to pause it.`,
    );
    this.name = 'SessionNotPausedError';
  }
}

export class SessionNotConnectedError extends InspectorMcpError {
  constructor(status: string) {
    super(
      ErrorCode.InvalidRequest,
      `Session is '${status}'. Connect to a Node.js process first.`,
    );
    this.name = 'SessionNotConnectedError';
  }
}

export class CdpConnectionError extends InspectorMcpError {
  constructor(host: string, port: number, cause?: unknown) {
    super(
      ErrorCode.InternalError,
      `Cannot connect to ${host}:${port}. Ensure Node.js is running with --inspect or --inspect-brk.`,
      cause,
    );
    this.name = 'CdpConnectionError';
  }
}

export class BreakpointNotFoundError extends InspectorMcpError {
  constructor(id: string) {
    super(ErrorCode.InvalidParams, `Breakpoint '${id}' not found.`);
    this.name = 'BreakpointNotFoundError';
  }
}

export function toMcpError(err: unknown): McpError {
  if (err instanceof McpError) return err;
  if (err instanceof InspectorMcpError) {
    return new McpError(err.code, err.message);
  }
  const message = err instanceof Error ? err.message : String(err);
  return new McpError(ErrorCode.InternalError, message);
}
