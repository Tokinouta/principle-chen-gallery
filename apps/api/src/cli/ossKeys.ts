export function ossKeyForOriginal(
  artworkId: string,
  mediaAssetId: string,
  sourceFilename: string
): string {
  const ext = extractExtension(sourceFilename);
  return `artworks/${artworkId}/media/${mediaAssetId}/original.${ext}`;
}

function extractExtension(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const dotIndex = base.lastIndexOf('.');
  if (dotIndex === -1) {
    return 'bin';
  }
  const ext = base.slice(dotIndex + 1).toLowerCase();
  return ext.length === 0 ? 'bin' : ext;
}
