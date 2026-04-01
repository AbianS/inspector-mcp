import { describe, expect, it } from 'vitest';
import {
  escapeRegex,
  filePathToUrlRegex,
  remoteObjectToVariableInfo,
} from '../cdp/cdp-client.js';

// ── remoteObjectToVariableInfo ────────────────────────────────────────────────

describe('remoteObjectToVariableInfo', () => {
  it('undefined type serializes as "undefined"', () => {
    const v = remoteObjectToVariableInfo('x', { type: 'undefined' });
    expect(v.value).toBe('undefined');
    expect(v.type).toBe('undefined');
    expect(v.isExpandable).toBe(false);
  });

  it('string type wraps value in quotes', () => {
    const v = remoteObjectToVariableInfo('name', {
      type: 'string',
      value: 'Alice',
    });
    expect(v.value).toBe('"Alice"');
    expect(v.type).toBe('string');
  });

  it('string with special chars is JSON-escaped', () => {
    const v = remoteObjectToVariableInfo('msg', {
      type: 'string',
      value: 'line1\nline2',
    });
    expect(v.value).toBe('"line1\\nline2"');
  });

  it('number type serializes as string of the number', () => {
    const v = remoteObjectToVariableInfo('n', { type: 'number', value: 42 });
    expect(v.value).toBe('42');
    expect(v.type).toBe('number');
    expect(v.isExpandable).toBe(false);
  });

  it('boolean type serializes correctly', () => {
    const t = remoteObjectToVariableInfo('flag', {
      type: 'boolean',
      value: true,
    });
    const f = remoteObjectToVariableInfo('flag', {
      type: 'boolean',
      value: false,
    });
    expect(t.value).toBe('true');
    expect(f.value).toBe('false');
  });

  it('null (object subtype) is not expandable and shows description', () => {
    const v = remoteObjectToVariableInfo('x', {
      type: 'object',
      subtype: 'null',
      description: 'null',
      value: null,
    });
    // null has no objectId → not expandable
    expect(v.isExpandable).toBe(false);
    expect(v.type).toBe('object(null)');
  });

  it('object with objectId is expandable', () => {
    const v = remoteObjectToVariableInfo('obj', {
      type: 'object',
      description: 'Object',
      objectId: 'obj-123',
    });
    expect(v.isExpandable).toBe(true);
    expect(v.objectId).toBe('obj-123');
    expect(v.value).toBe('Object');
  });

  it('array with objectId is expandable with subtype in type label', () => {
    const v = remoteObjectToVariableInfo('arr', {
      type: 'object',
      subtype: 'array',
      description: 'Array(3)',
      objectId: 'arr-456',
    });
    expect(v.isExpandable).toBe(true);
    expect(v.type).toBe('object(array)');
    expect(v.value).toBe('Array(3)');
  });

  it('function type uses description as value', () => {
    const v = remoteObjectToVariableInfo('fn', {
      type: 'function',
      description: 'function greet(name) { ... }',
      objectId: 'fn-789',
    });
    expect(v.value).toBe('function greet(name) { ... }');
    expect(v.isExpandable).toBe(true);
  });

  it('unserializableValue (NaN, Infinity, -0) takes priority', () => {
    const nan = remoteObjectToVariableInfo('x', {
      type: 'number',
      unserializableValue: 'NaN',
    });
    const inf = remoteObjectToVariableInfo('y', {
      type: 'number',
      unserializableValue: 'Infinity',
    });
    const neg0 = remoteObjectToVariableInfo('z', {
      type: 'number',
      unserializableValue: '-0',
    });
    expect(nan.value).toBe('NaN');
    expect(inf.value).toBe('Infinity');
    expect(neg0.value).toBe('-0');
  });

  it('object with objectId but no description falls back to [subtype ?? type]', () => {
    const v = remoteObjectToVariableInfo('x', {
      type: 'object',
      objectId: 'x-1',
      // no description
    });
    expect(v.value).toBe('[object]');
  });

  it('object with subtype but no description falls back to [subtype]', () => {
    const v = remoteObjectToVariableInfo('re', {
      type: 'object',
      subtype: 'regexp',
      objectId: 're-1',
      // no description
    });
    expect(v.value).toBe('[regexp]');
  });
});

// ── escapeRegex ───────────────────────────────────────────────────────────────

describe('escapeRegex', () => {
  it('escapes all regex special characters', () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional literal string with special chars
    const special = '.*+?^${}()|[]\\';
    const escaped = escapeRegex(special);
    // The escaped string should be a valid regex matching the literal
    expect(() => new RegExp(escaped)).not.toThrow();
    expect(new RegExp(escaped).test(special)).toBe(true);
  });

  it('leaves alphanumeric characters unchanged', () => {
    expect(escapeRegex('hello123')).toBe('hello123');
  });

  it('escapes dot in filename extensions', () => {
    expect(escapeRegex('server.ts')).toBe('server\\.ts');
  });
});

// ── filePathToUrlRegex ────────────────────────────────────────────────────────

describe('filePathToUrlRegex', () => {
  it('produces a regex that matches the filename at end of URL', () => {
    const pattern = filePathToUrlRegex('/project/src/server.ts');
    const regex = new RegExp(pattern);
    expect(regex.test('/project/src/server.ts')).toBe(true);
    expect(regex.test('file:///project/src/server.ts')).toBe(true);
  });

  it('does NOT match a file with a different extension', () => {
    const pattern = filePathToUrlRegex('/project/src/server.ts');
    const regex = new RegExp(pattern);
    expect(regex.test('/project/src/server.js')).toBe(false);
  });

  it('handles Windows-style backslash paths', () => {
    const pattern = filePathToUrlRegex('C:\\project\\src\\server.ts');
    const regex = new RegExp(pattern);
    // Should still extract the filename
    expect(regex.test('/project/src/server.ts')).toBe(true);
  });

  it('escapes dots in the filename so they are literal', () => {
    const pattern = filePathToUrlRegex('/src/app.config.ts');
    const regex = new RegExp(pattern);
    // Should NOT match "appXconfigYts" (unescaped dots would match anything)
    expect(regex.test('/src/appXconfigYts')).toBe(false);
    expect(regex.test('/src/app.config.ts')).toBe(true);
  });

  it('WARNING: basename-only regex can match files with same name in different dirs', () => {
    // This is a known limitation — the regex only uses the filename
    const pattern = filePathToUrlRegex('/project/src/utils.ts');
    const regex = new RegExp(pattern);
    // Both paths match — could cause false positives
    expect(regex.test('/project/src/utils.ts')).toBe(true);
    expect(regex.test('/other-project/lib/utils.ts')).toBe(true);
    // Document this limitation explicitly
  });
});
