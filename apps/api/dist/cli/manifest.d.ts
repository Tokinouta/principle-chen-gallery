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
export type ManifestErrorCategory = 'manifest-not-found' | 'manifest-invalid-json' | 'manifest-schema' | 'manifest-file-missing';
export type ManifestValidationIssue = {
    path: string;
    message: string;
};
export type ManifestParseResult = {
    ok: true;
    manifest: Manifest;
    manifestPath: string;
    manifestDir: string;
} | {
    ok: false;
    category: ManifestErrorCategory;
    issues: ManifestValidationIssue[];
    manifestPath: string;
};
export declare function loadManifest(manifestPath: string): Promise<ManifestParseResult>;
