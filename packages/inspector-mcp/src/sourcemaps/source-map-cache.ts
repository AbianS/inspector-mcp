import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { SourceMapConsumer } from 'source-map';

export class SourceMapCache {
  private cache = new Map<string, SourceMapConsumer | null>();

  async getConsumer(jsFilePath: string): Promise<SourceMapConsumer | null> {
    if (this.cache.has(jsFilePath)) {
      return this.cache.get(jsFilePath) ?? null;
    }
    const consumer = await this.loadConsumer(jsFilePath);
    this.cache.set(jsFilePath, consumer);
    return consumer;
  }

  invalidate(jsFilePath: string): void {
    const consumer = this.cache.get(jsFilePath);
    if (consumer) consumer.destroy();
    this.cache.delete(jsFilePath);
  }

  invalidateAll(): void {
    for (const consumer of this.cache.values()) {
      consumer?.destroy();
    }
    this.cache.clear();
  }

  private async loadConsumer(
    jsFilePath: string,
  ): Promise<SourceMapConsumer | null> {
    try {
      const content = await readFile(jsFilePath, 'utf-8');
      const match = content.match(/\/\/[#@]\s+sourceMappingURL=(.+)$/m);
      if (!match || !match[1]) return null;

      const url = match[1].trim();

      let rawMap: string;

      if (url.startsWith('data:application/json')) {
        const base64Match = url.match(/base64,(.+)$/);
        if (!base64Match || !base64Match[1]) return null;
        rawMap = Buffer.from(base64Match[1], 'base64').toString('utf-8');
      } else if (url.startsWith('http://') || url.startsWith('https://')) {
        return null;
      } else {
        const mapPath = resolve(dirname(jsFilePath), url);
        rawMap = await readFile(mapPath, 'utf-8');
      }

      return await new SourceMapConsumer(rawMap);
    } catch {
      return null;
    }
  }
}
