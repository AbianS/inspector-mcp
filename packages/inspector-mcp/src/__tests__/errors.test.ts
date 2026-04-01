import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it } from 'vitest';
import {
  BreakpointNotFoundError,
  CdpConnectionError,
  InspectorMcpError,
  SessionNotConnectedError,
  SessionNotFoundError,
  SessionNotPausedError,
  toMcpError,
} from '../errors.js';

describe('toMcpError', () => {
  it('passes McpError through unchanged', () => {
    const original = new McpError(ErrorCode.InvalidParams, 'bad param');
    const result = toMcpError(original);
    expect(result).toBe(original);
  });

  it('converts InspectorMcpError preserving code and message', () => {
    const err = new SessionNotFoundError('localhost:9229');
    const result = toMcpError(err);
    expect(result).toBeInstanceOf(McpError);
    expect(result.code).toBe(ErrorCode.InvalidParams);
    expect(result.message).toContain('localhost:9229');
  });

  it('converts plain Error to InternalError', () => {
    const err = new Error('something exploded');
    const result = toMcpError(err);
    expect(result).toBeInstanceOf(McpError);
    expect(result.code).toBe(ErrorCode.InternalError);
    // McpError prefixes the message with "MCP error <code>: " — this is SDK behaviour
    expect(result.message).toContain('something exploded');
  });

  it('converts string to InternalError', () => {
    const result = toMcpError('raw string error');
    expect(result).toBeInstanceOf(McpError);
    expect(result.code).toBe(ErrorCode.InternalError);
    expect(result.message).toContain('raw string error');
  });

  it('converts null/undefined to InternalError', () => {
    expect(toMcpError(null).code).toBe(ErrorCode.InternalError);
    expect(toMcpError(undefined).code).toBe(ErrorCode.InternalError);
  });
});

describe('SessionNotFoundError', () => {
  it('has InvalidParams code', () => {
    const err = new SessionNotFoundError('localhost:9229');
    expect(err.code).toBe(ErrorCode.InvalidParams);
  });

  it('message mentions the session id', () => {
    const err = new SessionNotFoundError('localhost:9229');
    expect(err.message).toContain('localhost:9229');
  });

  it('message guides user toward debug_list_sessions', () => {
    const err = new SessionNotFoundError('localhost:9229');
    expect(err.message).toContain('debug_list_sessions');
  });
});

describe('SessionNotPausedError', () => {
  it('has InvalidRequest code', () => {
    expect(new SessionNotPausedError('connected').code).toBe(
      ErrorCode.InvalidRequest,
    );
  });

  it('message includes the current status', () => {
    const err = new SessionNotPausedError('reconnecting');
    expect(err.message).toContain('reconnecting');
  });
});

describe('SessionNotConnectedError', () => {
  it('has InvalidRequest code', () => {
    expect(new SessionNotConnectedError('disconnected').code).toBe(
      ErrorCode.InvalidRequest,
    );
  });

  it('message includes the current status', () => {
    const err = new SessionNotConnectedError('disconnected');
    expect(err.message).toContain('disconnected');
  });
});

describe('CdpConnectionError', () => {
  it('has InternalError code', () => {
    const err = new CdpConnectionError('localhost', 9229);
    expect(err.code).toBe(ErrorCode.InternalError);
  });

  it('message includes host:port', () => {
    const err = new CdpConnectionError('localhost', 9229);
    expect(err.message).toContain('localhost');
    expect(err.message).toContain('9229');
  });

  it('message mentions --inspect flag to guide user', () => {
    const err = new CdpConnectionError('localhost', 9229);
    expect(err.message).toContain('--inspect');
  });

  it('stores cause as details', () => {
    const cause = new Error('ECONNREFUSED');
    const err = new CdpConnectionError('localhost', 9229, cause);
    expect(err.details).toBe(cause);
  });
});

describe('BreakpointNotFoundError', () => {
  it('has InvalidParams code', () => {
    const err = new BreakpointNotFoundError('bp-uuid-123');
    expect(err.code).toBe(ErrorCode.InvalidParams);
  });

  it('message contains the breakpoint id', () => {
    const err = new BreakpointNotFoundError('bp-uuid-123');
    expect(err.message).toContain('bp-uuid-123');
  });
});

describe('InspectorMcpError inheritance', () => {
  it('all custom errors are instances of InspectorMcpError', () => {
    expect(new SessionNotFoundError('x')).toBeInstanceOf(InspectorMcpError);
    expect(new SessionNotPausedError('x')).toBeInstanceOf(InspectorMcpError);
    expect(new SessionNotConnectedError('x')).toBeInstanceOf(InspectorMcpError);
    expect(new CdpConnectionError('x', 0)).toBeInstanceOf(InspectorMcpError);
    expect(new BreakpointNotFoundError('x')).toBeInstanceOf(InspectorMcpError);
  });

  it('all custom errors are instances of Error', () => {
    expect(new SessionNotFoundError('x')).toBeInstanceOf(Error);
  });
});
