import type { ArtworkRow, MediaAssetRow } from '../repositories/artworkRepository.js';
import type {
  ArtworkResponse,
  MediaAssetResponse,
  MediaRole,
  MediaType
} from '../types/artwork.js';
import type { OssSigner } from './ossSigner.js';

const MEDIA_TYPES: ReadonlySet<MediaType> = new Set(['image', 'video', 'audio']);
const MEDIA_ROLES: ReadonlySet<MediaRole> = new Set([
  'primary',
  'thumbnail',
  'detail',
  'video',
  'audio',
  'soundtrack'
]);

function toMediaType(value: string): MediaType {
  return MEDIA_TYPES.has(value as MediaType) ? (value as MediaType) : 'image';
}

function toMediaRole(value: string): MediaRole {
  return MEDIA_ROLES.has(value as MediaRole) ? (value as MediaRole) : 'detail';
}

function optionalString(value: string | null): string | undefined {
  return value === null ? undefined : value;
}

function optionalNumber(value: number | null): number | undefined {
  return value === null ? undefined : value;
}

async function presentMediaAsset(
  link: { id: string; role: string; mediaAsset: MediaAssetRow },
  signer: OssSigner
): Promise<MediaAssetResponse> {
  const asset = link.mediaAsset;
  const signed = await signer.signGetUrl(asset.ossKey);
  return {
    id: asset.id,
    mediaType: toMediaType(asset.mediaType),
    role: toMediaRole(link.role),
    mimeType: asset.mimeType,
    signedUrl: signed?.url ?? null,
    expiresAt: signed?.expiresAt ?? null,
    status: signed ? 'available' : 'unavailable',
    altText: optionalString(asset.altText),
    transcript: optionalString(asset.transcript),
    caption: optionalString(asset.caption),
    width: optionalNumber(asset.width),
    height: optionalNumber(asset.height),
    durationSeconds: optionalNumber(asset.durationSeconds)
  };
}

export async function presentArtwork(
  row: ArtworkRow,
  signer: OssSigner
): Promise<ArtworkResponse> {
  const media = await Promise.all(row.media.map((link) => presentMediaAsset(link, signer)));
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    year: row.year,
    medium: row.medium,
    period: row.period,
    summary: row.summary,
    description: row.description,
    media
  };
}

export function presentArtworks(
  rows: ArtworkRow[],
  signer: OssSigner
): Promise<ArtworkResponse[]> {
  return Promise.all(rows.map((row) => presentArtwork(row, signer)));
}
