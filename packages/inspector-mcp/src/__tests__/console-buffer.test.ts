import { beforeEach, describe, expect, it } from 'vitest';
import {
  ConsoleBuffer,
  consoleEntryLevelFromCdp,
} from '../cdp/console-buffer.js';
import { CONSOLE_BUFFER_MAX } from '../constants.js';

function makeEntry(
  text: string,
  level: 'log' | 'warn' | 'error' | 'info' | 'debug' = 'log',
) {
  return { timestamp: new Date().toISOString(), level, text, args: [text] };
}

describe('ConsoleBuffer', () => {
  let buf: ConsoleBuffer;

  beforeEach(() => {
    buf = new ConsoleBuffer();
  });

  // ── Basic read/write ──────────────────────────────────────────────────────

  it('empty buffer returns total=0 and empty entries', () => {
    const result = buf.read({ level: 'all', limit: 100, offset: 0 });
    expect(result.total).toBe(0);
    expect(result.entries).toHaveLength(0);
  });

  it('push one entry and read it back', () => {
    buf.push(makeEntry('hello'));
    const { total, entries } = buf.read({ level: 'all', limit: 10, offset: 0 });
    expect(total).toBe(1);
    expect(entries[0]?.text).toBe('hello');
    expect(entries[0]?.index).toBe(0);
  });

  it('entries are returned in chronological order (index ascending)', () => {
    buf.push(makeEntry('first'));
    buf.push(makeEntry('second'));
    buf.push(makeEntry('third'));
    const { entries } = buf.read({ level: 'all', limit: 10, offset: 0 });
    expect(entries.map((e) => e.text)).toEqual(['first', 'second', 'third']);
    expect(entries[0]!.index).toBeLessThan(entries[1]!.index);
    expect(entries[1]!.index).toBeLessThan(entries[2]!.index);
  });

  // ── Level filter ─────────────────────────────────────────────────────────

  it('level filter only returns matching entries', () => {
    buf.push(makeEntry('a', 'log'));
    buf.push(makeEntry('b', 'error'));
    buf.push(makeEntry('c', 'warn'));
    buf.push(makeEntry('d', 'error'));

    const { total, entries } = buf.read({
      level: 'error',
      limit: 100,
      offset: 0,
    });
    expect(total).toBe(2);
    expect(entries.every((e) => e.level === 'error')).toBe(true);
    expect(entries.map((e) => e.text)).toEqual(['b', 'd']);
  });

  it('level=all returns everything regardless of level', () => {
    buf.push(makeEntry('log', 'log'));
    buf.push(makeEntry('error', 'error'));
    buf.push(makeEntry('warn', 'warn'));
    const { total } = buf.read({ level: 'all', limit: 100, offset: 0 });
    expect(total).toBe(3);
  });

  // ── Text filter ───────────────────────────────────────────────────────────

  it('text filter matches substring', () => {
    buf.push(makeEntry('user logged in'));
    buf.push(makeEntry('order created'));
    buf.push(makeEntry('user logged out'));

    const { total, entries } = buf.read({
      level: 'all',
      filter: 'user',
      limit: 100,
      offset: 0,
    });
    expect(total).toBe(2);
    expect(entries.map((e) => e.text)).toEqual([
      'user logged in',
      'user logged out',
    ]);
  });

  it('text filter is case-sensitive', () => {
    buf.push(makeEntry('User logged in'));
    buf.push(makeEntry('user logged out'));
    const { total } = buf.read({
      level: 'all',
      filter: 'User',
      limit: 100,
      offset: 0,
    });
    expect(total).toBe(1);
  });

  it('empty string filter matches everything', () => {
    buf.push(makeEntry('a'));
    buf.push(makeEntry('b'));
    const { total } = buf.read({
      level: 'all',
      filter: '',
      limit: 100,
      offset: 0,
    });
    // '' is falsy → filter branch is skipped → all entries match
    expect(total).toBe(2);
  });

  it('level and text filters combine (AND logic)', () => {
    buf.push(makeEntry('[auth] login failed', 'error'));
    buf.push(makeEntry('[auth] token expired', 'warn'));
    buf.push(makeEntry('[db] query failed', 'error'));

    const { total, entries } = buf.read({
      level: 'error',
      filter: '[auth]',
      limit: 100,
      offset: 0,
    });
    expect(total).toBe(1);
    expect(entries[0]?.text).toBe('[auth] login failed');
  });

  // ── Pagination ────────────────────────────────────────────────────────────

  it('limit restricts returned entries but total reflects full match count', () => {
    for (let i = 0; i < 20; i++) buf.push(makeEntry(`msg ${i}`));
    const { total, entries } = buf.read({ level: 'all', limit: 5, offset: 0 });
    expect(total).toBe(20);
    expect(entries).toHaveLength(5);
    expect(entries[0]?.text).toBe('msg 0');
  });

  it('offset skips entries', () => {
    for (let i = 0; i < 10; i++) buf.push(makeEntry(`msg ${i}`));
    const { total, entries } = buf.read({ level: 'all', limit: 5, offset: 5 });
    expect(total).toBe(10);
    expect(entries[0]?.text).toBe('msg 5');
    expect(entries).toHaveLength(5);
  });

  it('offset beyond total returns empty entries but correct total', () => {
    buf.push(makeEntry('only one'));
    const { total, entries } = buf.read({
      level: 'all',
      limit: 10,
      offset: 999,
    });
    expect(total).toBe(1);
    expect(entries).toHaveLength(0);
  });

  // ── Clear ─────────────────────────────────────────────────────────────────

  it('clear returns count of removed entries', () => {
    buf.push(makeEntry('a'));
    buf.push(makeEntry('b'));
    buf.push(makeEntry('c'));
    expect(buf.clear()).toBe(3);
  });

  it('buffer is empty after clear', () => {
    buf.push(makeEntry('a'));
    buf.clear();
    const { total } = buf.read({ level: 'all', limit: 100, offset: 0 });
    expect(total).toBe(0);
  });

  it('index counter is monotonic across clear — new entries get higher indices', () => {
    buf.push(makeEntry('before'));
    const indexBefore = buf.read({ level: 'all', limit: 1, offset: 0 })
      .entries[0]!.index;

    buf.clear();
    buf.push(makeEntry('after'));
    const indexAfter = buf.read({ level: 'all', limit: 1, offset: 0 })
      .entries[0]!.index;

    // After clear, the new entry should have a higher index (counter not reset)
    expect(indexAfter).toBeGreaterThan(indexBefore);
  });

  // ── Circular buffer at capacity ───────────────────────────────────────────

  it('buffer caps at CONSOLE_BUFFER_MAX entries', () => {
    for (let i = 0; i < CONSOLE_BUFFER_MAX + 50; i++) {
      buf.push(makeEntry(`msg ${i}`));
    }
    const { total } = buf.read({
      level: 'all',
      limit: CONSOLE_BUFFER_MAX + 100,
      offset: 0,
    });
    expect(total).toBe(CONSOLE_BUFFER_MAX);
  });

  it('when full, oldest entries are evicted first (FIFO)', () => {
    for (let i = 0; i < CONSOLE_BUFFER_MAX; i++) {
      buf.push(makeEntry(`msg ${i}`));
    }
    // Push one more — msg 0 should be evicted
    buf.push(makeEntry('new'));

    const { entries } = buf.read({
      level: 'all',
      limit: CONSOLE_BUFFER_MAX,
      offset: 0,
    });
    const texts = entries.map((e) => e.text);
    expect(texts).not.toContain('msg 0'); // evicted
    expect(texts).toContain('msg 1'); // still present
    expect(texts).toContain('new'); // newest
  });

  it('entries stay in chronological order after wrap-around', () => {
    // Fill to capacity then overflow by 10
    for (let i = 0; i < CONSOLE_BUFFER_MAX + 10; i++) {
      buf.push(makeEntry(`msg ${i}`));
    }
    const { entries } = buf.read({
      level: 'all',
      limit: CONSOLE_BUFFER_MAX,
      offset: 0,
    });

    // Indices must be strictly increasing
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i]!.index).toBeGreaterThan(entries[i - 1]!.index);
    }

    // First entry should be msg 10 (the 11 oldest were evicted)
    expect(entries[0]?.text).toBe('msg 10');
    expect(entries[entries.length - 1]?.text).toBe(
      `msg ${CONSOLE_BUFFER_MAX + 9}`,
    );
  });

  it('clear then refill works correctly after a wrap', () => {
    // Overflow buffer
    for (let i = 0; i < CONSOLE_BUFFER_MAX + 5; i++) {
      buf.push(makeEntry(`old ${i}`));
    }
    buf.clear();

    buf.push(makeEntry('fresh'));
    const { total, entries } = buf.read({ level: 'all', limit: 10, offset: 0 });
    expect(total).toBe(1);
    expect(entries[0]?.text).toBe('fresh');
  });
});

// ── consoleEntryLevelFromCdp ──────────────────────────────────────────────────

describe('consoleEntryLevelFromCdp', () => {
  it.each([
    ['log', 'log'],
    ['info', 'info'],
    ['warning', 'warn'], // CDP uses 'warning', we map to 'warn'
    ['error', 'error'],
    ['debug', 'debug'],
    ['dir', 'dir'],
    ['table', 'table'],
    ['startGroup', 'group'],
    ['startGroupCollapsed', 'group'],
    ['endGroup', 'groupEnd'],
    ['clear', 'clear'],
  ] as const)('CDP type "%s" maps to level "%s"', (cdpType, expected) => {
    expect(consoleEntryLevelFromCdp(cdpType)).toBe(expected);
  });

  it('unknown CDP type falls back to "log"', () => {
    expect(consoleEntryLevelFromCdp('unknownFutureType')).toBe('log');
    expect(consoleEntryLevelFromCdp('')).toBe('log');
  });
});
