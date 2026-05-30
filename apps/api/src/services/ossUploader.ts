import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

import OSS from 'ali-oss';

import type { OssConfig } from '../config/env.js';

export interface OssUploader {
  head(ossKey: string): Promise<boolean>;
  put(ossKey: string, localPath: string, contentType: string): Promise<void>;
}

export class AliyunOssUploader implements OssUploader {
  private readonly client: OSS;

  constructor(config: OssConfig) {
    if (!config.credentials) {
      throw new Error('AliyunOssUploader requires OSS credentials');
    }
    this.client = new OSS({
      region: config.region,
      bucket: config.bucket,
      endpoint: config.endpoint,
      accessKeyId: config.credentials.accessKeyId,
      accessKeySecret: config.credentials.accessKeySecret,
      stsToken: config.credentials.stsToken,
      secure: true
    });
  }

  async head(ossKey: string): Promise<boolean> {
    try {
      await this.client.head(ossKey);
      return true;
    } catch (error) {
      if (isNotFoundError(error)) {
        return false;
      }
      throw error;
    }
  }

  async put(ossKey: string, localPath: string, contentType: string): Promise<void> {
    const fileStat = await stat(localPath);
    const stream = createReadStream(localPath);
    const options: Partial<OSS.PutStreamOptions> = {
      contentLength: fileStat.size,
      mime: contentType
    };
    await this.client.putStream(ossKey, stream, options as OSS.PutStreamOptions);
  }
}

function isNotFoundError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as { status?: number; code?: string; name?: string };
  if (candidate.status === 404) return true;
  if (candidate.code === 'NoSuchKey') return true;
  if (candidate.name === 'NoSuchKeyError') return true;
  return false;
}

type QueuedError = { kind: 'put' | 'head'; error: Error };

export class StubOssUploader implements OssUploader {
  readonly heads: string[] = [];
  readonly puts: Array<{ ossKey: string; localPath: string; contentType: string }> = [];
  private readonly present = new Set<string>();
  private readonly queuedErrors: QueuedError[] = [];

  preseedPresent(...ossKeys: string[]): void {
    for (const key of ossKeys) {
      this.present.add(key);
    }
  }

  queuePutError(error: Error): void {
    this.queuedErrors.push({ kind: 'put', error });
  }

  queueHeadError(error: Error): void {
    this.queuedErrors.push({ kind: 'head', error });
  }

  async head(ossKey: string): Promise<boolean> {
    this.heads.push(ossKey);
    const queued = this.takeQueued('head');
    if (queued) throw queued;
    return this.present.has(ossKey);
  }

  async put(ossKey: string, localPath: string, contentType: string): Promise<void> {
    const queued = this.takeQueued('put');
    if (queued) throw queued;
    this.puts.push({ ossKey, localPath, contentType });
    this.present.add(ossKey);
  }

  private takeQueued(kind: 'put' | 'head'): Error | null {
    const index = this.queuedErrors.findIndex((entry) => entry.kind === kind);
    if (index === -1) return null;
    const [entry] = this.queuedErrors.splice(index, 1);
    return entry.error;
  }
}

export function createOssUploader(config: OssConfig): OssUploader {
  if (!config.credentials) {
    throw new Error('OSS credentials required');
  }
  return new AliyunOssUploader(config);
}
