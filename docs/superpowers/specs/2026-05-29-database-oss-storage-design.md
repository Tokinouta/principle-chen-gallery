# Database and Aliyun OSS Storage Design

Date: 2026-05-29
Project: Galleria Principii
Status: Approved design for implementation planning

## Summary

Galleria Principii will move from a static in-memory artwork catalogue to a SQLite-backed metadata store with media stored in Aliyun OSS. The database stores artwork data, media metadata, and OSS object references. Aliyun OSS stores binary media: images, videos, and audio/music.

The Fastify API remains the security boundary. It reads database records, signs private OSS object URLs at request time, and returns artwork responses that include short-lived signed media URLs. The React frontend never receives OSS credentials.

## Approved Decisions

- Use **SQLite + Prisma** for catalogue metadata.
- Keep schema portable enough for a possible later Postgres migration.
- Store images, videos, and audio/music in a private **Aliyun OSS** bucket.
- Store OSS object keys and metadata in SQLite; do not store binary media in SQLite.
- Use **short-lived signed OSS URLs** by default.
- Include signed media URLs directly in `GET /api/artworks` and `GET /api/artworks/:id` responses.
- Support **multiple media assets per artwork**, with roles such as `primary`, `thumbnail`, `detail`, `video`, `audio`, and `soundtrack`.
- Use a **manual OSS upload + DB seed/import workflow** for this phase.
- Do not build browser uploads, auth, admin UI, CDN setup, or proxy streaming in this phase.

## Current Context

The current app is a TypeScript npm workspace:

```txt
apps/api   Fastify + TypeScript backend
apps/web   Vite + React + TypeScript frontend
e2e        Playwright tests
```

Current artwork data lives in `apps/api/src/data/artworks.ts` and is served by `apps/api/src/routes/artworks.ts`.

Current backend `Artwork` fields:

```ts
export type Artwork = {
  id: string;
  title: string;
  artist: string;
  medium: string;
  period: string;
  year: number;
  summary: string;
  description: string;
};
```

Current frontend fetches `/api/artworks`, validates a minimum artwork shape, and renders a decorative placeholder instead of real media. The new design preserves the gallery experience while adding database persistence and OSS-backed media.

## Architecture

High-level flow:

```txt
React frontend
  -> GET /api/artworks
  -> Fastify API
  -> SQLite via Prisma for artwork/media metadata
  -> Aliyun OSS signer for short-lived image/video/audio URLs
  -> JSON response with metadata + signed media URLs
```

Responsibilities:

- React renders catalogue, search results, detail dialog, and media controls.
- Fastify owns API behavior, DB access, OSS signing, and error mapping.
- Prisma owns schema, migrations, generated model types, and seed/import scripts.
- SQLite stores non-binary catalogue data.
- Aliyun OSS stores binary media.

Secrets never cross into React, test fixtures, committed docs, committed `.env`, or GitHub.

## Database Design

SQLite stores catalogue metadata and OSS object references. Prisma owns the schema and migrations.

### `Artwork`

```txt
Artwork
- id              stable internal ID / slug-style identifier
- title
- artist
- year
- medium
- period
- summary
- description
- status          draft | published | archived
- sortOrder
- createdAt
- updatedAt
```

Notes:

- `id` stays stable and URL-safe.
- `status` allows importing draft records without showing them publicly.
- `sortOrder` preserves curated catalogue ordering.
- Public endpoints return `published` artworks by default.

### `MediaAsset`

```txt
MediaAsset
- id
- ossBucket
- ossRegion
- ossKey          e.g. artworks/ophelia/original.jpg or audio/theme.mp3
- mediaType       image | video | audio
- mimeType
- byteSize
- width           nullable; image/video only
- height          nullable; image/video only
- durationSeconds nullable; video/audio only
- altText         nullable; image/video accessibility text
- transcript      nullable; audio/video accessibility text
- caption
- createdAt
- updatedAt
```

Notes:

- One `MediaAsset` describes one OSS object.
- `mediaType` includes `audio` so music is first-class.
- `width` and `height` are nullable because audio has no image dimensions.
- `durationSeconds` supports video/audio playback metadata.
- `altText` supports image/video accessibility.
- `transcript` supports audio/video accessibility.

### `ArtworkMedia`

```txt
ArtworkMedia
- id
- artworkId
- mediaAssetId
- role            primary | thumbnail | detail | video | audio | soundtrack
- sortOrder
```

Notes:

- Allows multiple media assets per artwork.
- Roles let the frontend choose card thumbnails, primary display media, detail media, video, and music.
- `sortOrder` controls display order within an artwork.

## OSS Storage Design

Aliyun OSS stores all binary media in a private bucket.

### Object key convention

Use predictable, non-secret keys:

```txt
artworks/{artworkId}/media/{mediaAssetId}/original.{ext}
artworks/{artworkId}/media/{mediaAssetId}/thumbnail.{ext}
artworks/{artworkId}/media/{mediaAssetId}/preview.{ext}
```

Examples:

```txt
artworks/ophelia-study/media/primary-image/original.jpg
artworks/ophelia-study/media/ophelia-theme/original.mp3
artworks/ophelia-study/media/detail-video/original.mp4
```

Object keys are not secrets. Access control comes from the private bucket and short-lived signed URLs.

### Runtime configuration

The API reads OSS configuration from environment variables:

```txt
ALIYUN_OSS_REGION
ALIYUN_OSS_BUCKET
ALIYUN_OSS_ENDPOINT optional
ALIBABA_CLOUD_ACCESS_KEY_ID
ALIBABA_CLOUD_ACCESS_KEY_SECRET
ALIBABA_CLOUD_SECURITY_TOKEN optional
ALIYUN_OSS_SIGNED_URL_TTL_SECONDS optional, default 900
```

Add a committed `.env.example` with variable names and placeholder values only. Do not commit real keys.

Recommended default signed URL expiry: **15 minutes** (`900` seconds).

### Credential rules

- Use RAM user/role credentials with least-privilege OSS permissions.
- Prefer temporary credentials or RAM roles where deployment supports them.
- Never paste real OSS keys into chat if they may be copied into repo files.
- Never store real OSS keys in code, docs, tests, committed `.env`, frontend env variables, or GitHub.

## API Design

The public API keeps the current route shape but returns media-aware records.

### `GET /api/artworks`

Returns published artwork summaries with signed media URLs.

```ts
type ArtworkResponse = {
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

type MediaAssetResponse = {
  id: string;
  mediaType: 'image' | 'video' | 'audio';
  role: 'primary' | 'thumbnail' | 'detail' | 'video' | 'audio' | 'soundtrack';
  mimeType: string;
  signedUrl: string | null;
  expiresAt: string | null;
  status: 'available' | 'unavailable';
  altText?: string;
  transcript?: string;
  caption?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
};
```

### `GET /api/artworks/:id`

Returns the same shape for one published artwork, with all attached media assets.

Missing artwork behavior remains:

```json
{ "error": "Artwork not found" }
```

with status `404`.

### `GET /api/artworks?search=rose`

The backend becomes the canonical search layer.

Search should cover:

- title
- artist
- medium
- period
- summary
- description
- media caption
- media transcript

The frontend should stop relying on partial client-side search rules. This resolves the current mismatch where backend search checks description/summary but frontend search only checks title/artist/year/medium.

## Frontend Design

The React app should update its artwork contract to include media.

Rendering behavior:

- Gallery cards use `thumbnail` if available, otherwise `primary`, otherwise the Victorian decorative placeholder.
- Detail view shows primary image, detail images, video players, audio/music players, captions, and transcripts where available.
- If a media asset has `status: unavailable` or `signedUrl: null`, the UI shows metadata and an unobtrusive unavailable-media state instead of failing the whole artwork.
- If a signed URL expires during a long session, the frontend can re-fetch `/api/artworks` or `/api/artworks/:id` to get fresh URLs.

Media rendering mapping:

```txt
image -> <img>
video -> <video controls>
audio -> <audio controls>
```

Accessibility:

- Use `altText` for image alt text.
- Show `caption` near media where present.
- Expose `transcript` for audio/video where present.
- Keep keyboard/focus behavior for artwork cards and detail dialogs.

## Import and Seed Workflow

This phase does not include browser uploads.

Workflow:

1. Operator uploads media files to Aliyun OSS manually.
2. Operator records OSS keys in a seed/import fixture.
3. Prisma seed/import script writes `Artwork`, `MediaAsset`, and `ArtworkMedia` rows to SQLite.
4. API reads from SQLite and signs URLs at request time.

Seed data should preserve the existing six artworks so current behavior remains recognizable.

## Error Handling

The API should fail safely.

| Failure | Behavior |
|---|---|
| Missing artwork | `404 { "error": "Artwork not found" }` |
| Database unavailable | `503 { "error": "Catalogue temporarily unavailable" }` |
| Missing required config at boot | API startup fails with a clear config error |
| OSS signing fails for one asset | Return artwork metadata; mark affected media `status: unavailable`, `signedUrl: null`, `expiresAt: null` |
| Signed URL expires in browser | Frontend re-fetches artwork data for fresh URLs |

The gallery should not fail entirely because one media asset cannot be signed.

## Testing Strategy

### API tests

Add or update tests for:

- DB-backed list/detail/search.
- Only `published` artworks are returned publicly.
- Existing 404 behavior remains unchanged.
- Media assets are included with signed URLs.
- Signed URL generation is invoked server-side, not exposed as credentials.
- OSS signing failure for one asset marks that media unavailable without failing the whole artwork response.
- Search covers artwork fields plus media captions/transcripts.

### Frontend tests

Add or update tests for:

- Image, video, and audio media render when provided.
- Decorative placeholder appears when no usable media exists.
- Backend search results drive visible artwork list.
- Unavailable media is handled gracefully.
- Expired/unavailable media does not crash the detail view.

### E2E tests

Add or update tests for:

- Gallery loads from DB seed.
- Primary image appears on a card.
- Detail view shows richer media.
- Audio/music media can be represented without breaking layout.
- Search still works.
- OSS credentials do not appear in browser-visible responses, frontend bundle config, or test fixtures.

## Non-Goals

This design does not include:

- Browser upload UI.
- Admin authentication.
- User accounts.
- CDN/DCDN setup.
- Server proxy streaming.
- Automatic thumbnail generation.
- Video/audio transcoding pipelines.
- Secret collection inside chat.
- Storing media bytes in SQLite.

## Implementation Notes

Likely implementation seams:

- Replace `apps/api/src/data/artworks.ts` with Prisma-backed repository/service functions.
- Keep route handlers thin.
- Add an OSS signing service isolated behind a small interface, so tests can mock it.
- Add an environment/config module that validates required DB and OSS settings at startup.
- Keep frontend media rendering isolated in media components rather than expanding `App.tsx` too much.

Suggested service boundaries:

```txt
apps/api/src/config/env.ts
apps/api/src/db/prisma.ts
apps/api/src/repositories/artworkRepository.ts
apps/api/src/services/ossSigner.ts
apps/api/src/services/artworkPresenter.ts
apps/api/src/routes/artworks.ts
```

The presenter/service layer should map DB rows into API response objects and attach signed URLs.

## Open Implementation Decisions

These are intentionally left for implementation planning, not product design:

- Exact Prisma model syntax and migration names.
- Whether seed data is JSON, TypeScript fixture, or Prisma seed script only.
- Whether tests use a temporary SQLite file or in-memory SQLite.
- Whether `ALIYUN_OSS_ENDPOINT` is required for the target region or optional.
- Exact thumbnail object naming for real uploaded assets.
