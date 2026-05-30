# CLI: Add Artwork Design

Date: 2026-05-30
Project: Galleria Principii
Status: Approved design for implementation planning

## Summary

A small command-line tool, run inside the `apps/api` workspace, that
adds a single artwork plus its media to the Galleria Principii catalogue
in one step: it reads a JSON manifest, uploads the referenced local
files to the configured Aliyun OSS bucket, then upserts the artwork,
media assets, and artwork-media link rows into SQLite via Prisma. After
a successful run the new artwork is visible on the React gallery on the
next page load.

The CLI operates in strict mode: real Aliyun credentials are required
for actual runs. A `--dry-run` flag validates the manifest and prints
the planned actions without requiring credentials and without touching
OSS or the database.

## Approved Decisions

- Add local file, then upload to OSS, then write DB rows (Q1: option 3).
- Use a JSON manifest file as the input format (Q2: option 3).
- Manifest is the source of truth: upsert with destructive sync of media
  links for that artwork; OSS objects are never auto-deleted (Q3: option 2).
- Strict OSS credentials with `--dry-run` for offline validation;
  all-or-nothing DB writes; partial OSS uploads on failure are left as
  orphaned bytes that re-runs will skip via HEAD checks (Q4: option 2).
- CLI lives inside `apps/api`, not a new workspace (Q5: option 1).
- `width`, `height`, and `durationSeconds` are optional manifest fields;
  no auto-detection (Section 3, Q on dimensions).
- Add one Playwright end-to-end test that runs the CLI against a stub
  uploader and asserts the new artwork is visible on the gallery (Q6).
- Two example manifests committed under `docs/cli-manifests/` plus a
  short README explaining the field meanings and path-resolution rules.

## Non-Goals

- No interactive prompt mode in this phase.
- No batch / multi-artwork manifest in this phase. One manifest = one
  artwork.
- No CLI command to delete an artwork or remove an OSS object.
- No automatic image/video/audio dimension or duration detection.
- No CLI authentication, RBAC, or audit log.
- No browser upload UI. (Same non-goal as the storage design.)
- No new dependencies beyond what `apps/api` already uses (`@prisma/client`,
  `prisma`, `ali-oss`, `tsx`).

## Architecture

The CLI is a new entrypoint inside the existing API workspace. It
reuses Prisma, the env loader, and the OSS configuration that the
runtime API already validates.

```txt
apps/api/src/
  cli/
    addArtwork.ts          # Entrypoint: arg parsing, orchestration, exit codes
    manifest.ts            # Manifest schema + validator (hand-rolled type guards)
    ossKeys.ts             # Pure: derives ossKey from artworkId/mediaAssetId/ext
  services/
    ossUploader.ts         # New: OssUploader interface + AliyunOssUploader
```

Existing modules used unchanged:

- `config/env.ts` for `loadConfig()` and `OssConfig`.
- `db/prisma.ts` for `createPrismaClient(databaseUrl)`.
- `services/ossSigner.ts` is **not** used by the CLI; the read-only
  signing seam stays independent from the write-side uploader seam.

The CLI does not modify `routes/`, the repository, or the presenter.

Package wiring:

- `apps/api/package.json` adds:
  - script `cli:add-artwork`: `tsx --env-file=../../.env src/cli/addArtwork.ts`
- Root `package.json` adds:
  - script `add-artwork`: `npm run cli:add-artwork --workspace @galleria-principii/api --`

Invocation:

```sh
npm run add-artwork -- ./path/to/manifest.json
npm run add-artwork -- ./path/to/manifest.json --dry-run
```

## Data Flow

One CLI invocation performs the following steps in order. Any failure
aborts at that step and the steps below it never run.

1. Read `argv[1]` as the manifest path. If missing or unreadable,
   fail with category `manifest-not-found`.
2. Parse the file as JSON. Syntax errors fail with
   `manifest-invalid-json`.
3. Validate the manifest shape (see Manifest Schema below). All shape
   issues are collected and reported together as `manifest-schema`,
   then the CLI exits.
4. Call `loadConfig()`. Missing required env fails with `config-missing`.
   In non-dry-run mode, also require `ALIBABA_CLOUD_ACCESS_KEY_ID` and
   `ALIBABA_CLOUD_ACCESS_KEY_SECRET`; missing fails with
   `oss-credentials-missing`.
5. Resolve each `media[*].file` relative to the **manifest file's
   directory**, not the process CWD. Reject any path that escapes the
   manifest directory tree with `manifest-file-missing` and a clear
   hint.
6. Compute the deterministic OSS key for each media entry using the
   convention from the storage spec:
   `artworks/{artworkId}/media/{mediaAssetId}/original.{ext}`.
7. For each media entry (sequentially, in manifest order):
   - `HEAD` the OSS key.
   - If the object is absent, `PUT` the local file with the manifest's
     `mimeType`.
   - If the object is already present, skip the upload and record
     `SKIP` for the run summary.
   Any thrown error fails with `oss-upload-failed`, names the offending
   OSS key, and reports which keys were already uploaded in this run.
   No DB writes happen.
8. Open a single Prisma `$transaction`:
   - Upsert the `Artwork` row (key: `id`).
   - For each manifest media entry:
     - Upsert the `MediaAsset` row (key: `id`).
     - Upsert the `ArtworkMedia` row
       (composite key: `artworkId + mediaAssetId + role`).
   - Delete every `ArtworkMedia` row for this `artworkId` whose
     `(mediaAssetId, role)` pair is not present in the manifest.
   - Delete every `MediaAsset` row that is now orphaned, i.e. no
     remaining `ArtworkMedia` references it from any artwork.
   If any step throws, the transaction rolls back and the CLI fails
   with `db-transaction-failed`. No partial DB state is left behind.
9. Print a concise plain-text summary to stdout and exit 0.

### Ordering rule

Uploads always happen **before** the DB transaction. This guarantees
that if a run fails, the frontend never references an OSS object that
does not exist. Successfully uploaded objects in a failed run become
orphaned bytes in the bucket; the next successful run reuses them via
the `HEAD` skip path.

### `--dry-run` behaviour

`--dry-run` performs steps 1, 2, 3, 4 (without the credentials check
from step 4), 5, and 6. It then prints the would-be plan, including
which media would `UPLOAD`, which would `SKIP` (based on existing OSS
state only if credentials are available; otherwise marked
`UPLOAD-OR-SKIP`), which links would be added, removed, and kept.
It exits 0 without touching OSS or the database.

## Manifest Schema

JSON. Validated by a hand-rolled type guard in `manifest.ts`, matching
the project's existing validation style; no new runtime dependencies.

```ts
type Manifest = {
  artwork: {
    id: string;                  // required, slug-style; primary key
    title: string;               // required
    artist: string;              // required
    year: number;                // required, integer
    medium: string;              // required
    period: string;              // required
    summary: string;             // required
    description: string;         // required
    status?: 'draft' | 'published' | 'archived'; // default: 'published'
    sortOrder?: number;          // default: 0
  };
  media: ManifestMedia[];        // required, may be empty []
};

type ManifestMedia = {
  id: string;                    // required, stable per asset; PK in MediaAsset
  file: string;                  // required, path relative to manifest file
  role: 'primary' | 'thumbnail' | 'detail' | 'video' | 'audio' | 'soundtrack';
  mediaType: 'image' | 'video' | 'audio';
  mimeType: string;              // required; CLI does NOT auto-detect
  caption?: string;
  altText?: string;              // image/video accessibility text
  transcript?: string;           // audio/video accessibility text
  width?: number;                // optional, image/video
  height?: number;               // optional, image/video
  durationSeconds?: number;      // optional, video/audio
  sortOrder?: number;            // default: 0
};
```

### Validation rules

Enforced before any OSS or DB work:

- `artwork.id` and every `media[*].id` match `^[a-z0-9][a-z0-9-]*$`
  (URL-safe, lowercase, no spaces).
- `media[*].file` resolves to an existing readable file located
  underneath the manifest file's directory. Paths that escape the
  manifest directory (for example `../../secrets/...`) are rejected.
- `role` and `mediaType` must be consistent:
  - `audio` or `soundtrack` requires `mediaType: 'audio'`.
  - `video` requires `mediaType: 'video'`.
  - `primary`, `thumbnail`, `detail` require `mediaType: 'image'` or
    `'video'`.
- Within one manifest, no two media entries may share the same
  `(id, role)` pair.
- `mimeType` is always required. The CLI does not sniff content type.

### Defaults

- `artwork.status` defaults to `'published'`.
- `artwork.sortOrder` defaults to `0`.
- `media[*].sortOrder` defaults to `0`.

### Example manifests

Two example manifests are committed under `docs/cli-manifests/`:

- `docs/cli-manifests/example-image-only.json`
- `docs/cli-manifests/example-image-plus-soundtrack.json`

A short `docs/cli-manifests/README.md` explains field meanings,
path-resolution rules, and links back to this spec. The CLI's
`--help` output references these example paths.

## Error Handling and Exit Codes

All errors print a structured block to stderr and exit with a stable,
documented code. Stack traces only appear with `--verbose`.

```txt
[add-artwork] FAIL: <category>
  manifest: ./path/to/manifest.json
  detail:   <human-readable problem>
  at:       <JSON path or file path, when applicable>
  hint:     <one-line suggested fix>
```

| Category | Exit | Trigger |
|---|---|---|
| `manifest-not-found` | 10 | argv missing or file unreadable |
| `manifest-invalid-json` | 11 | JSON parse error |
| `manifest-schema` | 12 | shape, type, or role/mediaType mismatch |
| `manifest-file-missing` | 13 | media file missing or escapes manifest dir |
| `config-missing` | 20 | required env var missing |
| `oss-credentials-missing` | 21 | strict-mode run without OSS credentials |
| `oss-upload-failed` | 30 | PUT or HEAD threw |
| `db-unavailable` | 40 | Prisma connection error |
| `db-transaction-failed` | 41 | upsert/delete inside the transaction threw |
| `unknown` | 1 | anything else |

Key behaviours:

- Manifest schema errors are reported all at once where possible, so
  the user does not have to fix-one-rerun-fix-one.
- After a failed upload mid-batch, no DB writes happen, successful
  uploads remain in OSS as orphans, and the stderr message names
  exactly which keys were uploaded and which one failed. Re-running
  the same manifest after fixing the cause skips the already-uploaded
  files and proceeds.
- DB transaction failures roll back via Prisma `$transaction`. OSS
  objects are never rolled back; this is the explicit policy from
  the storage design.

## Output Format

Plain text, designed to be greppable. Field labels stay stable across
runs so external tooling (or you, scrolling history) can match on them.

### `--dry-run` example

```txt
[add-artwork] DRY-RUN ./manifest.json
  artwork: moor-evensong (will UPSERT, status=published)
  media:
    UPLOAD  artworks/moor-evensong/media/moor-evensong-primary/original.jpg
    UPLOAD  artworks/moor-evensong/media/moor-evensong-soundtrack/original.mp3
  links:
    UPSERT  moor-evensong / moor-evensong-primary    role=primary
    UPSERT  moor-evensong / moor-evensong-soundtrack role=soundtrack
  removed-links: (none)
[add-artwork] DRY-RUN OK -- no changes written
```

### Real run example

```txt
[add-artwork] ./manifest.json
  artwork: moor-evensong UPSERTED
  uploads:
    PUT     artworks/moor-evensong/media/moor-evensong-primary/original.jpg     (842 KB)
    SKIP    artworks/moor-evensong/media/moor-evensong-soundtrack/original.mp3  (already present)
  links:
    +primary       moor-evensong-primary
    +soundtrack    moor-evensong-soundtrack
  removed-links: (none)
[add-artwork] OK
```

### Flags

- `--dry-run`: validate and print plan; no OSS, no DB; does not
  require OSS credentials.
- `--verbose`: full stack traces and Prisma query logs.
- `--help`: usage plus the paths to the example manifests in
  `docs/cli-manifests/`.

## Testing Strategy

Tests are split between fast unit tests on pure modules and
integration tests on the orchestrator. The "see the new artwork on the
frontend" requirement is covered by one new Playwright test.

### Unit tests (no Prisma, no OSS, no real filesystem beyond a tmp dir)

- `manifest.ts`:
  - Valid manifest parses and validates.
  - Each invalid case (missing field, wrong type, unknown role, bad id
    pattern, escaping path, role/mediaType mismatch, duplicate
    `(id, role)`) is rejected with the expected category and JSON
    path pointer.
  - Multiple shape errors in one manifest are reported together.
- `ossKeys.ts`:
  - Deterministic key derivation for representative
    `(artworkId, mediaAssetId, ext)` tuples.
  - Extension normalisation (lowercase, leading-dot handling).

### Integration tests (real SQLite file in a tmp dir, stub `OssUploader`)

- Fresh manifest: artwork, media, and link rows are created; the
  stub uploader receives one PUT per media file.
- Re-run of the same manifest after a previous successful run:
  no DB diff; the uploader sees only HEAD calls, no PUTs.
- Manifest with one media entry removed compared to the previous run:
  the corresponding `ArtworkMedia` link is deleted, and the
  `MediaAsset` is deleted iff no other artwork references it.
- Stub upload that throws on the second of three files: exits 30, no
  DB writes happen, stderr names the failed key.
- `--dry-run` against a manifest with no OSS credentials: exits 0
  and performs no Prisma calls.

### End-to-end test (one new Playwright test, runs in `test:e2e`)

This covers the user-stated requirement: the new artwork must be
visible from the frontend after the CLI runs.

- Reset the E2E SQLite database (`prisma db reset --force`).
- Run the CLI against a small built-in test manifest that lives under
  `e2e/fixtures/`. The CLI is invoked with `OSS_UPLOADER=stub` (or
  equivalent), which selects an in-process stub uploader implementation
  so the test does not require Aliyun credentials and does not touch
  the network.
- Reload the gallery and assert that the new artwork's title is
  visible on a card, and that opening the detail dialog shows the
  manifest's medium and description.

The existing Playwright global setup (`e2e/global-setup.ts`) already
seeds the six Victorian fixtures; the new test runs after global setup
and uses its own additional manifest, so it does not interfere with
existing tests.

## Reuse of Existing Modules

- `apps/api/src/config/env.ts`: `loadConfig()` is reused. The CLI adds
  a small check for OSS credentials when not in dry-run, on top of
  what the API requires for read-only signing.
- `apps/api/src/db/prisma.ts`: `createPrismaClient(databaseUrl)` is
  reused. The CLI owns the lifecycle and calls `await prisma.$disconnect()`
  in a `finally` block.
- `apps/api/src/services/ossSigner.ts`: not used by the CLI. The
  `OssSigner` interface stays read-only.

The new `services/ossUploader.ts` mirrors the signer's seam pattern:

```ts
export interface OssUploader {
  head(ossKey: string): Promise<boolean>;
  put(ossKey: string, localPath: string, contentType: string): Promise<void>;
}
```

`AliyunOssUploader` wraps the same `ali-oss` client construction the
signer already uses, with credentials taken from the same `OssConfig`.
The tests use a `StubOssUploader` that records calls and can be
scripted to throw.

## Spec Self-Review Notes

- No `TBD` / `TODO` / placeholder text.
- Architecture, data flow, manifest schema, and testing sections are
  consistent: the upsert-with-destructive-sync behaviour described in
  Architecture step 8 matches the integration test described under
  Testing.
- Scope is narrow: one CLI command, one input format, one storage
  backend. Decomposition is not required.
- Ambiguity check: "see the new artwork from the frontend" is made
  concrete by the new Playwright test that asserts the title is
  visible on a card after CLI run + reload.

## Implementation Plan Handoff

This spec is the input to the implementation plan. The implementation
plan will cover, in dependency order:

1. `services/ossUploader.ts` interface + Aliyun implementation +
   in-memory stub for tests.
2. `cli/ossKeys.ts` and unit tests.
3. `cli/manifest.ts` and unit tests.
4. `cli/addArtwork.ts` orchestrator and integration tests against a
   real temp SQLite + the stub uploader.
5. `package.json` script wiring (workspace + root convenience alias).
6. Two example manifests + README under `docs/cli-manifests/`.
7. One Playwright test that runs the CLI and verifies the new artwork
   is visible on the gallery.
8. Final `npm run verify`.

