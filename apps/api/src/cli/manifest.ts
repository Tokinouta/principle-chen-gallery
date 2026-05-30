import { access, constants, readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

export type MediaType = 'image' | 'video' | 'audio';
export type MediaRole = 'primary' | 'thumbnail' | 'detail' | 'video' | 'audio' | 'soundtrack';
export type ArtworkStatus = 'draft' | 'published' | 'archived';

export type ManifestArtwork = {
  id: string;
  title: string;
  artist: string;
  year: number;
  medium: string;
  period: string;
  summary: string;
  description: string;
  status: ArtworkStatus;
  sortOrder: number;
};

export type ManifestMedia = {
  id: string;
  file: string;
  resolvedPath: string;
  role: MediaRole;
  mediaType: MediaType;
  mimeType: string;
  altText?: string;
  caption?: string;
  transcript?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  sortOrder: number;
};

export type Manifest = {
  artwork: ManifestArtwork;
  media: ManifestMedia[];
};

export type ManifestErrorCategory =
  | 'manifest-not-found'
  | 'manifest-invalid-json'
  | 'manifest-schema'
  | 'manifest-file-missing';

export type ManifestValidationIssue = {
  path: string;
  message: string;
};

export type ManifestParseResult =
  | {
      ok: true;
      manifest: Manifest;
      manifestPath: string;
      manifestDir: string;
    }
  | {
      ok: false;
      category: ManifestErrorCategory;
      issues: ManifestValidationIssue[];
      manifestPath: string;
    };

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const MEDIA_TYPES: ReadonlySet<MediaType> = new Set(['image', 'video', 'audio']);
const MEDIA_ROLES: ReadonlySet<MediaRole> = new Set([
  'primary',
  'thumbnail',
  'detail',
  'video',
  'audio',
  'soundtrack'
]);
const STATUSES: ReadonlySet<ArtworkStatus> = new Set(['draft', 'published', 'archived']);

export async function loadManifest(manifestPath: string): Promise<ManifestParseResult> {
  const absolutePath = isAbsolute(manifestPath) ? manifestPath : resolve(process.cwd(), manifestPath);

  let raw: string;
  try {
    raw = await readFile(absolutePath, 'utf-8');
  } catch (error) {
    return {
      ok: false,
      category: 'manifest-not-found',
      issues: [{ path: '', message: errorMessage(error) }],
      manifestPath: absolutePath
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      ok: false,
      category: 'manifest-invalid-json',
      issues: [{ path: '', message: errorMessage(error) }],
      manifestPath: absolutePath
    };
  }

  const manifestDir = dirname(absolutePath);

  const shapeIssues: ManifestValidationIssue[] = [];
  const shaped = validateShape(parsed, shapeIssues);
  if (shapeIssues.length > 0 || !shaped) {
    return {
      ok: false,
      category: 'manifest-schema',
      issues: shapeIssues,
      manifestPath: absolutePath
    };
  }

  const fileIssues: ManifestValidationIssue[] = [];
  const mediaWithResolvedPaths = await resolveMediaFiles(shaped.media, manifestDir, fileIssues);
  if (fileIssues.length > 0) {
    return {
      ok: false,
      category: 'manifest-file-missing',
      issues: fileIssues,
      manifestPath: absolutePath
    };
  }

  return {
    ok: true,
    manifest: {
      artwork: shaped.artwork,
      media: mediaWithResolvedPaths
    },
    manifestPath: absolutePath,
    manifestDir
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type ShapedMedia = Omit<ManifestMedia, 'resolvedPath'>;

type Shaped = {
  artwork: ManifestArtwork;
  media: ShapedMedia[];
};

function validateShape(input: unknown, issues: ManifestValidationIssue[]): Shaped | null {
  if (!isPlainObject(input)) {
    issues.push({ path: '', message: 'Manifest root must be a JSON object' });
    return null;
  }

  const artwork = validateArtwork(input.artwork, issues);
  const media = validateMediaArray(input.media, issues);

  if (!artwork || !media) {
    return null;
  }

  return { artwork, media };
}

function validateArtwork(
  input: unknown,
  issues: ManifestValidationIssue[]
): ManifestArtwork | null {
  if (!isPlainObject(input)) {
    issues.push({ path: 'artwork', message: 'artwork must be an object' });
    return null;
  }

  const id = requireSlug(input, 'id', 'artwork.id', issues);
  const title = requireNonEmptyString(input, 'title', 'artwork.title', issues);
  const artist = requireNonEmptyString(input, 'artist', 'artwork.artist', issues);
  const year = requireInteger(input, 'year', 'artwork.year', issues);
  const medium = requireNonEmptyString(input, 'medium', 'artwork.medium', issues);
  const period = requireNonEmptyString(input, 'period', 'artwork.period', issues);
  const summary = requireNonEmptyString(input, 'summary', 'artwork.summary', issues);
  const description = requireNonEmptyString(input, 'description', 'artwork.description', issues);
  const status = optionalStatus(input, 'status', 'artwork.status', issues) ?? 'published';
  const sortOrder = optionalInteger(input, 'sortOrder', 'artwork.sortOrder', issues) ?? 0;

  if (
    id === null ||
    title === null ||
    artist === null ||
    year === null ||
    medium === null ||
    period === null ||
    summary === null ||
    description === null
  ) {
    return null;
  }

  return { id, title, artist, year, medium, period, summary, description, status, sortOrder };
}

function validateMediaArray(
  input: unknown,
  issues: ManifestValidationIssue[]
): ShapedMedia[] | null {
  if (!Array.isArray(input)) {
    issues.push({ path: 'media', message: 'media must be an array' });
    return null;
  }

  const items: ShapedMedia[] = [];
  const seenPairs = new Set<string>();

  for (let index = 0; index < input.length; index += 1) {
    const entry = validateMediaEntry(input[index], `media[${index}]`, issues);
    if (!entry) {
      continue;
    }
    const pairKey = `${entry.id}::${entry.role}`;
    if (seenPairs.has(pairKey)) {
      issues.push({
        path: `media[${index}]`,
        message: `Duplicate (id, role) pair: id="${entry.id}", role="${entry.role}"`
      });
      continue;
    }
    seenPairs.add(pairKey);
    items.push(entry);
  }

  if (issues.length > 0) {
    return null;
  }
  return items;
}

function validateMediaEntry(
  input: unknown,
  basePath: string,
  issues: ManifestValidationIssue[]
): ShapedMedia | null {
  if (!isPlainObject(input)) {
    issues.push({ path: basePath, message: 'media entry must be an object' });
    return null;
  }

  const id = requireSlug(input, 'id', `${basePath}.id`, issues);
  const file = requireNonEmptyString(input, 'file', `${basePath}.file`, issues);
  const role = requireMediaRole(input, 'role', `${basePath}.role`, issues);
  const mediaType = requireMediaType(input, 'mediaType', `${basePath}.mediaType`, issues);
  const mimeType = requireNonEmptyString(input, 'mimeType', `${basePath}.mimeType`, issues);
  const altText = optionalNonEmptyString(input, 'altText', `${basePath}.altText`, issues);
  const caption = optionalNonEmptyString(input, 'caption', `${basePath}.caption`, issues);
  const transcript = optionalNonEmptyString(input, 'transcript', `${basePath}.transcript`, issues);
  const width = optionalInteger(input, 'width', `${basePath}.width`, issues);
  const height = optionalInteger(input, 'height', `${basePath}.height`, issues);
  const durationSeconds = optionalInteger(input, 'durationSeconds', `${basePath}.durationSeconds`, issues);
  const sortOrder = optionalInteger(input, 'sortOrder', `${basePath}.sortOrder`, issues) ?? 0;

  if (id === null || file === null || role === null || mediaType === null || mimeType === null) {
    return null;
  }

  if (!roleAndMediaTypeAreConsistent(role, mediaType)) {
    issues.push({
      path: basePath,
      message: `role "${role}" is not consistent with mediaType "${mediaType}"`
    });
    return null;
  }

  return {
    id,
    file,
    role,
    mediaType,
    mimeType,
    altText: altText ?? undefined,
    caption: caption ?? undefined,
    transcript: transcript ?? undefined,
    width: width ?? undefined,
    height: height ?? undefined,
    durationSeconds: durationSeconds ?? undefined,
    sortOrder
  };
}

function roleAndMediaTypeAreConsistent(role: MediaRole, mediaType: MediaType): boolean {
  if (role === 'audio' || role === 'soundtrack') {
    return mediaType === 'audio';
  }
  if (role === 'video') {
    return mediaType === 'video';
  }
  return mediaType === 'image' || mediaType === 'video';
}

async function resolveMediaFiles(
  media: ShapedMedia[],
  manifestDir: string,
  issues: ManifestValidationIssue[]
): Promise<ManifestMedia[]> {
  const resolved: ManifestMedia[] = [];

  for (let index = 0; index < media.length; index += 1) {
    const entry = media[index];
    const candidate = isAbsolute(entry.file) ? entry.file : resolve(manifestDir, entry.file);

    const within = relative(manifestDir, candidate);
    const escapes = within.startsWith('..') || isAbsolute(within);
    if (escapes) {
      issues.push({
        path: `media[${index}].file`,
        message: `Path escapes the manifest directory: "${entry.file}"`
      });
      continue;
    }

    try {
      const fileStat = await stat(candidate);
      if (!fileStat.isFile()) {
        issues.push({
          path: `media[${index}].file`,
          message: `Not a regular file: "${entry.file}"`
        });
        continue;
      }
      await access(candidate, constants.R_OK);
    } catch (error) {
      issues.push({
        path: `media[${index}].file`,
        message: `File not found or unreadable: "${entry.file}" (${errorMessage(error)})`
      });
      continue;
    }

    resolved.push({ ...entry, resolvedPath: candidate });
  }

  return resolved;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(
  source: Record<string, unknown>,
  field: string,
  path: string,
  issues: ManifestValidationIssue[]
): string | null {
  const value = source[field];
  if (typeof value !== 'string') {
    issues.push({ path, message: `${field} must be a string` });
    return null;
  }
  if (value.length === 0) {
    issues.push({ path, message: `${field} must not be empty` });
    return null;
  }
  return value;
}

function optionalNonEmptyString(
  source: Record<string, unknown>,
  field: string,
  path: string,
  issues: ManifestValidationIssue[]
): string | null {
  if (!(field in source) || source[field] === undefined) {
    return null;
  }
  const value = source[field];
  if (typeof value !== 'string') {
    issues.push({ path, message: `${field} must be a string when provided` });
    return null;
  }
  return value.length === 0 ? null : value;
}

function requireInteger(
  source: Record<string, unknown>,
  field: string,
  path: string,
  issues: ManifestValidationIssue[]
): number | null {
  const value = source[field];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    issues.push({ path, message: `${field} must be an integer` });
    return null;
  }
  return value;
}

function optionalInteger(
  source: Record<string, unknown>,
  field: string,
  path: string,
  issues: ManifestValidationIssue[]
): number | null {
  if (!(field in source) || source[field] === undefined) {
    return null;
  }
  const value = source[field];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    issues.push({ path, message: `${field} must be an integer when provided` });
    return null;
  }
  return value;
}

function requireSlug(
  source: Record<string, unknown>,
  field: string,
  path: string,
  issues: ManifestValidationIssue[]
): string | null {
  const raw = requireNonEmptyString(source, field, path, issues);
  if (raw === null) return null;
  if (!ID_PATTERN.test(raw)) {
    issues.push({
      path,
      message: `${field} must match ^[a-z0-9][a-z0-9-]*$ (got "${raw}")`
    });
    return null;
  }
  return raw;
}

function requireMediaRole(
  source: Record<string, unknown>,
  field: string,
  path: string,
  issues: ManifestValidationIssue[]
): MediaRole | null {
  const raw = source[field];
  if (typeof raw !== 'string' || !MEDIA_ROLES.has(raw as MediaRole)) {
    issues.push({
      path,
      message: `${field} must be one of ${[...MEDIA_ROLES].map((r) => `"${r}"`).join(', ')}`
    });
    return null;
  }
  return raw as MediaRole;
}

function requireMediaType(
  source: Record<string, unknown>,
  field: string,
  path: string,
  issues: ManifestValidationIssue[]
): MediaType | null {
  const raw = source[field];
  if (typeof raw !== 'string' || !MEDIA_TYPES.has(raw as MediaType)) {
    issues.push({
      path,
      message: `${field} must be one of "image", "video", "audio"`
    });
    return null;
  }
  return raw as MediaType;
}

function optionalStatus(
  source: Record<string, unknown>,
  field: string,
  path: string,
  issues: ManifestValidationIssue[]
): ArtworkStatus | null {
  if (!(field in source) || source[field] === undefined) {
    return null;
  }
  const raw = source[field];
  if (typeof raw !== 'string' || !STATUSES.has(raw as ArtworkStatus)) {
    issues.push({
      path,
      message: `${field} must be one of "draft", "published", "archived" when provided`
    });
    return null;
  }
  return raw as ArtworkStatus;
}
