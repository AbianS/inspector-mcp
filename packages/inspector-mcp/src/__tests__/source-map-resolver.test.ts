import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SourceMapGenerator } from 'source-map';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SourceMapCache } from '../sourcemaps/source-map-cache.js';
import { SourceMapResolver } from '../sourcemaps/source-map-resolver.js';

// ── Fixture builder ───────────────────────────────────────────────────────────
//
// We build real files on disk using SourceMapGenerator so the mappings are
// accurate. Tests then verify our resolver against those known mappings.

let tmpDir: string;
let jsFile: string;
let jsFileInlineMap: string;
let noMapFile: string;

// Source content (conceptual):
//   Line 1: function greet(name) {
//   Line 2:   const msg = `Hello ${name}`;
//   Line 3:   return msg;
//   Line 4: }

function buildSourceMap(sourceRelPath: string): string {
  const gen = new SourceMapGenerator({ file: 'sample.js' });
  // line 1
  gen.addMapping({
    generated: { line: 1, column: 0 },
    original: { line: 1, column: 0 },
    source: sourceRelPath,
    name: 'greet',
  });
  // line 2
  gen.addMapping({
    generated: { line: 2, column: 0 },
    original: { line: 2, column: 2 },
    source: sourceRelPath,
    name: 'msg',
  });
  // line 3
  gen.addMapping({
    generated: { line: 3, column: 0 },
    original: { line: 3, column: 2 },
    source: sourceRelPath,
  });
  return gen.toString();
}

beforeAll(async () => {
  tmpDir = join(tmpdir(), `inspector-mcp-test-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });

  // 1. External map file
  const mapContent = buildSourceMap('../src/sample.ts');
  jsFile = join(tmpDir, 'build', 'sample.js');
  await mkdir(join(tmpDir, 'build'), { recursive: true });
  await writeFile(
    jsFile,
    'function greet(name) {\n  const msg = "Hello " + name;\n  return msg;\n}\n//# sourceMappingURL=sample.js.map',
  );
  await writeFile(join(tmpDir, 'build', 'sample.js.map'), mapContent);

  // 2. Inline base64 map
  const inlineMapB64 = Buffer.from(buildSourceMap('../src/sample.ts')).toString(
    'base64',
  );
  jsFileInlineMap = join(tmpDir, 'build', 'inline.js');
  await writeFile(
    jsFileInlineMap,
    `function greet(name) {}\n//# sourceMappingURL=data:application/json;base64,${inlineMapB64}`,
  );

  // 3. File with no source map
  noMapFile = join(tmpDir, 'build', 'no-map.js');
  await writeFile(noMapFile, 'function noop() {}');
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ── SourceMapCache ────────────────────────────────────────────────────────────

describe('SourceMapCache', () => {
  it('returns null for a file that does not exist', async () => {
    const cache = new SourceMapCache();
    const consumer = await cache.getConsumer('/nonexistent/path/file.js');
    expect(consumer).toBeNull();
  });

  it('returns null for a file with no sourceMappingURL comment', async () => {
    const cache = new SourceMapCache();
    const consumer = await cache.getConsumer(noMapFile);
    expect(consumer).toBeNull();
  });

  it('loads consumer from external .js.map file', async () => {
    const cache = new SourceMapCache();
    const consumer = await cache.getConsumer(jsFile);
    expect(consumer).not.toBeNull();
  });

  it('loads consumer from inline base64 source map', async () => {
    const cache = new SourceMapCache();
    const consumer = await cache.getConsumer(jsFileInlineMap);
    expect(consumer).not.toBeNull();
  });

  it('caches the consumer (second call returns same instance)', async () => {
    const cache = new SourceMapCache();
    const first = await cache.getConsumer(jsFile);
    const second = await cache.getConsumer(jsFile);
    expect(first).toBe(second); // same reference
  });

  it('caches null result (does not retry failed loads)', async () => {
    const cache = new SourceMapCache();
    const first = await cache.getConsumer('/nonexistent.js');
    const second = await cache.getConsumer('/nonexistent.js');
    expect(first).toBeNull();
    expect(second).toBeNull();
  });

  it('invalidate removes from cache so next call reloads', async () => {
    const cache = new SourceMapCache();
    const first = await cache.getConsumer(jsFile);
    cache.invalidate(jsFile);
    const second = await cache.getConsumer(jsFile);
    // Different instances after reload
    expect(first).not.toBe(second);
    expect(second).not.toBeNull();
  });

  it('invalidateAll clears everything', async () => {
    const cache = new SourceMapCache();
    await cache.getConsumer(jsFile);
    await cache.getConsumer(jsFileInlineMap);
    cache.invalidateAll();
    // Both should reload (new instances)
    const a = await cache.getConsumer(jsFile);
    expect(a).not.toBeNull();
  });
});

// ── SourceMapResolver ─────────────────────────────────────────────────────────

describe('SourceMapResolver - generatedToOriginal', () => {
  it('returns null when no source map exists for the file', async () => {
    const cache = new SourceMapCache();
    const resolver = new SourceMapResolver(cache);
    const result = await resolver.generatedToOriginal('/nonexistent.js', 1, 0);
    expect(result).toBeNull();
  });

  it('maps generated line 1 to original line 1', async () => {
    const cache = new SourceMapCache();
    const resolver = new SourceMapResolver(cache);
    const result = await resolver.generatedToOriginal(jsFile, 1, 0);
    expect(result).not.toBeNull();
    expect(result?.line).toBe(1);
  });

  it('maps generated line 2 to original line 2 with column offset', async () => {
    const cache = new SourceMapCache();
    const resolver = new SourceMapResolver(cache);
    const result = await resolver.generatedToOriginal(jsFile, 2, 0);
    expect(result).not.toBeNull();
    expect(result?.line).toBe(2);
    expect(result?.column).toBe(2); // indented by 2 in source
  });

  it('resolves the source path relative to the js file', async () => {
    const cache = new SourceMapCache();
    const resolver = new SourceMapResolver(cache);
    const result = await resolver.generatedToOriginal(jsFile, 1, 0);
    // Source map has '../src/sample.ts' relative to build/ → should resolve to tmpDir/src/sample.ts
    expect(result?.source).toContain('sample.ts');
    expect(result?.source).toMatch(/src[/\\]sample\.ts$/);
  });

  it('returns null for a line with no mapping', async () => {
    const cache = new SourceMapCache();
    const resolver = new SourceMapResolver(cache);
    // Line 999 definitely has no mapping
    const result = await resolver.generatedToOriginal(jsFile, 999, 0);
    expect(result).toBeNull();
  });

  it('works identically with inline source map', async () => {
    const cache = new SourceMapCache();
    const resolver = new SourceMapResolver(cache);
    const result = await resolver.generatedToOriginal(jsFileInlineMap, 1, 0);
    expect(result).not.toBeNull();
    expect(result?.line).toBe(1);
  });
});

describe('SourceMapResolver - originalToGenerated', () => {
  it('returns null when no source map exists', async () => {
    const cache = new SourceMapCache();
    const resolver = new SourceMapResolver(cache);
    const result = await resolver.originalToGenerated(
      '/nonexistent.js',
      '/src/foo.ts',
      1,
      0,
    );
    expect(result).toBeNull();
  });

  it('maps original line 1 back to generated line 1', async () => {
    const cache = new SourceMapCache();
    const resolver = new SourceMapResolver(cache);
    const srcPath = join(tmpDir, 'src', 'sample.ts');
    const result = await resolver.originalToGenerated(jsFile, srcPath, 1, 0);
    expect(result).not.toBeNull();
    expect(result?.line).toBe(1);
  });

  it('maps original line 2 back to generated line 2', async () => {
    const cache = new SourceMapCache();
    const resolver = new SourceMapResolver(cache);
    const srcPath = join(tmpDir, 'src', 'sample.ts');
    const result = await resolver.originalToGenerated(jsFile, srcPath, 2, 2);
    expect(result).not.toBeNull();
    expect(result?.line).toBe(2);
  });

  it('returns null when source file is not in the map', async () => {
    const cache = new SourceMapCache();
    const resolver = new SourceMapResolver(cache);
    const result = await resolver.originalToGenerated(
      jsFile,
      '/totally/different/file.ts',
      1,
      0,
    );
    expect(result).toBeNull();
  });

  it('basename fallback matches source by filename when exact path fails', async () => {
    const cache = new SourceMapCache();
    const resolver = new SourceMapResolver(cache);
    // Pass a path that won't resolve exactly, but has the right basename
    const wrongRootPath = '/completely/wrong/root/src/sample.ts';
    const result = await resolver.originalToGenerated(
      jsFile,
      wrongRootPath,
      1,
      0,
    );
    // Should still find it via basename 'sample.ts'
    expect(result).not.toBeNull();
  });

  // ── BUG: basename fallback is too greedy ────────────────────────────────────
  //
  // findMatchingSource uses src.endsWith(basename) which can match files
  // whose name contains the target name as a suffix.
  // e.g., looking for 'server.ts' would match 'test-server.ts'.

  it('BUG: basename fallback matches wrong file if another source ends with the same basename', async () => {
    // Build a map with two sources: 'src/server.ts' and 'src/test-server.ts'
    const gen = new SourceMapGenerator({ file: 'multi.js' });
    gen.addMapping({
      generated: { line: 1, column: 0 },
      original: { line: 5, column: 0 },
      source: '../src/test-server.ts', // intentionally listed FIRST
    });
    gen.addMapping({
      generated: { line: 2, column: 0 },
      original: { line: 10, column: 0 },
      source: '../src/server.ts',
    });
    const multiJs = join(tmpDir, 'build', 'multi.js');
    const mapContent = gen.toString();
    await writeFile(multiJs, 'line1\nline2\n//# sourceMappingURL=multi.js.map');
    await writeFile(join(tmpDir, 'build', 'multi.js.map'), mapContent);

    const cache = new SourceMapCache();
    const resolver = new SourceMapResolver(cache);

    // We want to find server.ts (line 10 → generated line 2)
    // BUT 'test-server.ts'.endsWith('server.ts') === true
    // so if exact match fails, basename fallback might return test-server.ts first!
    const serverPath = '/nonexistent/root/src/server.ts'; // exact won't match
    const result = await resolver.originalToGenerated(
      multiJs,
      serverPath,
      10,
      0,
    );

    // Must return generated line 2 (server.ts line 10), NOT line 1 (test-server.ts line 5)
    // The old endsWith() fallback would match test-server.ts first (suffix match).
    // The fixed version uses path-segment matching: src.endsWith('/server.ts').
    expect(result?.line).toBe(2);
  });
});
