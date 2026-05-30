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
export declare function createArtworkRepository(prisma: PrismaClient): ArtworkRepository;
