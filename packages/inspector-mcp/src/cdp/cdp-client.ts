import CDP from 'chrome-remote-interface';
import type { VariableInfo } from '../types.js';

export type CdpClientInstance = Awaited<ReturnType<typeof CDP>>;

export async function createCdpClient(
  host: string,
  port: number,
): Promise<CdpClientInstance> {
  const client = await CDP({ host, port });
  return client;
}

export async function enableDomains(client: CdpClientInstance): Promise<void> {
  const { Debugger, Runtime, Console } = client;
  await Debugger.enable({});
  await Runtime.enable();
  await Console.enable();
}

export function remoteObjectToVariableInfo(
  name: string,
  remoteObject: {
    type: string;
    subtype?: string;
    value?: unknown;
    description?: string;
    objectId?: string;
    unserializableValue?: string;
  },
): VariableInfo {
  const { type, subtype, value, description, objectId, unserializableValue } =
    remoteObject;

  let valueStr: string;
  if (type === 'undefined') {
    valueStr = 'undefined';
  } else if (unserializableValue !== undefined) {
    valueStr = unserializableValue;
  } else if (objectId !== undefined) {
    valueStr = description ?? `[${subtype ?? type}]`;
  } else if (type === 'string') {
    valueStr = JSON.stringify(value);
  } else {
    valueStr = String(value);
  }

  const typeLabel = subtype ? `${type}(${subtype})` : type;

  return {
    name,
    value: valueStr,
    type: typeLabel,
    objectId,
    isExpandable: objectId !== undefined,
  };
}

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function filePathToUrlRegex(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  const filename = parts[parts.length - 1] ?? filePath;
  return `.*\\/${escapeRegex(filename)}$`;
}
