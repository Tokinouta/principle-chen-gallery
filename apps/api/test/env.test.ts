import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config/env';

const RESET_KEYS = [
  'DATABASE_URL',
  'ALIYUN_OSS_REGION',
  'ALIYUN_OSS_BUCKET',
  'ALIYUN_OSS_ENDPOINT',
  'ALIBABA_CLOUD_ACCESS_KEY_ID',
  'ALIBABA_CLOUD_ACCESS_KEY_SECRET',
  'ALIBABA_CLOUD_SECURITY_TOKEN',
  'ALIYUN_OSS_SIGNED_URL_TTL_SECONDS'
];

const original: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of RESET_KEYS) {
    original[key] = process.env[key];
    delete process.env[key];
  }
  process.env.DATABASE_URL = 'file:./test.db';
  process.env.ALIYUN_OSS_REGION = 'oss-cn-hangzhou';
  process.env.ALIYUN_OSS_BUCKET = 'galleria-principii-test';
});

afterEach(() => {
  for (const key of RESET_KEYS) {
    if (original[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original[key];
    }
  }
});

describe('loadConfig', () => {
  it('loads database url and OSS region/bucket with a default TTL of 900 seconds', () => {
    const config = loadConfig();
    expect(config.databaseUrl).toBe('file:./test.db');
    expect(config.oss.region).toBe('oss-cn-hangzhou');
    expect(config.oss.bucket).toBe('galleria-principii-test');
    expect(config.oss.signedUrlTtlSeconds).toBe(900);
    expect(config.oss.credentials).toBeNull();
  });

  it('parses provided credentials and STS token', () => {
    process.env.ALIBABA_CLOUD_ACCESS_KEY_ID = 'AKID';
    process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET = 'SECRET';
    process.env.ALIBABA_CLOUD_SECURITY_TOKEN = 'STS';
    const config = loadConfig();
    expect(config.oss.credentials).toEqual({
      accessKeyId: 'AKID',
      accessKeySecret: 'SECRET',
      stsToken: 'STS'
    });
  });

  it('returns null credentials when only one of id/secret is present', () => {
    process.env.ALIBABA_CLOUD_ACCESS_KEY_ID = 'AKID';
    expect(loadConfig().oss.credentials).toBeNull();
  });

  it('throws when DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL;
    expect(() => loadConfig()).toThrow(/DATABASE_URL/);
  });

  it('throws when ALIYUN_OSS_REGION is missing', () => {
    delete process.env.ALIYUN_OSS_REGION;
    expect(() => loadConfig()).toThrow(/ALIYUN_OSS_REGION/);
  });

  it('throws when ALIYUN_OSS_SIGNED_URL_TTL_SECONDS is not a positive integer', () => {
    process.env.ALIYUN_OSS_SIGNED_URL_TTL_SECONDS = 'banana';
    expect(() => loadConfig()).toThrow(/positive integer/);
  });
});
