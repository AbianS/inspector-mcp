import { SessionNotFoundError } from '../errors.js';
import { DebugSession } from './debug-session.js';

export class SessionManager {
  private sessions = new Map<string, DebugSession>();

  async connect(
    host: string,
    port: number,
    autoReconnect: boolean,
  ): Promise<DebugSession> {
    const sessionId = `${host}:${port}`;

    const existing = this.sessions.get(sessionId);
    if (existing) return existing;

    const session = new DebugSession(host, port, autoReconnect);
    this.sessions.set(sessionId, session);

    try {
      await session.connect();
    } catch (err) {
      this.sessions.delete(sessionId);
      throw err;
    }

    return session;
  }

  async disconnect(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);
    await session.disconnect();
    this.sessions.delete(sessionId);
  }

  get(sessionId: string): DebugSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);
    return session;
  }

  listAll(): DebugSession[] {
    return Array.from(this.sessions.values());
  }
}
