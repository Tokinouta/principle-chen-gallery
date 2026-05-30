export type MediaType = 'image' | 'video' | 'audio';

export type MediaRole = 'primary' | 'thumbnail' | 'detail' | 'video' | 'audio' | 'soundtrack';

export type MediaAvailability = 'available' | 'unavailable';

export type MediaAsset = {
  id: string;
  mediaType: MediaType;
  role: MediaRole;
  mimeType: string;
  signedUrl: string | null;
  expiresAt: string | null;
  status: MediaAvailability;
  altText?: string;
  transcript?: string;
  caption?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
};

export type Artwork = {
  id: string;
  title: string;
  artist: string;
  year: number;
  medium: string;
  period: string;
  summary: string;
  description: string;
  media: MediaAsset[];
};

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '';

const MEDIA_TYPES = new Set<MediaType>(['image', 'video', 'audio']);
const MEDIA_ROLES = new Set<MediaRole>([
  'primary',
  'thumbnail',
  'detail',
  'video',
  'audio',
  'soundtrack'
]);
const MEDIA_AVAILABILITIES = new Set<MediaAvailability>(['available', 'unavailable']);

function isMediaAsset(value: unknown): value is MediaAsset {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const signedUrlValid = candidate.signedUrl === null || typeof candidate.signedUrl === 'string';
  const expiresAtValid = candidate.expiresAt === null || typeof candidate.expiresAt === 'string';
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.mediaType === 'string' &&
    MEDIA_TYPES.has(candidate.mediaType as MediaType) &&
    typeof candidate.role === 'string' &&
    MEDIA_ROLES.has(candidate.role as MediaRole) &&
    typeof candidate.mimeType === 'string' &&
    signedUrlValid &&
    expiresAtValid &&
    typeof candidate.status === 'string' &&
    MEDIA_AVAILABILITIES.has(candidate.status as MediaAvailability)
  );
}

function isArtwork(value: unknown): value is Artwork {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.artist === 'string' &&
    typeof candidate.year === 'number' &&
    typeof candidate.medium === 'string' &&
    typeof candidate.period === 'string' &&
    typeof candidate.summary === 'string' &&
    typeof candidate.description === 'string' &&
    Array.isArray(candidate.media) &&
    candidate.media.every(isMediaAsset)
  );
}

export type FetchArtworksOptions = {
  search?: string;
};

function buildArtworksUrl(options: FetchArtworksOptions): string {
  const base = `${configuredBaseUrl}/api/artworks`;
  const search = options.search?.trim();
  if (!search) {
    return base;
  }
  const params = new URLSearchParams({ search });
  return `${base}?${params.toString()}`;
}

export async function fetchArtworks(options: FetchArtworksOptions = {}): Promise<Artwork[]> {
  const response = await fetch(buildArtworksUrl(options));

  if (!response.ok) {
    throw new Error(`Gallery request failed with status ${response.status}`);
  }

  const payload: unknown = await response.json();

  if (!Array.isArray(payload) || !payload.every(isArtwork)) {
    throw new Error('Gallery response did not match the artwork catalogue contract');
  }

  return payload;
}

export function pickCardMedia(artwork: Artwork): MediaAsset | null {
  return (
    artwork.media.find((asset) => asset.role === 'thumbnail' && asset.status === 'available') ??
    artwork.media.find((asset) => asset.role === 'primary' && asset.status === 'available') ??
    artwork.media.find((asset) => asset.mediaType === 'image' && asset.status === 'available') ??
    null
  );
}
