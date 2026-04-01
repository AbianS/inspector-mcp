export type SessionStatus =
  | 'connecting'
  | 'connected'
  | 'paused'
  | 'disconnected'
  | 'reconnecting';

export type ScopeFilter = 'local' | 'closure' | 'global' | 'all';

export type ConsoleLevel =
  | 'log'
  | 'info'
  | 'warn'
  | 'error'
  | 'debug'
  | 'dir'
  | 'table'
  | 'group'
  | 'groupEnd'
  | 'clear';

export interface DebugSessionInfo {
  sessionId: string;
  host: string;
  port: number;
  status: SessionStatus;
  pausedAt: PauseLocation | null;
  connectedAt: string | null;
  reconnectAttempt: number;
}

export interface PauseLocation {
  reason: string;
  breakpointId?: string;
  callFrames: CallFrame[];
}

export interface CallFrame {
  frameId: string;
  functionName: string;
  url: string;
  lineNumber: number;
  columnNumber: number;
  rawUrl: string;
  rawLineNumber: number;
  rawColumnNumber: number;
}

export interface VariableInfo {
  name: string;
  value: string;
  type: string;
  objectId?: string;
  isExpandable: boolean;
}

export interface BreakpointInfo {
  id: string;
  cdpBreakpointId: string;
  filePath: string;
  lineNumber: number;
  columnNumber: number;
  condition?: string;
  verified: boolean;
  warning?: string;
}

export interface ConsoleEntry {
  index: number;
  timestamp: string;
  level: ConsoleLevel;
  text: string;
  args: string[];
}

export interface ConsoleFilter {
  level: ConsoleLevel | 'all';
  filter?: string;
  limit: number;
  offset: number;
}

export interface ConsoleReadResult {
  total: number;
  entries: ConsoleEntry[];
}

export interface EvalResult {
  value: unknown;
  type: string;
  objectId?: string;
  isError: boolean;
  errorText?: string;
}

export interface ReconnectConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
}
