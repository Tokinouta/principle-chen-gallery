import { describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';

const TEST_CONFIG = {
  databaseUrl: 'file::memory:?cache=shared',
  oss: {
    region: 'oss-cn-hangzhou',
    bucket: 'test-bucket',
    signedUrlTtlSeconds: 900,
    credentials: null
  }
};

describe('health API', () => {
  it('reports that the API is healthy', async () => {
    const app = buildApp({
      config: TEST_CONFIG,
      repository: {
        async listPublished() {
          return [];
        },
        async findPublishedById() {
          return null;
        }
      },
      signer: { async signGetUrl() { return null; } }
    });

    try {
      const response = await app.inject({ method: 'GET', url: '/health' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });
    } finally {
      await app.close();
    }
  });
});
