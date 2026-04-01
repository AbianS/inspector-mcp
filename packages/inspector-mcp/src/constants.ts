import type { ReconnectConfig } from './types.js';

export const CONSOLE_BUFFER_MAX = 1000;

export const DEFAULT_RECONNECT_CONFIG: ReconnectConfig = {
  maxAttempts: 5,
  baseDelayMs: 500,
  maxDelayMs: 30_000,
  multiplier: 2,
};

export const DEFAULT_HOST = 'localhost';
export const DEFAULT_PORT = 9229;
