import { describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';

describe('health API', () => {
  it('reports that the API is healthy', async () => {
    const app = buildApp();

    try {
      const response = await app.inject({ method: 'GET', url: '/health' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });
    } finally {
      await app.close();
    }
  });
});
