import { dirname, resolve } from 'node:path';
import type { BasicSourceMapConsumer } from 'source-map';
import { SourceMapCache } from './source-map-cache.js';

export interface OriginalPosition {
  source: string;
  line: number;
  column: number;
  name: string | null;
}

export interface GeneratedPosition {
  line: number;
  column: number;
}

export class SourceMapResolver {
  constructor(private readonly cache: SourceMapCache) {}

  async generatedToOriginal(
    jsFilePath: string,
    generatedLine: number,
    generatedColumn: number,
  ): Promise<OriginalPosition | null> {
    const consumer = await this.cache.getConsumer(jsFilePath);
    if (!consumer) return null;

    const pos = consumer.originalPositionFor({
      line: generatedLine,
      column: generatedColumn,
    });

    if (!pos.source || pos.line === null) return null;

    const resolvedSource = this.resolveSourcePath(jsFilePath, pos.source);

    return {
      source: resolvedSource,
      line: pos.line,
      column: pos.column ?? 0,
      name: pos.name ?? null,
    };
  }

  async originalToGenerated(
    jsFilePath: string,
    sourcePath: string,
    originalLine: number,
    originalColumn: number,
  ): Promise<GeneratedPosition | null> {
    const consumer = await this.cache.getConsumer(jsFilePath);
    if (!consumer) return null;

    const sources = (consumer as BasicSourceMapConsumer).sources ?? [];
    const matchedSource = this.findMatchingSource(
      sources,
      sourcePath,
      jsFilePath,
    );
    if (!matchedSource) return null;

    const pos = consumer.generatedPositionFor({
      source: matchedSource,
      line: originalLine,
      column: originalColumn,
    });

    if (pos.line === null) return null;

    return { line: pos.line, column: pos.column ?? 0 };
  }

  private resolveSourcePath(jsFilePath: string, source: string): string {
    if (source.startsWith('/')) return source;
    return resolve(dirname(jsFilePath), source);
  }

  private findMatchingSource(
    sources: readonly string[],
    targetPath: string,
    jsFilePath: string,
  ): string | null {
    const normalizedTarget = resolve(targetPath);

    for (const src of sources) {
      const resolvedSrc = this.resolveSourcePath(jsFilePath, src);
      if (resolve(resolvedSrc) === normalizedTarget) return src;
    }

    const targetBasename = targetPath.split('/').pop() ?? '';
    for (const src of sources) {
      // Use path-segment match to avoid 'test-server.ts'.endsWith('server.ts') false positives
      if (src === targetBasename || src.endsWith(`/${targetBasename}`))
        return src;
    }

    return null;
  }
}
