# CLI manifests

Example manifests for the `add-artwork` CLI. See
`docs/superpowers/specs/2026-05-30-cli-add-artwork-design.md` for the
full design and the authoritative schema.

## Files

- `example-image-only.json` — one artwork with a single primary image.
- `example-image-plus-soundtrack.json` — one artwork with a primary
  image plus a soundtrack audio asset.

## Usage

```sh
npm run add-artwork -- ./docs/cli-manifests/example-image-only.json --dry-run
npm run add-artwork -- ./docs/cli-manifests/example-image-only.json
```

`--dry-run` validates the manifest and prints the planned actions. It
does not require Aliyun credentials and does not touch OSS or the
database.

## Field summary

`artwork`:

- `id` — slug-style, `[a-z0-9][a-z0-9-]*`; primary key for the row.
- `title`, `artist`, `medium`, `period`, `summary`, `description` —
  required catalogue fields.
- `year` — integer.
- `status` — optional; one of `draft`, `published`, `archived`.
  Defaults to `published`. Only `published` artworks appear on the
  gallery.
- `sortOrder` — optional; defaults to `0`. Controls catalogue order.

`media[*]`:

- `id` — slug-style, stable per asset; primary key of `MediaAsset`.
- `file` — path to a local file, **resolved relative to this manifest
  file's directory**. Paths that escape that directory are rejected.
- `role` — one of `primary`, `thumbnail`, `detail`, `video`, `audio`,
  `soundtrack`.
- `mediaType` — one of `image`, `video`, `audio`. Must be consistent
  with `role`.
- `mimeType` — required. The CLI does not sniff content type.
- `altText`, `caption`, `transcript` — optional accessibility metadata.
- `width`, `height`, `durationSeconds` — optional layout / playback
  metadata. The CLI does not auto-detect.
- `sortOrder` — optional; defaults to `0`.

## OSS object keys

The CLI writes objects under the pattern fixed by the storage design:

```
artworks/{artwork.id}/media/{media.id}/original.{ext}
```

where `{ext}` is taken from the local file's lowercased extension. You
do not specify the OSS key yourself.

## Re-runs

Re-running the CLI with the same manifest is safe and idempotent:

- Already-uploaded OSS objects are detected via HEAD and skipped.
- Artwork, MediaAsset, and ArtworkMedia rows are upserted.
- Media links that are no longer in the manifest are removed from the
  artwork, and the underlying `MediaAsset` rows are deleted when no
  other artwork references them.
- OSS objects are never auto-deleted, even when their DB rows go away.
