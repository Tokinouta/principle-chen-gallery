export type MediaType = 'image' | 'video' | 'audio';

export type MediaRole = 'primary' | 'thumbnail' | 'detail' | 'video' | 'audio' | 'soundtrack';

export type MediaAvailability = 'available' | 'unavailable';

export type MediaAssetResponse = {
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

export type ArtworkResponse = {
  id: string;
  title: string;
  artist: string;
  year: number;
  medium: string;
  period: string;
  summary: string;
  description: string;
  media: MediaAssetResponse[];
};
