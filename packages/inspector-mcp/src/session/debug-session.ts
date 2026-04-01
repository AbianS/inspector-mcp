import { BreakpointRegistry } from '../cdp/breakpoint-registry.js';
import {
  type CdpClientInstance,
  createCdpClient,
  enableDomains,
  filePathToUrlRegex,
  remoteObjectToVariableInfo,
} from '../cdp/cdp-client.js';
import {
  ConsoleBuffer,
  consoleEntryLevelFromCdp,
} from '../cdp/console-buffer.js';
import {
  CdpConnectionError,
  SessionNotConnectedError,
  SessionNotPausedError,
} from '../errors.js';
import { SourceMapCache } from '../sourcemaps/source-map-cache.js';
import { SourceMapResolver } from '../sourcemaps/source-map-resolver.js';
import type {
  BreakpointInfo,
  CallFrame,
  ConsoleFilter,
  ConsoleReadResult,
  DebugSessionInfo,
  EvalResult,
  PauseLocation,
  ScopeFilter,
  SessionStatus,
  VariableInfo,
} from '../types.js';
import { ReconnectManager } from './reconnect-manager.js';

interface RawCallFrame {
  callFrameId: string;
  functionName: string;
  url: string;
  location: { scriptId: string; lineNumber: number; columnNumber?: number };
  scopeChain: Array<{
    type: string;
    object: { objectId?: string; type: string; description?: string };
  }>;
}

export class DebugSession {
  readonly sessionId: string;
  readonly host: string;
  readonly port: number;
  readonly autoReconnect: boolean;

  private client: CdpClientInstance | null = null;
  private _status: SessionStatus = 'disconnected';
  private _pauseLocation: PauseLocation | null = null;
  private rawPausedCallFrames: RawCallFrame[] = [];
  private connectedAt: Date | null = null;

  private readonly consoleBuffer: ConsoleBuffer;
  private readonly breakpointRegistry: BreakpointRegistry;
  private readonly sourceMapCache: SourceMapCache;
  private readonly sourceMapResolver: SourceMapResolver;
  private reconnectManager: ReconnectManager;

  constructor(host: string, port: number, autoReconnect: boolean) {
    this.host = host;
    this.port = port;
    this.autoReconnect = autoReconnect;
    this.sessionId = `${host}:${port}`;
    this.consoleBuffer = new ConsoleBuffer();
    this.breakpointRegistry = new BreakpointRegistry();
    this.sourceMapCache = new SourceMapCache();
    this.sourceMapResolver = new SourceMapResolver(this.sourceMapCache);
    this.reconnectManager = new ReconnectManager(
      () => this.attemptReconnect(),
      () => this.onReconnectExhausted(),
    );
  }

  get status(): SessionStatus {
    return this._status;
  }

  get pauseLocation(): PauseLocation | null {
    return this._pauseLocation;
  }

  get info(): DebugSessionInfo {
    return {
      sessionId: this.sessionId,
      host: this.host,
      port: this.port,
      status: this._status,
      pausedAt: this._pauseLocation,
      connectedAt: this.connectedAt?.toISOString() ?? null,
      reconnectAttempt: this.reconnectManager.currentAttempt,
    };
  }

  async connect(): Promise<void> {
    this._status = 'connecting';
    try {
      const client = await createCdpClient(this.host, this.port);
      await this.setupClient(client);
      this._status = 'connected';
      this.connectedAt = new Date();
    } catch (err) {
      this._status = 'disconnected';
      throw new CdpConnectionError(this.host, this.port, err);
    }
  }

  async disconnect(): Promise<void> {
    this.reconnectManager.stop();
    const client = this.client;
    this.client = null;
    this._status = 'disconnected';
    this._pauseLocation = null;
    if (client) {
      try {
        await client.close();
      } catch {
        // ignore close errors
      }
    }
  }

  // Breakpoints

  async setBreakpoint(params: {
    filePath: string;
    lineNumber: number;
    columnNumber: number;
    condition?: string;
  }): Promise<BreakpointInfo> {
    this.assertConnectedOrPaused();
    const { Debugger } = this.client!;

    const jsFilePath = this.tsPathToJsPath(params.filePath);
    let generatedLine = params.lineNumber;
    let generatedColumn = params.columnNumber;
    let warning: string | undefined;

    if (jsFilePath) {
      const gen = await this.sourceMapResolver.originalToGenerated(
        jsFilePath,
        params.filePath,
        params.lineNumber,
        params.columnNumber,
      );
      if (gen) {
        generatedLine = gen.line;
        generatedColumn = gen.column;
      } else {
        warning = `Source map not found for ${params.filePath}. Breakpoint set by URL pattern, may not resolve correctly.`;
      }
    }

    const urlRegex = filePathToUrlRegex(params.filePath);

    const result = await Debugger.setBreakpointByUrl({
      urlRegex,
      lineNumber: generatedLine - 1,
      columnNumber: generatedColumn,
      condition: params.condition,
    });

    const verified =
      Array.isArray(result.locations) && result.locations.length > 0;

    return this.breakpointRegistry.add({
      cdpBreakpointId: result.breakpointId,
      filePath: params.filePath,
      lineNumber: params.lineNumber,
      columnNumber: params.columnNumber,
      condition: params.condition,
      verified,
      warning,
    });
  }

  async removeBreakpoint(id: string): Promise<void> {
    this.assertConnectedOrPaused();
    const bp = this.breakpointRegistry.getById(id);
    if (!bp) throw new Error(`Breakpoint '${id}' not found.`);
    if (bp.cdpBreakpointId) {
      const { Debugger } = this.client!;
      await Debugger.removeBreakpoint({ breakpointId: bp.cdpBreakpointId });
    }
    this.breakpointRegistry.remove(id);
  }

  listBreakpoints(): BreakpointInfo[] {
    return this.breakpointRegistry.getAll();
  }

  // Execution

  async resume(): Promise<void> {
    this.assertPaused();
    await this.client!.Debugger.resume({});
  }

  async stepOver(): Promise<void> {
    this.assertPaused();
    await this.client!.Debugger.stepOver({});
  }

  async stepInto(): Promise<void> {
    this.assertPaused();
    await this.client!.Debugger.stepInto({});
  }

  async stepOut(): Promise<void> {
    this.assertPaused();
    await this.client!.Debugger.stepOut();
  }

  async pauseExecution(): Promise<void> {
    this.assertConnectedOrPaused();
    await this.client!.Debugger.pause();
  }

  // Inspection

  getStackTrace(): CallFrame[] {
    this.assertPaused();
    return this._pauseLocation!.callFrames;
  }

  async getVariables(
    frameIndex: number,
    scopeFilter: ScopeFilter,
  ): Promise<VariableInfo[]> {
    this.assertPaused();
    const rawFrame = this.rawPausedCallFrames[frameIndex];
    if (!rawFrame) throw new Error(`Frame index ${frameIndex} out of range.`);

    const { Runtime } = this.client!;
    const scopeTypes = this.scopeFilterToTypes(scopeFilter);
    const scopes = rawFrame.scopeChain.filter((s) =>
      scopeTypes.includes(s.type),
    );

    const results: VariableInfo[] = [];
    const seen = new Set<string>();

    for (const scope of scopes) {
      const objectId = scope.object.objectId;
      if (!objectId) continue;

      const props = await Runtime.getProperties({
        objectId,
        ownProperties: true,
        generatePreview: false,
      });

      for (const prop of props.result) {
        if (seen.has(prop.name)) continue;
        seen.add(prop.name);
        if (prop.value) {
          results.push(remoteObjectToVariableInfo(prop.name, prop.value));
        }
      }
    }

    return results;
  }

  async evaluate(
    expression: string,
    frameIndex: number,
    returnByValue: boolean,
  ): Promise<EvalResult> {
    this.assertPaused();
    const rawFrame = this.rawPausedCallFrames[frameIndex];
    if (!rawFrame) throw new Error(`Frame index ${frameIndex} out of range.`);

    const result = await this.client!.Debugger.evaluateOnCallFrame({
      callFrameId: rawFrame.callFrameId,
      expression,
      returnByValue,
      includeCommandLineAPI: true,
    });

    if (result.exceptionDetails) {
      return {
        value: null,
        type: 'error',
        isError: true,
        errorText:
          result.exceptionDetails.text +
          (result.exceptionDetails.exception?.description
            ? `: ${result.exceptionDetails.exception.description}`
            : ''),
      };
    }

    const obj = result.result;
    return {
      value: returnByValue ? obj.value : undefined,
      type: obj.subtype ? `${obj.type}(${obj.subtype})` : obj.type,
      objectId: obj.objectId,
      isError: false,
    };
  }

  async getProperties(
    objectId: string,
    ownProperties: boolean,
  ): Promise<VariableInfo[]> {
    this.assertPaused();
    const props = await this.client!.Runtime.getProperties({
      objectId,
      ownProperties,
      generatePreview: false,
    });
    return props.result
      .filter((p) => p.value !== undefined)
      .map((p) => remoteObjectToVariableInfo(p.name, p.value!));
  }

  // Console

  readConsole(filter: ConsoleFilter): ConsoleReadResult {
    return this.consoleBuffer.read(filter);
  }

  clearConsole(): number {
    return this.consoleBuffer.clear();
  }

  // Private helpers

  private async setupClient(client: CdpClientInstance): Promise<void> {
    this.client = client;
    await enableDomains(client);
    this.wireEvents(client);
  }

  private wireEvents(client: CdpClientInstance): void {
    client.Debugger.paused((params) => {
      void this.onPaused(params);
    });

    client.Debugger.resumed(() => {
      this.onResumed();
    });

    client.Runtime.consoleAPICalled((params) => {
      const args = (
        params.args as Array<{
          type: string;
          value?: unknown;
          description?: string;
        }>
      ).map((a) =>
        a.type === 'string' ? String(a.value) : (a.description ?? a.type),
      );
      this.consoleBuffer.push({
        timestamp: new Date().toISOString(),
        level: consoleEntryLevelFromCdp(params.type),
        text: args.join(' '),
        args,
      });
    });

    client.on('disconnect', () => {
      void this.handleDisconnect();
    });
  }

  private async onPaused(params: {
    callFrames: RawCallFrame[];
    reason: string;
    hitBreakpoints?: string[];
  }): Promise<void> {
    this._status = 'paused';
    this.rawPausedCallFrames = params.callFrames;

    const translatedFrames = await this.translateCallFrames(params.callFrames);

    this._pauseLocation = {
      reason: params.reason,
      breakpointId: params.hitBreakpoints?.[0],
      callFrames: translatedFrames,
    };
  }

  private onResumed(): void {
    this._status = 'connected';
    this._pauseLocation = null;
    this.rawPausedCallFrames = [];
  }

  private async handleDisconnect(): Promise<void> {
    this._status = 'disconnected';
    this._pauseLocation = null;
    this.rawPausedCallFrames = [];
    this.client = null;
    this.breakpointRegistry.markAllUnverified();
    this.sourceMapCache.invalidateAll();

    if (this.autoReconnect) {
      this._status = 'reconnecting';
      this.reconnectManager.start();
    }
  }

  private async attemptReconnect(): Promise<boolean> {
    try {
      const client = await createCdpClient(this.host, this.port);
      await this.setupClient(client);
      this._status = 'connected';
      this.connectedAt = new Date();
      await this.reRegisterBreakpoints();
      return true;
    } catch {
      return false;
    }
  }

  private onReconnectExhausted(): void {
    this._status = 'disconnected';
  }

  private async reRegisterBreakpoints(): Promise<void> {
    const { Debugger } = this.client!;
    const unverified = this.breakpointRegistry
      .getAll()
      .filter((bp) => !bp.verified);

    for (const bp of unverified) {
      try {
        const jsFilePath = this.tsPathToJsPath(bp.filePath);
        let generatedLine = bp.lineNumber;
        let generatedColumn = bp.columnNumber;

        if (jsFilePath) {
          const gen = await this.sourceMapResolver.originalToGenerated(
            jsFilePath,
            bp.filePath,
            bp.lineNumber,
            bp.columnNumber,
          );
          if (gen) {
            generatedLine = gen.line;
            generatedColumn = gen.column;
          }
        }

        const urlRegex = filePathToUrlRegex(bp.filePath);
        const result = await Debugger.setBreakpointByUrl({
          urlRegex,
          lineNumber: generatedLine - 1,
          columnNumber: generatedColumn,
          condition: bp.condition,
        });

        const verified =
          Array.isArray(result.locations) && result.locations.length > 0;
        this.breakpointRegistry.updateCdpId(
          bp.id,
          result.breakpointId,
          verified,
        );
      } catch {
        // leave as unverified
      }
    }
  }

  private async translateCallFrames(
    rawFrames: RawCallFrame[],
  ): Promise<CallFrame[]> {
    const translated: CallFrame[] = [];

    for (const raw of rawFrames) {
      const rawLine = raw.location.lineNumber + 1;
      const rawCol = raw.location.columnNumber ?? 0;
      let url = raw.url;
      let line = rawLine;
      let col = rawCol;

      try {
        const jsPath = this.urlToFilePath(raw.url);
        if (jsPath) {
          const original = await this.sourceMapResolver.generatedToOriginal(
            jsPath,
            rawLine,
            rawCol,
          );
          if (original) {
            url = original.source;
            line = original.line;
            col = original.column;
          }
        }
      } catch {
        // use raw values
      }

      translated.push({
        frameId: raw.callFrameId,
        functionName: raw.functionName || '(anonymous)',
        url,
        lineNumber: line,
        columnNumber: col,
        rawUrl: raw.url,
        rawLineNumber: rawLine,
        rawColumnNumber: rawCol,
      });
    }

    return translated;
  }

  private tsPathToJsPath(tsPath: string): string | null {
    if (!tsPath.endsWith('.ts') && !tsPath.endsWith('.tsx')) return null;
    return tsPath.replace(/\/src\//, '/build/').replace(/\.tsx?$/, '.js');
  }

  private urlToFilePath(url: string): string | null {
    if (url.startsWith('file://')) return url.slice(7);
    if (url.startsWith('/')) return url;
    return null;
  }

  private assertPaused(): void {
    if (this._status !== 'paused') {
      throw new SessionNotPausedError(this._status);
    }
  }

  private assertConnectedOrPaused(): void {
    if (this._status !== 'connected' && this._status !== 'paused') {
      throw new SessionNotConnectedError(this._status);
    }
  }

  private scopeFilterToTypes(filter: ScopeFilter): string[] {
    switch (filter) {
      case 'local':
        return ['local'];
      case 'closure':
        return ['closure'];
      case 'global':
        return ['global'];
      case 'all':
        return ['local', 'closure', 'global', 'script', 'module'];
    }
  }
}
