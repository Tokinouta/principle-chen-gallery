import type { PrismaClient } from '@prisma/client';

export type MediaAssetRow = {
  id: string;
  ossBucket: string;
  ossRegion: string;
  ossKey: string;
  mediaType: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  altText: string | null;
  transcript: string | null;
  caption: string | null;
};

export type ArtworkMediaRow = {
  id: string;
  role: string;
  sortOrder: number;
  mediaAsset: MediaAssetRow;
};

export type ArtworkRow = {
  id: string;
  title: string;
  artist: string;
  year: number;
  medium: string;
  period: string;
  summary: string;
  description: string;
  status: string;
  sortOrder: number;
  media: ArtworkMediaRow[];
};

export type ArtworkRepository = {
  listPublished(search?: string): Promise<ArtworkRow[]>;
  findPublishedById(id: string): Promise<ArtworkRow | null>;
};

const MEDIA_INCLUDE = {
  orderBy: { sortOrder: 'asc' as const },
  include: { mediaAsset: true }
};

function normalizeSearchTerm(search: string | undefined): string {
  return search?.trim().toLowerCase() ?? '';
}

function rowMatchesSearch(row: ArtworkRow, term: string): boolean {
  if (term.length === 0) {
    return true;
  }
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
}

export function createArtworkRepository(prisma: PrismaClient): ArtworkRepository {
  return {
    async listPublished(search) {
      const term = normalizeSearchTerm(search);
      const rows = (await prisma.artwork.findMany({
        where: { status: 'published' },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        include: { media: MEDIA_INCLUDE }
      })) as unknown as ArtworkRow[];
      return rows.filter((row) => rowMatchesSearch(row, term));
    },

    async findPublishedById(id) {
      const row = (await prisma.artwork.findFirst({
        where: { id, status: 'published' },
        include: { media: MEDIA_INCLUDE }
      })) as unknown as ArtworkRow | null;
      return row;
    }
  };
}
