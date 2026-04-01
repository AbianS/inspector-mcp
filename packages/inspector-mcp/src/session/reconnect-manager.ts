import { DEFAULT_RECONNECT_CONFIG } from '../constants.js';
import type { ReconnectConfig } from '../types.js';

export type ReconnectCallback = () => Promise<boolean>;

export class ReconnectManager {
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private readonly config: ReconnectConfig;

  constructor(
    private readonly onAttempt: ReconnectCallback,
    private readonly onExhausted: () => void,
    config?: Partial<ReconnectConfig>,
  ) {
    this.config = { ...DEFAULT_RECONNECT_CONFIG, ...config };
  }

  start(): void {
    // Cancel any pending timer before starting fresh to avoid duplicate timers
    // when start() is called while a reconnect sequence is already in progress.
    this.stop();
    this.stopped = false;
    this.attempt = 0;
    this.scheduleNext();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  get currentAttempt(): number {
    return this.attempt;
  }

  private scheduleNext(): void {
    if (this.stopped) return;
    if (this.attempt >= this.config.maxAttempts) {
      this.onExhausted();
      return;
    }

    const delay = Math.min(
      this.config.baseDelayMs * this.config.multiplier ** this.attempt,
      this.config.maxDelayMs,
    );

    this.timer = setTimeout(() => {
      void this.tryOnce();
    }, delay);
  }

  private async tryOnce(): Promise<void> {
    if (this.stopped) return;
    this.attempt++;

    try {
      const success = await this.onAttempt();
      if (success) {
        this.stop();
      } else {
        this.scheduleNext();
      }
    } catch {
      this.scheduleNext();
    }
  }
}
