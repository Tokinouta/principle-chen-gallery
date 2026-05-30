import OSS from 'ali-oss';

import type { OssConfig } from '../config/env.js';

export type SignedObject = {
  url: string;
  expiresAt: string;
};

export interface OssSigner {
  // Returns null when signing is unavailable (no credentials, transient
  // SDK error). Caller maps null to status: "unavailable" media; a single
  // asset failure must never fail the whole artwork response.
  signGetUrl(ossKey: string): Promise<SignedObject | null>;
}

export class NullOssSigner implements OssSigner {
  async signGetUrl(): Promise<SignedObject | null> {
    return null;
  }
}

export class AliyunOssSigner implements OssSigner {
  private readonly client: OSS;
  private readonly ttlSeconds: number;

  constructor(config: OssConfig) {
    if (!config.credentials) {
      throw new Error('AliyunOssSigner requires OSS credentials');
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
    this.ttlSeconds = config.signedUrlTtlSeconds;
  }

  async signGetUrl(ossKey: string): Promise<SignedObject | null> {
    try {
      const url = this.client.signatureUrl(ossKey, {
        expires: this.ttlSeconds,
        method: 'GET'
      });
      const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000).toISOString();
      return { url, expiresAt };
    } catch {
      return null;
    }
  }
}

export function createOssSigner(config: OssConfig): OssSigner {
  if (!config.credentials) {
    return new NullOssSigner();
  }
  return new AliyunOssSigner(config);
}
