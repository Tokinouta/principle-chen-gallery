import { access, constants, readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const MEDIA_TYPES = new Set(['image', 'video', 'audio']);
const MEDIA_ROLES = new Set([
    'primary',
    'thumbnail',
    'detail',
    'video',
    'audio',
    'soundtrack'
]);
const STATUSES = new Set(['draft', 'published', 'archived']);
export async function loadManifest(manifestPath) {
    const absolutePath = isAbsolute(manifestPath) ? manifestPath : resolve(process.cwd(), manifestPath);
    let raw;
    try {
        raw = await readFile(absolutePath, 'utf-8');
    }
    catch (error) {
        return {
            ok: false,
            category: 'manifest-not-found',
            issues: [{ path: '', message: errorMessage(error) }],
            manifestPath: absolutePath
        };
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        return {
            ok: false,
            category: 'manifest-invalid-json',
            issues: [{ path: '', message: errorMessage(error) }],
            manifestPath: absolutePath
        };
    }
    const manifestDir = dirname(absolutePath);
    const shapeIssues = [];
    const shaped = validateShape(parsed, shapeIssues);
    if (shapeIssues.length > 0 || !shaped) {
        return {
            ok: false,
            category: 'manifest-schema',
            issues: shapeIssues,
            manifestPath: absolutePath
        };
    }
    const fileIssues = [];
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
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function validateShape(input, issues) {
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
function validateArtwork(input, issues) {
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
    if (id === null ||
        title === null ||
        artist === null ||
        year === null ||
        medium === null ||
        period === null ||
        summary === null ||
        description === null) {
        return null;
    }
    return { id, title, artist, year, medium, period, summary, description, status, sortOrder };
}
function validateMediaArray(input, issues) {
    if (!Array.isArray(input)) {
        issues.push({ path: 'media', message: 'media must be an array' });
        return null;
    }
    const items = [];
    const seenPairs = new Set();
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
function validateMediaEntry(input, basePath, issues) {
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
function roleAndMediaTypeAreConsistent(role, mediaType) {
    if (role === 'audio' || role === 'soundtrack') {
        return mediaType === 'audio';
    }
    if (role === 'video') {
        return mediaType === 'video';
    }
    return mediaType === 'image' || mediaType === 'video';
}
async function resolveMediaFiles(media, manifestDir, issues) {
    const resolved = [];
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
        }
        catch (error) {
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
function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function requireNonEmptyString(source, field, path, issues) {
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
function optionalNonEmptyString(source, field, path, issues) {
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
function requireInteger(source, field, path, issues) {
    const value = source[field];
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        issues.push({ path, message: `${field} must be an integer` });
        return null;
    }
    return value;
}
function optionalInteger(source, field, path, issues) {
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
function requireSlug(source, field, path, issues) {
    const raw = requireNonEmptyString(source, field, path, issues);
    if (raw === null)
        return null;
    if (!ID_PATTERN.test(raw)) {
        issues.push({
            path,
            message: `${field} must match ^[a-z0-9][a-z0-9-]*$ (got "${raw}")`
        });
        return null;
    }
    return raw;
}
function requireMediaRole(source, field, path, issues) {
    const raw = source[field];
    if (typeof raw !== 'string' || !MEDIA_ROLES.has(raw)) {
        issues.push({
            path,
            message: `${field} must be one of ${[...MEDIA_ROLES].map((r) => `"${r}"`).join(', ')}`
        });
        return null;
    }
    return raw;
}
function requireMediaType(source, field, path, issues) {
    const raw = source[field];
    if (typeof raw !== 'string' || !MEDIA_TYPES.has(raw)) {
        issues.push({
            path,
            message: `${field} must be one of "image", "video", "audio"`
        });
        return null;
    }
    return raw;
}
function optionalStatus(source, field, path, issues) {
    if (!(field in source) || source[field] === undefined) {
        return null;
    }
    const raw = source[field];
    if (typeof raw !== 'string' || !STATUSES.has(raw)) {
        issues.push({
            path,
            message: `${field} must be one of "draft", "published", "archived" when provided`
        });
        return null;
    }
    return raw;
}
//# sourceMappingURL=manifest.js.map