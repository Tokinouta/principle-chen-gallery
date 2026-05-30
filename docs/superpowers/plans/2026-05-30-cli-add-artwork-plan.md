# Implementation Plan: CLI add-artwork

Date: 2026-05-30
Spec: docs/superpowers/specs/2026-05-30-cli-add-artwork-design.md
Status: Ready for execution

## How to use this plan

Units are listed in strict dependency order. Each unit is sized to
land as a single coherent change. Do not skip ahead: later units
import symbols and types created by earlier ones.

For each unit:

1. Implement the listed files.
2. Run the listed verification command(s).
3. Only mark the unit done once verification passes.

A single final commit at the end of Unit 8 is acceptable, but
committing per unit is also fine. Either way, do not commit until
the unit's verification is green.

## Environment assumptions

- Node + npm workspaces already configured.
- `apps/api` already depends on `@prisma/client`, `prisma`, `ali-oss`,
  `tsx`. No new dependencies are introduced by this plan.
- The local `.env` already provides `DATABASE_URL`,
  `ALIYUN_OSS_REGION`, `ALIYUN_OSS_BUCKET`. OSS credentials are
  optional; the CLI only requires them outside `--dry-run`.

## Unit 1 -- OssUploader interface, Aliyun implementation, stub

Files:
- `apps/api/src/services/ossUploader.ts` (new)
- `apps/api/test/ossUploader.test.ts` (new)

Behaviour:
- Export `interface OssUploader { head(key: string): Promise<boolean>;
  put(key: string, localPath: string, contentType: string): Promise<void>; }`.
- Export `class AliyunOssUploader implements OssUploader` built from
  the same `OssConfig` as the signer. Constructor throws if
  `config.credentials` is null (mirror `AliyunOssSigner`'s behaviour).
- Export `class StubOssUploader implements OssUploader` that records
  every call (`head` and `put`) in arrays, lets a test pre-seed which
  keys exist for `head`, and lets a test queue an error to throw on
  the next `put`. Tests own all behaviour control; no real network or
  filesystem touched.
- Export `createOssUploader(config: OssConfig): OssUploader` factory
  that returns `AliyunOssUploader` when credentials are present.

Tests (`ossUploader.test.ts`):
- `StubOssUploader.head` returns false by default, true for pre-seeded
  keys.
- `StubOssUploader.put` records the call and resolves; subsequent
  `head` returns true for that key.
- Queued put error is thrown exactly once, then later calls succeed.
- `createOssUploader(config)` returns an `AliyunOssUploader` instance
  when `config.credentials` is set.
- `createOssUploader(config)` throws `Error("OSS credentials required")`
  when `config.credentials` is null.

Verify:
- `npm run typecheck --workspace @galleria-principii/api`
- `npm run test --workspace @galleria-principii/api`

Acceptance:
- Typecheck clean. All new tests pass. No existing API test fails.

## Unit 2 -- ossKeys pure module

Files:
- `apps/api/src/cli/ossKeys.ts` (new)
- `apps/api/test/cli/ossKeys.test.ts` (new)

Behaviour:
- Export `function ossKeyForOriginal(artworkId: string, mediaAssetId:
  string, sourceFilename: string): string`.
- Implementation: lowercase the extension of `sourceFilename`, strip
  the leading dot, default to `"bin"` if none, return
  `artworks/${artworkId}/media/${mediaAssetId}/original.${ext}`.
- Pure function. No I/O. No imports beyond Node built-ins.

Tests:
- `original.JPG` -> ext `jpg`.
- `theme.mp3` -> ext `mp3`.
- `no-extension` -> ext `bin`.
- Hidden file `.envrc` -> ext `envrc` (entire name after the dot).
- IDs interpolate literally.

Verify: same commands as Unit 1.

Acceptance: typecheck and tests pass.

## Unit 3 -- Manifest schema and validator

Files:
- `apps/api/src/cli/manifest.ts` (new)
- `apps/api/test/cli/manifest.test.ts` (new)

Behaviour:
- Export `type Manifest`, `type ManifestArtwork`, `type ManifestMedia`,
  and the literal union types for `role`, `mediaType`, `status` (match
  the spec exactly).
- Export `type ManifestValidationIssue = { path: string; message: string }`.
- Export `type ManifestParseResult =
  | { ok: true; manifest: Manifest; manifestPath: string; manifestDir: string }
  | { ok: false; issues: ManifestValidationIssue[]; category:
      'manifest-not-found' | 'manifest-invalid-json' | 'manifest-schema'
      | 'manifest-file-missing'; manifestPath: string }`.
- Export `async function loadManifest(manifestPath: string): Promise<ManifestParseResult>`:
  1. Resolve to an absolute path. Read file as UTF-8. If unreadable,
     return `manifest-not-found`.
  2. `JSON.parse`. If syntax error, return `manifest-invalid-json`
     with the parser message in issues.
  3. Validate shape. Collect every issue rather than short-circuiting.
     If any issue, return `manifest-schema`.
  4. Resolve each `media[*].file` relative to the manifest's directory.
     Reject paths that, after resolution, are not contained in
     `manifestDir`, and files that do not exist or are not readable.
     If any issue, return `manifest-file-missing`.
  5. Apply defaults (`artwork.status = 'published'`,
     `artwork.sortOrder = 0`, `media[*].sortOrder = 0`) and return `ok`.
- Shape validation rules from the spec:
  - `id` and `media[*].id` match `^[a-z0-9][a-z0-9-]*$`.
  - `(role, mediaType)` consistency matrix.
  - `(media id, role)` pairs unique within one manifest.
  - `mimeType` always required.

Tests (organise by case, share a temp-dir fixture):
- Valid manifest with an image-only artwork parses; defaults applied.
- Valid manifest with image + soundtrack parses; both media validate.
- Missing file path returns `manifest-not-found`.
- Bad JSON returns `manifest-invalid-json` with one issue.
- Each shape rule (missing field, wrong type, bad id pattern, bad role,
  bad mediaType, role/mediaType mismatch, duplicate `(id, role)`)
  returns `manifest-schema` with at least one issue at the correct
  JSON path. One test asserts multiple issues are collected at once.
- Path traversal (`./../escape.jpg`) returns `manifest-file-missing`.
- Non-existent local file returns `manifest-file-missing`.

Verify: same commands as Unit 1.

Acceptance: typecheck and tests pass; existing API tests unaffected.

## Unit 4 -- addArtwork orchestrator

Files:
- `apps/api/src/cli/addArtwork.ts` (new -- entrypoint AND library export)
- `apps/api/test/cli/addArtwork.test.ts` (new)

Behaviour:
- Export `type RunOptions = { manifestPath: string; dryRun: boolean;
  verbose: boolean; prisma: PrismaClient; uploader: OssUploader | null;
  stdout: NodeJS.WritableStream; stderr: NodeJS.WritableStream }`.
- Export `async function runAddArtwork(options: RunOptions): Promise<number>`
  that returns the intended exit code. The CLI entrypoint at the bottom
  of the file is a thin wrapper that:
  1. Parses `process.argv` for `manifestPath`, `--dry-run`, `--verbose`,
     `--help`. On `--help`, prints usage referencing
     `docs/cli-manifests/` and exits 0.
  2. Calls `loadConfig()`. On missing config, fails with `config-missing`.
     In non-dry-run mode, also requires OSS credentials, else
     `oss-credentials-missing`. **Test override**: if
     `process.env.OSS_UPLOADER_STUB === '1'`, the credentials check is
     waived and the entrypoint constructs a `StubOssUploader`
     pre-seeded to return `head -> false` for every key and accept
     every `put`. `--help` mentions this flag under "test mode". The
     flag is for tests only and is not advertised in the main usage
     synopsis.
  3. Constructs Prisma client and (when not dry-run and not in stub
     mode) the OSS uploader via `createOssUploader`. Passes them into
     `runAddArtwork`.
  4. `await prisma.$disconnect()` in `finally`. `process.exit(code)`.
- `runAddArtwork` orchestration follows the spec's Data Flow steps
  1-9 exactly. Notes:
  - Uploads are sequential, in manifest order.
  - `HEAD` -> if absent `PUT`, else mark `SKIP`. Collect successes.
  - On `PUT` failure, write a structured error block to `stderr` that
    includes the failing key, the list of keys already uploaded in
    this run, and the `oss-upload-failed` category. Return exit 30.
  - DB writes happen inside a single `prisma.$transaction`. Steps:
    upsert `Artwork`; for each manifest media, upsert `MediaAsset`
    and upsert `ArtworkMedia` (key tuple
    `(artworkId, mediaAssetId, role)`); delete every `ArtworkMedia`
    row for this `artworkId` not present in the manifest; delete
    every `MediaAsset` row left orphaned by that deletion.
  - On `--dry-run`, skip steps 7 and 8, print the plan, return 0.
- Output format matches the spec's Output Format section exactly,
  including stable labels (`artwork:`, `uploads:`, `links:`,
  `removed-links:`, the final `[add-artwork] OK` or `... DRY-RUN OK`).

Tests (integration, using a per-test temp SQLite file plus
`StubOssUploader`):
- Helper: spin up a fresh SQLite file under `os.tmpdir()`, apply the
  existing Prisma migration via `prisma migrate deploy` (programmatic
  or a one-time setup), and return a connected client.
- Helper: a fixtures dir under `apps/api/test/cli/fixtures/` with two
  tiny binary files (1-byte image, 1-byte mp3) and matching JSON
  manifests pointing at them.
- Test 1 (fresh insert): run against an empty DB; assert artwork +
  media rows + links exist; uploader received exactly 2 `head` + 2
  `put` calls; exit 0.
- Test 2 (re-run is idempotent): run twice; second run records only
  `head` calls, zero `put` calls; no DB diff (assert by snapshotting
  row counts and timestamps before/after).
- Test 3 (media removed in re-run): run with two media, then re-run
  with one media removed; assert removed `ArtworkMedia` link is gone
  and `MediaAsset` deleted iff no other artwork references it.
- Test 4 (upload failure mid-batch): stub set to throw on the second
  `put`; assert exit 30, zero DB writes, stderr names the failed key
  and lists the one already-uploaded key.
- Test 5 (`--dry-run` without credentials): run with `uploader: null`;
  assert exit 0, zero Prisma writes, stdout matches DRY-RUN format.
- Test 6 (manifest invalid JSON): run with a broken JSON file; assert
  exit 11, stderr `manifest-invalid-json`.

Verify: same commands as Unit 1.

Acceptance: typecheck and tests pass; existing API tests unaffected.

## Unit 5 -- package.json wiring

Files:
- `apps/api/package.json` (modify)
- `package.json` at repo root (modify)

Changes:
- `apps/api/package.json` scripts: add
  `"cli:add-artwork": "tsx --env-file=../../.env src/cli/addArtwork.ts"`.
- Root `package.json` scripts: add
  `"add-artwork": "npm run cli:add-artwork --workspace @galleria-principii/api --"`.

Verify:
- `npm run add-artwork -- ./docs/cli-manifests/example-image-only.json --dry-run`
  should exit 0 with no real files needed (dry-run does not require
  asset files to exist? -- IT DOES, per spec step 5 which validates
  files before computing keys; the example manifest points at
  `./assets/...` which does not exist). So either:
  a. Skip this command in verify and rely on Unit 4 integration tests,
     plus visual confirmation via `npm run add-artwork -- --help` exit 0.
  b. Provide a small `docs/cli-manifests/dry-run-self-test/` directory
     with a 1-byte placeholder image referenced by a self-test manifest.
- Choose (a): `--help` exits 0 and prints the path to
  `docs/cli-manifests/`. Document that `--dry-run` against an example
  manifest requires the operator to place real files in
  `./assets/...` first.

Acceptance: `npm run add-artwork -- --help` works.

## Unit 6 -- Example manifests (already committed)

Files (already present from spec commit 850e8b6):
- `docs/cli-manifests/example-image-only.json`
- `docs/cli-manifests/example-image-plus-soundtrack.json`
- `docs/cli-manifests/README.md`

No new files needed. Skip to Unit 7.

## Unit 7 -- E2E test: CLI -> gallery

Files:
- `e2e/fixtures/cli/manifest.json` (new)
- `e2e/fixtures/cli/primary.jpg` (new, 1-byte placeholder; binary)
- `e2e/cli-add-artwork.spec.ts` (new)

Behaviour:
- `e2e/fixtures/cli/manifest.json` describes a single artwork (id
  `harbor-lanterns-e2e`, distinct from any seeded artwork) with a
  single primary image media entry pointing at `./primary.jpg`.
- `e2e/cli-add-artwork.spec.ts`:
  - Runs in the existing `e2e/playwright.config.ts` setup, which
    already seeds 6 fixture artworks before the test suite.
  - At test start, invokes the CLI as a child process using `npx tsx`
    with `--env-file` pointing at a generated temp `.env` that sets:
    `DATABASE_URL=file:./e2e.db`, `ALIYUN_OSS_REGION=oss-cn-hangzhou`,
    `ALIYUN_OSS_BUCKET=galleria-principii-media`, and additionally
    sets `OSS_UPLOADER_STUB=1` (declared in Unit 4) so the CLI uses
    the in-process stub uploader and waives the credentials check.
  - After the CLI exits 0, reload `/`, then assert that
    `getByRole("button", { name: /Harbour Lanterns at Slack Water/i })`
    is visible. Open it; assert `Oil on canvas` and the manifest's
    description text are visible.
- Test cleanup: a `test.afterAll` runs `prisma migrate reset --force`
  then re-runs the existing seed so the next E2E run starts from the
  baseline state. (Equivalent: trust the existing `global-setup.ts`
  to re-reset on next run; choose whichever is cheaper. Document
  the chosen approach in the test file.)

Verify:
- `npm run test:e2e`

Acceptance: 13 E2E tests pass (12 existing + 1 new) across both
projects, so 26 runs total. The new test asserts the CLI-added
artwork is visible on the gallery.

## Unit 8 -- Final verification and commit

Verify:
- `npm run verify`

Expected:
- Typecheck clean.
- API tests: existing 15 + new ossUploader / ossKeys / manifest /
  addArtwork tests, all passing.
- Web tests: 5 existing, all passing (untouched).
- Build: clean.
- E2E: 13 tests pass per project.

Commit message (one commit covering all source changes):

```
Add CLI add-artwork command per design spec

Adds a single CLI command, run as `npm run add-artwork -- manifest.json`,
that uploads local media files to the configured Aliyun OSS bucket and
upserts artwork + media rows in SQLite. Manifest is the source of truth
(re-runs are idempotent; removed media unlinks rows and may delete
orphaned MediaAsset rows; OSS objects are never auto-deleted). Strict
mode requires real OSS credentials; --dry-run validates manifests
without credentials and without writes.

- services/ossUploader: OssUploader interface, AliyunOssUploader,
  StubOssUploader, createOssUploader factory.
- cli/ossKeys: deterministic OSS key derivation.
- cli/manifest: hand-rolled schema validator with structured issues.
- cli/addArtwork: orchestrator + thin entrypoint with arg parsing,
  exit codes, and the documented output format.
- New E2E test runs the CLI against a stub uploader and asserts the
  new artwork appears on the gallery.

Verified locally with npm run verify.
```

