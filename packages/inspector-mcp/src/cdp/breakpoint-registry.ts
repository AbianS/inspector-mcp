import { randomUUID } from 'node:crypto';
import type { BreakpointInfo } from '../types.js';

export class BreakpointRegistry {
  private byId = new Map<string, BreakpointInfo>();

  add(params: {
    cdpBreakpointId: string;
    filePath: string;
    lineNumber: number;
    columnNumber: number;
    condition?: string;
    verified: boolean;
    warning?: string;
  }): BreakpointInfo {
    const bp: BreakpointInfo = {
      id: randomUUID(),
      ...params,
    };
    this.byId.set(bp.id, bp);
    return bp;
  }

  getById(id: string): BreakpointInfo | undefined {
    return this.byId.get(id);
  }

  getAll(): BreakpointInfo[] {
    return Array.from(this.byId.values());
  }

  remove(id: string): boolean {
    return this.byId.delete(id);
  }

  markAllUnverified(): void {
    for (const bp of this.byId.values()) {
      bp.verified = false;
      bp.cdpBreakpointId = '';
    }
  }

  updateCdpId(id: string, cdpBreakpointId: string, verified: boolean): void {
    const bp = this.byId.get(id);
    if (bp) {
      bp.cdpBreakpointId = cdpBreakpointId;
      bp.verified = verified;
      bp.warning = undefined;
    }
  }
}
