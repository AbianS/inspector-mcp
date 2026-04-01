import { CONSOLE_BUFFER_MAX } from '../constants.js';
import type {
  ConsoleEntry,
  ConsoleFilter,
  ConsoleLevel,
  ConsoleReadResult,
} from '../types.js';

export class ConsoleBuffer {
  private entries: ConsoleEntry[] = [];
  private counter = 0;
  private head = 0;

  push(entry: Omit<ConsoleEntry, 'index'>): void {
    const indexed: ConsoleEntry = { ...entry, index: this.counter++ };
    if (this.entries.length < CONSOLE_BUFFER_MAX) {
      this.entries.push(indexed);
    } else {
      this.entries[this.head] = indexed;
      this.head = (this.head + 1) % CONSOLE_BUFFER_MAX;
    }
  }

  read(filter: ConsoleFilter): ConsoleReadResult {
    const sorted = this.toSorted();
    const filtered = sorted.filter((e) => {
      if (filter.level !== 'all' && e.level !== filter.level) return false;
      if (filter.filter && !e.text.includes(filter.filter)) return false;
      return true;
    });
    const total = filtered.length;
    const entries = filtered.slice(filter.offset, filter.offset + filter.limit);
    return { total, entries };
  }

  clear(): number {
    const count = this.entries.length;
    this.entries = [];
    this.head = 0;
    return count;
  }

  private toSorted(): ConsoleEntry[] {
    if (this.entries.length < CONSOLE_BUFFER_MAX) {
      return [...this.entries].sort((a, b) => a.index - b.index);
    }
    const after = this.entries.slice(this.head);
    const before = this.entries.slice(0, this.head);
    return [...after, ...before];
  }
}

export function consoleEntryLevelFromCdp(type: string): ConsoleLevel {
  const map: Record<string, ConsoleLevel> = {
    log: 'log',
    info: 'info',
    warning: 'warn',
    error: 'error',
    debug: 'debug',
    dir: 'dir',
    table: 'table',
    startGroup: 'group',
    startGroupCollapsed: 'group',
    endGroup: 'groupEnd',
    clear: 'clear',
  };
  return map[type] ?? 'log';
}
