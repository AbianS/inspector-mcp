import { beforeEach, describe, expect, it } from 'vitest';
import { BreakpointRegistry } from '../cdp/breakpoint-registry.js';

const BASE = {
  cdpBreakpointId: 'cdp-bp-1',
  filePath: '/project/src/server.ts',
  lineNumber: 42,
  columnNumber: 0,
  verified: true,
};

describe('BreakpointRegistry', () => {
  let reg: BreakpointRegistry;

  beforeEach(() => {
    reg = new BreakpointRegistry();
  });

  // ── add ────────────────────────────────────────────────────────────────────

  it('add returns a BreakpointInfo with a UUID id', () => {
    const bp = reg.add(BASE);
    expect(bp.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('each add generates a unique id', () => {
    const a = reg.add(BASE);
    const b = reg.add({ ...BASE, lineNumber: 99 });
    expect(a.id).not.toBe(b.id);
  });

  it('add stores optional condition', () => {
    const bp = reg.add({ ...BASE, condition: 'x > 5' });
    expect(bp.condition).toBe('x > 5');
  });

  it('add without condition leaves condition undefined', () => {
    const bp = reg.add(BASE);
    expect(bp.condition).toBeUndefined();
  });

  it('add with warning stores warning', () => {
    const bp = reg.add({ ...BASE, warning: 'source map not found' });
    expect(bp.warning).toBe('source map not found');
  });

  // ── getById ────────────────────────────────────────────────────────────────

  it('getById returns the breakpoint after add', () => {
    const bp = reg.add(BASE);
    const found = reg.getById(bp.id);
    expect(found).toBeDefined();
    expect(found?.filePath).toBe(BASE.filePath);
  });

  it('getById returns undefined for unknown id', () => {
    expect(reg.getById('does-not-exist')).toBeUndefined();
  });

  // ── getAll ────────────────────────────────────────────────────────────────

  it('getAll returns empty array when empty', () => {
    expect(reg.getAll()).toHaveLength(0);
  });

  it('getAll returns all added breakpoints', () => {
    reg.add(BASE);
    reg.add({ ...BASE, lineNumber: 10 });
    reg.add({ ...BASE, lineNumber: 20 });
    expect(reg.getAll()).toHaveLength(3);
  });

  // ── remove ────────────────────────────────────────────────────────────────

  it('remove returns true and deletes the breakpoint', () => {
    const bp = reg.add(BASE);
    expect(reg.remove(bp.id)).toBe(true);
    expect(reg.getById(bp.id)).toBeUndefined();
    expect(reg.getAll()).toHaveLength(0);
  });

  it('remove returns false for unknown id', () => {
    expect(reg.remove('ghost')).toBe(false);
  });

  // ── markAllUnverified ─────────────────────────────────────────────────────

  it('markAllUnverified sets verified=false and clears cdpBreakpointId on all entries', () => {
    const a = reg.add({ ...BASE, verified: true, cdpBreakpointId: 'cdp-1' });
    const b = reg.add({
      ...BASE,
      lineNumber: 99,
      verified: true,
      cdpBreakpointId: 'cdp-2',
    });

    reg.markAllUnverified();

    expect(reg.getById(a.id)?.verified).toBe(false);
    expect(reg.getById(a.id)?.cdpBreakpointId).toBe('');
    expect(reg.getById(b.id)?.verified).toBe(false);
    expect(reg.getById(b.id)?.cdpBreakpointId).toBe('');
  });

  it('markAllUnverified mutates the same object returned by add (shared reference)', () => {
    // This is intentional behavior — consumers holding a ref see the change
    const bp = reg.add({ ...BASE, verified: true });
    reg.markAllUnverified();
    // bp is the same object in the map — it gets mutated
    expect(bp.verified).toBe(false);
    expect(bp.cdpBreakpointId).toBe('');
  });

  it('markAllUnverified preserves filePath, lineNumber, and condition', () => {
    reg.add({ ...BASE, condition: 'x > 0', lineNumber: 77 });
    reg.markAllUnverified();
    const all = reg.getAll();
    expect(all[0]?.filePath).toBe(BASE.filePath);
    expect(all[0]?.lineNumber).toBe(77);
    expect(all[0]?.condition).toBe('x > 0');
  });

  // ── updateCdpId ───────────────────────────────────────────────────────────

  it('updateCdpId updates cdpBreakpointId and verified', () => {
    const bp = reg.add({ ...BASE, verified: false, cdpBreakpointId: '' });
    reg.updateCdpId(bp.id, 'new-cdp-id', true);
    expect(reg.getById(bp.id)?.cdpBreakpointId).toBe('new-cdp-id');
    expect(reg.getById(bp.id)?.verified).toBe(true);
  });

  it('updateCdpId clears warning field', () => {
    const bp = reg.add({
      ...BASE,
      warning: 'source map missing',
      verified: false,
    });
    reg.updateCdpId(bp.id, 'cdp-new', true);
    expect(reg.getById(bp.id)?.warning).toBeUndefined();
  });

  it('updateCdpId on unknown id is a silent no-op', () => {
    // Should not throw
    expect(() => reg.updateCdpId('nonexistent', 'cdp-x', true)).not.toThrow();
  });

  // ── Combined lifecycle ────────────────────────────────────────────────────

  it('full reconnect lifecycle: add → markAllUnverified → updateCdpId', () => {
    const bp = reg.add({ ...BASE, verified: true, cdpBreakpointId: 'old-cdp' });

    // Simulate disconnect
    reg.markAllUnverified();
    expect(bp.verified).toBe(false);
    expect(bp.cdpBreakpointId).toBe('');

    // Simulate re-register after reconnect
    reg.updateCdpId(bp.id, 'new-cdp-after-reconnect', true);
    expect(bp.verified).toBe(true);
    expect(bp.cdpBreakpointId).toBe('new-cdp-after-reconnect');
  });
});
