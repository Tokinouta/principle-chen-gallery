import { describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';
import type {
  ArtworkRepository,
  ArtworkRow
} from '../src/repositories/artworkRepository';
import type { OssSigner, SignedObject } from '../src/services/ossSigner';

function makeRow(overrides: Partial<ArtworkRow> & Pick<ArtworkRow, 'id' | 'title'>): ArtworkRow {
  return {
    id: overrides.id,
    title: overrides.title,
    artist: overrides.artist ?? 'Unknown',
    year: overrides.year ?? 1870,
    medium: overrides.medium ?? 'Oil on canvas',
    period: overrides.period ?? 'Victorian',
    summary: overrides.summary ?? 'A Victorian study.',
    description: overrides.description ?? 'A longer Victorian description.',
    status: overrides.status ?? 'published',
    sortOrder: overrides.sortOrder ?? 0,
    media: overrides.media ?? []
  };
}

function fixedSigner(): OssSigner {
  return {
    async signGetUrl(ossKey: string): Promise<SignedObject | null> {
      return {
        url: 'https://signed.example.invalid/' + ossKey,
        expiresAt: '2099-01-01T00:00:00.000Z'
      };
    }
  };
}

function nullSigner(): OssSigner {
  return {
    async signGetUrl(): Promise<SignedObject | null> {
      return null;
    }
  };
}

function repositoryOf(rows: ArtworkRow[]): ArtworkRepository {
  return {
    async listPublished(search?: string) {
      const term = search?.trim().toLowerCase() ?? '';
      if (term.length === 0) {
        return rows;
      }
      return rows.filter((row) => {
        const haystacks: string[] = [
          row.title,
          row.artist,
          row.medium,
          row.period,
          row.summary,
          row.description
        ];
        for (const link of row.media) {
          if (link.mediaAsset.caption) haystacks.push(link.mediaAsset.caption);
          if (link.mediaAsset.transcript) haystacks.push(link.mediaAsset.transcript);
        }
        return haystacks.some((value) => value.toLowerCase().includes(term));
      });
    },
    async findPublishedById(id: string) {
      return rows.find((row) => row.id === id) ?? null;
    }
  };
}

const opheliaRow: ArtworkRow = makeRow({
  id: 'ophelia-study',
  title: 'Study of Ophelia Among the Reeds',
  artist: 'Eleanor Ashcombe',
  year: 1864,
  medium: 'Oil on panel',
  period: 'Victorian Pre-Raphaelite',
  summary: 'A quiet riverbank meditation on Shakespearean melancholy.',
  description: 'Ophelia rests among reeds and water roses.',
  media: [
    {
      id: 'ophelia-link-primary',
      role: 'primary',
      sortOrder: 0,
      mediaAsset: {
        id: 'ophelia-primary',
        ossBucket: 'b',
        ossRegion: 'r',
        ossKey: 'artworks/ophelia-study/primary.jpg',
        mediaType: 'image',
        mimeType: 'image/jpeg',
        byteSize: 1000,
        width: 1600,
        height: 2000,
        durationSeconds: null,
        altText: 'Ophelia',
        transcript: null,
        caption: 'Primary panel'
      }
    },
    {
      id: 'ophelia-link-soundtrack',
      role: 'soundtrack',
      sortOrder: 1,
      mediaAsset: {
        id: 'ophelia-soundtrack',
        ossBucket: 'b',
        ossRegion: 'r',
        ossKey: 'artworks/ophelia-study/theme.mp3',
        mediaType: 'audio',
        mimeType: 'audio/mpeg',
        byteSize: 2000,
        width: null,
        height: null,
        durationSeconds: 90,
        altText: null,
        transcript: 'Slow pianoforte in D minor.',
        caption: 'Pianoforte theme'
      }
    }
  ]
});

const roseRow: ArtworkRow = makeRow({
  id: 'rose-window-morning',
  title: 'Morning at the Rose Window',
  artist: 'Beatrice Lydgate',
  medium: 'Watercolour and gouache',
  period: 'Victorian Gothic Revival',
  summary: 'Filtered chapel light falls across a carved stone sill.',
  description: 'A rose window study.',
  sortOrder: 1
});

const draftRow: ArtworkRow = makeRow({
  id: 'unpublished-draft',
  title: 'Draft Sketch',
  status: 'draft',
  sortOrder: 99
});

function buildTestApp(deps: { rows: ArtworkRow[]; signer?: OssSigner }) {
  const filtered = deps.rows.filter((row) => row.status === 'published');
  return buildApp({
    config: {
      databaseUrl: 'file::memory:?cache=shared',
      oss: {
        region: 'oss-cn-hangzhou',
        bucket: 'test-bucket',
        signedUrlTtlSeconds: 900,
        credentials: null
      }
    },
    repository: repositoryOf(filtered),
    signer: deps.signer ?? fixedSigner()
  });
}

describe('artworks API', () => {
  it('lists only published artworks with signed media URLs', async () => {
    const app = buildTestApp({ rows: [opheliaRow, roseRow, draftRow] });
    try {
      const response = await app.inject({ method: 'GET', url: '/api/artworks' });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(2);
      expect(body.find((a: { id: string }) => a.id === 'unpublished-draft')).toBeUndefined();
      const ophelia = body.find((a: { id: string }) => a.id === 'ophelia-study');
      expect(ophelia.media).toHaveLength(2);
      expect(ophelia.media[0]).toEqual(
        expect.objectContaining({
          role: 'primary',
          mediaType: 'image',
          status: 'available',
          signedUrl: expect.stringContaining('artworks/ophelia-study/primary.jpg'),
          expiresAt: expect.any(String)
        })
      );
      expect(ophelia.media[1]).toEqual(
        expect.objectContaining({
          role: 'soundtrack',
          mediaType: 'audio',
          status: 'available'
        })
      );
    } finally {
      await app.close();
    }
  });

  it('searches across artwork fields and media captions/transcripts', async () => {
    const app = buildTestApp({ rows: [opheliaRow, roseRow] });
    try {
      const byTitle = await app.inject({ method: 'GET', url: '/api/artworks?search=rose' });
      const titleIds = byTitle.json().map((a: { id: string }) => a.id);
      expect(titleIds).toContain('rose-window-morning');

      const byTranscript = await app.inject({ method: 'GET', url: '/api/artworks?search=pianoforte' });
      const transcriptIds = byTranscript.json().map((a: { id: string }) => a.id);
      expect(transcriptIds).toEqual(['ophelia-study']);
    } finally {
      await app.close();
    }
  });

  it('returns an empty array when search has no matches', async () => {
    const app = buildTestApp({ rows: [opheliaRow] });
    try {
      const response = await app.inject({ method: 'GET', url: '/api/artworks?search=clockwork' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('returns the matching published artwork detail by id with signed media', async () => {
    const app = buildTestApp({ rows: [opheliaRow] });
    try {
      const response = await app.inject({ method: 'GET', url: '/api/artworks/ophelia-study' });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toEqual(
        expect.objectContaining({
          id: 'ophelia-study',
          title: 'Study of Ophelia Among the Reeds',
          medium: 'Oil on panel'
        })
      );
      expect(body.media).toHaveLength(2);
    } finally {
      await app.close();
    }
  });

  it('returns 404 for a missing artwork id', async () => {
    const app = buildTestApp({ rows: [opheliaRow] });
    try {
      const response = await app.inject({ method: 'GET', url: '/api/artworks/missing-id' });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'Artwork not found' });
    } finally {
      await app.close();
    }
  });

  it('does not surface a draft artwork via the detail endpoint', async () => {
    const app = buildTestApp({ rows: [draftRow] });
    try {
      const response = await app.inject({ method: 'GET', url: '/api/artworks/unpublished-draft' });
      expect(response.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('marks media unavailable when the signer returns null, without failing the whole artwork', async () => {
    const app = buildTestApp({ rows: [opheliaRow], signer: nullSigner() });
    try {
      const response = await app.inject({ method: 'GET', url: '/api/artworks/ophelia-study' });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe('ophelia-study');
      expect(body.media).toHaveLength(2);
      for (const asset of body.media) {
        expect(asset.signedUrl).toBeNull();
        expect(asset.expiresAt).toBeNull();
        expect(asset.status).toBe('unavailable');
      }
    } finally {
      await app.close();
    }
  });

  it('returns 503 when the repository throws', async () => {
    const failingRepo: ArtworkRepository = {
      async listPublished() {
        throw new Error('db down');
      },
      async findPublishedById() {
        throw new Error('db down');
      }
    };
    const app = buildApp({
      config: {
        databaseUrl: 'file::memory:?cache=shared',
        oss: { region: 'r', bucket: 'b', signedUrlTtlSeconds: 900, credentials: null }
      },
      repository: failingRepo,
      signer: nullSigner()
    });
    try {
      const list = await app.inject({ method: 'GET', url: '/api/artworks' });
      expect(list.statusCode).toBe(503);
      expect(list.json()).toEqual({ error: 'Catalogue temporarily unavailable' });

      const detail = await app.inject({ method: 'GET', url: '/api/artworks/ophelia-study' });
      expect(detail.statusCode).toBe(503);
    } finally {
      await app.close();
    }
  });
});
