const MEDIA_TYPES = new Set(['image', 'video', 'audio']);
const MEDIA_ROLES = new Set([
    'primary',
    'thumbnail',
    'detail',
    'video',
    'audio',
    'soundtrack'
]);
function toMediaType(value) {
    return MEDIA_TYPES.has(value) ? value : 'image';
}
function toMediaRole(value) {
    return MEDIA_ROLES.has(value) ? value : 'detail';
}
function optionalString(value) {
    return value === null ? undefined : value;
}
function optionalNumber(value) {
    return value === null ? undefined : value;
}
async function presentMediaAsset(link, signer) {
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
export async function presentArtwork(row, signer) {
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
export function presentArtworks(rows, signer) {
    return Promise.all(rows.map((row) => presentArtwork(row, signer)));
}
//# sourceMappingURL=artworkPresenter.js.map