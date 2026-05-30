export function ossKeyForOriginal(artworkId, mediaAssetId, sourceFilename) {
    const ext = extractExtension(sourceFilename);
    return `artworks/${artworkId}/media/${mediaAssetId}/original.${ext}`;
}
function extractExtension(filename) {
    const base = filename.split(/[\\/]/).pop() ?? filename;
    const dotIndex = base.lastIndexOf('.');
    if (dotIndex === -1) {
        return 'bin';
    }
    const ext = base.slice(dotIndex + 1).toLowerCase();
    return ext.length === 0 ? 'bin' : ext;
}
//# sourceMappingURL=ossKeys.js.map