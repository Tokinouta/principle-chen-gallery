export type Artwork = {
  id: string;
  title: string;
  artist: string;
  year: number;
  medium: string;
  description: string;
};

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '';

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
    typeof candidate.description === 'string'
  );
}

export async function fetchArtworks(): Promise<Artwork[]> {
  const response = await fetch(`${configuredBaseUrl}/api/artworks`);

  if (!response.ok) {
    throw new Error(`Gallery request failed with status ${response.status}`);
  }

  const payload: unknown = await response.json();

  if (!Array.isArray(payload) || !payload.every(isArtwork)) {
    throw new Error('Gallery response did not match the artwork catalogue contract');
  }

  return payload;
}
