import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReconnectManager } from '../session/reconnect-manager.js';

const FAST_CONFIG = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 10_000,
  multiplier: 2,
};

describe('ReconnectManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it('calls onAttempt after the initial delay', async () => {
    const onAttempt = vi.fn().mockResolvedValue(false);
    const onExhausted = vi.fn();
    const mgr = new ReconnectManager(onAttempt, onExhausted, FAST_CONFIG);

    mgr.start();
    expect(onAttempt).not.toHaveBeenCalled(); // not immediate

    await vi.advanceTimersByTimeAsync(100);
    expect(onAttempt).toHaveBeenCalledTimes(1);
  });

  it('stops immediately when onAttempt returns true (success)', async () => {
    const onAttempt = vi.fn().mockResolvedValue(true);
    const onExhausted = vi.fn();
    const mgr = new ReconnectManager(onAttempt, onExhausted, FAST_CONFIG);

    mgr.start();
    await vi.advanceTimersByTimeAsync(100);
    expect(onAttempt).toHaveBeenCalledTimes(1);

    // No more attempts after success
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onExhausted).not.toHaveBeenCalled();
  });

  it('retries on failure and succeeds on 3rd attempt', async () => {
    const onAttempt = vi
      .fn()
      .mockResolvedValueOnce(false) // attempt 1 fails
      .mockResolvedValueOnce(false) // attempt 2 fails
      .mockResolvedValue(true); // attempt 3 succeeds
    const onExhausted = vi.fn();
    const mgr = new ReconnectManager(onAttempt, onExhausted, FAST_CONFIG);

    mgr.start();

    await vi.advanceTimersByTimeAsync(100); // attempt 1 (delay: 100 * 2^0 = 100)
    await vi.advanceTimersByTimeAsync(200); // attempt 2 (delay: 100 * 2^1 = 200)
    await vi.advanceTimersByTimeAsync(400); // attempt 3 (delay: 100 * 2^2 = 400)

    expect(onAttempt).toHaveBeenCalledTimes(3);
    expect(onExhausted).not.toHaveBeenCalled();
  });

  it('uses exponential backoff between attempts', async () => {
    const callTimes: number[] = [];
    const onAttempt = vi.fn().mockImplementation(() => {
      callTimes.push(Date.now());
      return Promise.resolve(false);
    });
    const mgr = new ReconnectManager(onAttempt, vi.fn(), FAST_CONFIG);

    mgr.start();
    // 3 attempts: delays should be 100, 200, 400
    await vi.advanceTimersByTimeAsync(100); // fires attempt 1 at t=100
    await vi.advanceTimersByTimeAsync(200); // fires attempt 2 at t=300
    await vi.advanceTimersByTimeAsync(400); // fires attempt 3 at t=700

    expect(callTimes).toHaveLength(3);
    expect(callTimes[1]! - callTimes[0]!).toBeGreaterThanOrEqual(200);
    expect(callTimes[2]! - callTimes[1]!).toBeGreaterThanOrEqual(400);
  });

  // ── Exhaustion ────────────────────────────────────────────────────────────

  it('calls onExhausted after maxAttempts failures', async () => {
    const onAttempt = vi.fn().mockResolvedValue(false);
    const onExhausted = vi.fn();
    const mgr = new ReconnectManager(onAttempt, onExhausted, FAST_CONFIG); // maxAttempts=3

    mgr.start();
    await vi.advanceTimersByTimeAsync(100); // attempt 1
    await vi.advanceTimersByTimeAsync(200); // attempt 2
    await vi.advanceTimersByTimeAsync(400); // attempt 3 → exhausted

    expect(onAttempt).toHaveBeenCalledTimes(3);
    expect(onExhausted).toHaveBeenCalledTimes(1);
  });

  it('does not attempt more than maxAttempts even with time passing', async () => {
    const onAttempt = vi.fn().mockResolvedValue(false);
    const mgr = new ReconnectManager(onAttempt, vi.fn(), FAST_CONFIG);

    mgr.start();
    await vi.advanceTimersByTimeAsync(100_000); // way more than needed

    expect(onAttempt).toHaveBeenCalledTimes(3); // never exceeds maxAttempts
  });

  // ── stop() ────────────────────────────────────────────────────────────────

  it('stop() prevents pending timer from firing', async () => {
    const onAttempt = vi.fn().mockResolvedValue(false);
    const mgr = new ReconnectManager(onAttempt, vi.fn(), FAST_CONFIG);

    mgr.start();
    mgr.stop(); // stop before first timer fires

    await vi.advanceTimersByTimeAsync(10_000);
    expect(onAttempt).not.toHaveBeenCalled();
  });

  it('stop() mid-sequence stops further attempts', async () => {
    const onAttempt = vi.fn().mockResolvedValue(false);
    const mgr = new ReconnectManager(onAttempt, vi.fn(), FAST_CONFIG);

    mgr.start();
    await vi.advanceTimersByTimeAsync(100); // attempt 1 fires
    mgr.stop();

    await vi.advanceTimersByTimeAsync(10_000); // no more should fire
    expect(onAttempt).toHaveBeenCalledTimes(1);
  });

  // ── onAttempt throws ─────────────────────────────────────────────────────

  it('treats thrown exceptions the same as returning false (retries)', async () => {
    const onAttempt = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValue(true);
    const onExhausted = vi.fn();
    const mgr = new ReconnectManager(onAttempt, onExhausted, FAST_CONFIG);

    mgr.start();
    await vi.advanceTimersByTimeAsync(100); // throws → schedules retry
    await vi.advanceTimersByTimeAsync(200); // succeeds

    expect(onAttempt).toHaveBeenCalledTimes(2);
    expect(onExhausted).not.toHaveBeenCalled();
  });

  // ── currentAttempt ────────────────────────────────────────────────────────

  it('currentAttempt reflects number of attempts made', async () => {
    const onAttempt = vi.fn().mockResolvedValue(false);
    const mgr = new ReconnectManager(onAttempt, vi.fn(), FAST_CONFIG);

    expect(mgr.currentAttempt).toBe(0);
    mgr.start();

    await vi.advanceTimersByTimeAsync(100);
    expect(mgr.currentAttempt).toBe(1);

    await vi.advanceTimersByTimeAsync(200);
    expect(mgr.currentAttempt).toBe(2);
  });

  // ── BUG CANDIDATE: double start ───────────────────────────────────────────
  //
  // start() does not cancel the existing timer before scheduling a new one.
  // Calling start() twice while a timer is pending should NOT result in
  // onAttempt being called twice at the same time.

  it('calling start() twice does not create duplicate concurrent timers', async () => {
    const onAttempt = vi.fn().mockResolvedValue(false);
    const mgr = new ReconnectManager(onAttempt, vi.fn(), FAST_CONFIG);

    mgr.start();
    mgr.start(); // second start — should cancel the first timer

    await vi.advanceTimersByTimeAsync(100);

    // If there's a duplicate timer bug, onAttempt fires TWICE at t=100
    expect(onAttempt).toHaveBeenCalledTimes(1);
  });

  // ── maxDelayMs cap ────────────────────────────────────────────────────────

  it('delay is capped at maxDelayMs', async () => {
    const config = {
      maxAttempts: 10,
      baseDelayMs: 1000,
      maxDelayMs: 3000,
      multiplier: 10,
    };
    const callTimes: number[] = [];
    const onAttempt = vi.fn().mockImplementation(() => {
      callTimes.push(Date.now());
      return Promise.resolve(false);
    });
    const mgr = new ReconnectManager(onAttempt, vi.fn(), config);

    mgr.start();
    // Attempt 1: delay = 1000 * 10^0 = 1000
    await vi.advanceTimersByTimeAsync(1000);
    // Attempt 2: delay = 1000 * 10^1 = 10000 → capped to 3000
    await vi.advanceTimersByTimeAsync(3000);
    // Attempt 3: delay = capped to 3000
    await vi.advanceTimersByTimeAsync(3000);

    expect(onAttempt).toHaveBeenCalledTimes(3);
    // Gap between attempt 2 and 3 should be 3000 (capped), not 10000
    expect(callTimes[2]! - callTimes[1]!).toBe(3000);
  });
});
