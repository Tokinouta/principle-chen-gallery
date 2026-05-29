import { describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';

describe('artworks API', () => {
  it('lists Victorian gallery artworks as a JSON array', async () => {
    const app = buildApp();

    try {
      const response = await app.inject({ method: 'GET', url: '/api/artworks' });
      const artworks = response.json();

      expect(response.statusCode).toBe(200);
      expect(Array.isArray(artworks)).toBe(true);
      expect(artworks).toHaveLength(6);
      expect(artworks).toContainEqual(
        expect.objectContaining({
          id: 'ophelia-study',
          title: 'Study of Ophelia Among the Reeds',
          medium: 'Oil on panel',
          year: 1864
        })
      );
    } finally {
      await app.close();
    }
  });

  it('filters artworks case-insensitively across gallery text fields', async () => {
    const app = buildApp();

    try {
      const response = await app.inject({ method: 'GET', url: '/api/artworks?search=rose' });
      const artworks = response.json();

      expect(response.statusCode).toBe(200);
      expect(artworks).toEqual([
        expect.objectContaining({ id: 'ophelia-study' }),
        expect.objectContaining({ id: 'rose-window-morning' })
      ]);
    } finally {
      await app.close();
    }
  });

  it('returns an empty array when search has no matches', async () => {
    const app = buildApp();

    try {
      const response = await app.inject({ method: 'GET', url: '/api/artworks?search=clockwork' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('returns the matching artwork detail by id', async () => {
    const app = buildApp();

    try {
      const response = await app.inject({ method: 'GET', url: '/api/artworks/ophelia-study' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(
        expect.objectContaining({
          id: 'ophelia-study',
          title: 'Study of Ophelia Among the Reeds',
          medium: 'Oil on panel'
        })
      );
    } finally {
      await app.close();
    }
  });

  it('returns a not found response when an artwork id is missing', async () => {
    const app = buildApp();

    try {
      const response = await app.inject({ method: 'GET', url: '/api/artworks/missing-id' });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'Artwork not found' });
    } finally {
      await app.close();
    }
  });
});
