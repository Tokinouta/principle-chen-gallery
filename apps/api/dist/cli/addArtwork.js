import { isAbsolute, resolve as resolvePath } from 'node:path';
import { loadConfig } from '../config/env.js';
import { createPrismaClient } from '../db/prisma.js';
import { createOssUploader, StubOssUploader } from '../services/ossUploader.js';
import { ossKeyForOriginal } from './ossKeys.js';
import { loadManifest } from './manifest.js';
const EXIT_CODES = {
    'manifest-not-found': 10,
    'manifest-invalid-json': 11,
    'manifest-schema': 12,
    'manifest-file-missing': 13,
    'config-missing': 20,
    'oss-credentials-missing': 21,
    'oss-upload-failed': 30,
    'db-unavailable': 40,
    'db-transaction-failed': 41,
    unknown: 1
};
export async function runAddArtwork(options) {
    const { stdout, stderr } = options;
    const parsed = await loadManifest(options.manifestPath);
    if (!parsed.ok) {
        writeManifestError(stderr, parsed);
        return EXIT_CODES[parsed.category];
    }
    const { manifest, manifestPath } = parsed;
    const planned = manifest.media.map((m) => ({
        manifest: m,
        ossKey: ossKeyForOriginal(manifest.artwork.id, m.id, m.file)
    }));
    if (options.dryRun) {
        writeDryRunPlan(stdout, manifestPath, manifest, planned);
        return 0;
    }
    if (!options.uploader) {
        writeError(stderr, 'oss-credentials-missing', manifestPath, [
            'Set ALIBABA_CLOUD_ACCESS_KEY_ID and ALIBABA_CLOUD_ACCESS_KEY_SECRET, or re-run with --dry-run.'
        ]);
        return EXIT_CODES['oss-credentials-missing'];
    }
    if (!options.prisma) {
        writeError(stderr, 'db-unavailable', manifestPath, [
            'No Prisma client provided to runAddArtwork.'
        ]);
        return EXIT_CODES['db-unavailable'];
    }
    const uploaded = [];
    const skipped = [];
    for (const entry of planned) {
        try {
            const alreadyPresent = await options.uploader.head(entry.ossKey);
            if (alreadyPresent) {
                skipped.push(entry.ossKey);
                continue;
            }
            await options.uploader.put(entry.ossKey, entry.manifest.resolvedPath, entry.manifest.mimeType);
            uploaded.push(entry.ossKey);
        }
        catch (error) {
            writeUploadFailure(stderr, manifestPath, entry.ossKey, uploaded, error, options.verbose);
            return EXIT_CODES['oss-upload-failed'];
        }
    }
    let removedLinks = [];
    try {
        removedLinks = await applyDatabaseChanges(options.prisma, manifest);
    }
    catch (error) {
        writeDbFailure(stderr, manifestPath, error, options.verbose);
        return EXIT_CODES['db-transaction-failed'];
    }
    writeSuccess(stdout, manifestPath, manifest, planned, uploaded, skipped, removedLinks);
    return 0;
}
async function applyDatabaseChanges(prisma, manifest) {
    const artworkData = {
        title: manifest.artwork.title,
        artist: manifest.artwork.artist,
        year: manifest.artwork.year,
        medium: manifest.artwork.medium,
        period: manifest.artwork.period,
        summary: manifest.artwork.summary,
        description: manifest.artwork.description,
        status: manifest.artwork.status,
        sortOrder: manifest.artwork.sortOrder
    };
    return prisma.$transaction(async (tx) => {
        await tx.artwork.upsert({
            where: { id: manifest.artwork.id },
            create: { id: manifest.artwork.id, ...artworkData },
            update: artworkData
        });
        const manifestPairs = new Set(manifest.media.map((m) => `${m.id}::${m.role}`));
        for (const m of manifest.media) {
            const mediaData = {
                ossBucket: process.env.ALIYUN_OSS_BUCKET ?? '',
                ossRegion: process.env.ALIYUN_OSS_REGION ?? '',
                ossKey: ossKeyForOriginal(manifest.artwork.id, m.id, m.file),
                mediaType: m.mediaType,
                mimeType: m.mimeType,
                byteSize: 0,
                width: m.width ?? null,
                height: m.height ?? null,
                durationSeconds: m.durationSeconds ?? null,
                altText: m.altText ?? null,
                transcript: m.transcript ?? null,
                caption: m.caption ?? null
            };
            await tx.mediaAsset.upsert({
                where: { id: m.id },
                create: { id: m.id, ...mediaData },
                update: mediaData
            });
            const linkId = `${manifest.artwork.id}-link-${m.id}-${m.role}`;
            await tx.artworkMedia.upsert({
                where: {
                    artworkId_mediaAssetId_role: {
                        artworkId: manifest.artwork.id,
                        mediaAssetId: m.id,
                        role: m.role
                    }
                },
                create: {
                    id: linkId,
                    artworkId: manifest.artwork.id,
                    mediaAssetId: m.id,
                    role: m.role,
                    sortOrder: m.sortOrder
                },
                update: { sortOrder: m.sortOrder }
            });
        }
        const existingLinks = await tx.artworkMedia.findMany({
            where: { artworkId: manifest.artwork.id }
        });
        const stale = existingLinks.filter((link) => !manifestPairs.has(`${link.mediaAssetId}::${link.role}`));
        for (const link of stale) {
            await tx.artworkMedia.delete({ where: { id: link.id } });
        }
        const orphanCandidates = Array.from(new Set(stale.map((link) => link.mediaAssetId)));
        const removedSummary = stale.map((s) => ({
            mediaAssetId: s.mediaAssetId,
            role: s.role
        }));
        for (const mediaAssetId of orphanCandidates) {
            const remainingRefs = await tx.artworkMedia.count({ where: { mediaAssetId } });
            if (remainingRefs === 0) {
                await tx.mediaAsset.delete({ where: { id: mediaAssetId } });
            }
        }
        return removedSummary;
    });
}
function writeManifestError(stderr, result) {
    stderr.write(`[add-artwork] FAIL: ${result.category}\n`);
    stderr.write(`  manifest: ${result.manifestPath}\n`);
    for (const issue of result.issues) {
        if (issue.path.length > 0) {
            stderr.write(`  at:       ${issue.path}\n`);
        }
        stderr.write(`  detail:   ${issue.message}\n`);
    }
    stderr.write(`  hint:     ${hintFor(result.category)}\n`);
}
function writeError(stderr, category, manifestPath, hints) {
    stderr.write(`[add-artwork] FAIL: ${category}\n`);
    stderr.write(`  manifest: ${manifestPath}\n`);
    for (const hint of hints) {
        stderr.write(`  hint:     ${hint}\n`);
    }
}
function writeUploadFailure(stderr, manifestPath, failingKey, alreadyUploaded, error, verbose) {
    stderr.write(`[add-artwork] FAIL: oss-upload-failed\n`);
    stderr.write(`  manifest: ${manifestPath}\n`);
    stderr.write(`  detail:   upload failed for ${failingKey}\n`);
    stderr.write(`  cause:    ${errorMessage(error)}\n`);
    if (alreadyUploaded.length > 0) {
        stderr.write(`  uploaded-this-run:\n`);
        for (const key of alreadyUploaded) {
            stderr.write(`    - ${key}\n`);
        }
    }
    stderr.write('  hint:     fix the cause and re-run; already-uploaded objects will be skipped via HEAD.\n');
    if (verbose && error instanceof Error && error.stack) {
        stderr.write(error.stack + '\n');
    }
}
function writeDbFailure(stderr, manifestPath, error, verbose) {
    stderr.write(`[add-artwork] FAIL: db-transaction-failed\n`);
    stderr.write(`  manifest: ${manifestPath}\n`);
    stderr.write(`  detail:   ${errorMessage(error)}\n`);
    stderr.write(`  hint:     the transaction rolled back; no partial DB state remains.\n`);
    if (verbose && error instanceof Error && error.stack) {
        stderr.write(error.stack + '\n');
    }
}
function writeDryRunPlan(stdout, manifestPath, manifest, planned) {
    stdout.write(`[add-artwork] DRY-RUN ${manifestPath}\n`);
    stdout.write(`  artwork: ${manifest.artwork.id} (will UPSERT, status=${manifest.artwork.status})\n`);
    stdout.write(`  media:\n`);
    for (const p of planned) {
        stdout.write(`    UPLOAD-OR-SKIP  ${p.ossKey}\n`);
    }
    stdout.write(`  links:\n`);
    for (const p of planned) {
        stdout.write(`    UPSERT  ${manifest.artwork.id} / ${p.manifest.id}    role=${p.manifest.role}\n`);
    }
    stdout.write(`  removed-links: (only computable against a live DB; skipped in dry-run)\n`);
    stdout.write(`[add-artwork] DRY-RUN OK -- no changes written\n`);
}
function writeSuccess(stdout, manifestPath, manifest, planned, uploaded, skipped, removedLinks) {
    stdout.write(`[add-artwork] ${manifestPath}\n`);
    stdout.write(`  artwork: ${manifest.artwork.id} UPSERTED\n`);
    stdout.write(`  uploads:\n`);
    for (const p of planned) {
        const verb = uploaded.includes(p.ossKey) ? 'PUT  ' : 'SKIP ';
        stdout.write(`    ${verb}   ${p.ossKey}\n`);
    }
    stdout.write(`  links:\n`);
    for (const p of planned) {
        stdout.write(`    +${p.manifest.role}    ${p.manifest.id}\n`);
    }
    if (removedLinks.length === 0) {
        stdout.write(`  removed-links: (none)\n`);
    }
    else {
        stdout.write(`  removed-links:\n`);
        for (const r of removedLinks) {
            stdout.write(`    -${r.role}    ${r.mediaAssetId}\n`);
        }
    }
    stdout.write(`[add-artwork] OK\n`);
    void skipped;
}
function hintFor(category) {
    switch (category) {
        case 'manifest-not-found':
            return 'pass a path to a JSON manifest file';
        case 'manifest-invalid-json':
            return 'fix the JSON syntax error reported above';
        case 'manifest-schema':
            return 'fix the listed shape issues and re-run';
        case 'manifest-file-missing':
            return 'check media[*].file paths; they must exist under the manifest directory';
    }
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function parseArgs(argv) {
    let manifestPath = null;
    let dryRun = false;
    let verbose = false;
    let help = false;
    for (const arg of argv.slice(2)) {
        if (arg === '--dry-run')
            dryRun = true;
        else if (arg === '--verbose')
            verbose = true;
        else if (arg === '--help' || arg === '-h')
            help = true;
        else if (manifestPath === null)
            manifestPath = arg;
    }
    return { manifestPath, dryRun, verbose, help };
}
function printHelp(stdout) {
    stdout.write(`add-artwork: add one artwork (metadata + media) to the Galleria Principii catalogue.

Usage:
  npm run add-artwork -- <manifest.json> [--dry-run] [--verbose]

Examples:
  npm run add-artwork -- ./docs/cli-manifests/example-image-only.json --dry-run
  npm run add-artwork -- ./my-artwork/manifest.json

Flags:
  --dry-run   Validate the manifest and print the planned actions
              without uploading to OSS or writing to the database.
              Does not require Aliyun credentials.
  --verbose   Include stack traces in error output.
  --help, -h  Show this help.

See example manifests under: docs/cli-manifests/

Test mode (for end-to-end tests only):
  Set OSS_UPLOADER_STUB=1 to use an in-process stub uploader and skip
  the OSS credentials check. Not intended for normal use.
`);
}
async function main() {
    const { manifestPath, dryRun, verbose, help } = parseArgs(process.argv);
    if (help) {
        printHelp(process.stdout);
        process.exit(0);
    }
    if (manifestPath === null) {
        process.stderr.write('[add-artwork] FAIL: manifest-not-found\n');
        process.stderr.write('  hint:     pass a path to a JSON manifest file as the first argument\n');
        process.exit(EXIT_CODES['manifest-not-found']);
    }
    // npm sets INIT_CWD to the directory the user invoked `npm` from.
    // When invoked via `npm run add-artwork --`, the process cwd is apps/api/
    // but the user typed a path relative to their shell cwd. Resolve against INIT_CWD
    // when present so relative paths work as the user expects.
    const userCwd = process.env.INIT_CWD ?? process.cwd();
    const resolvedManifestPath = isAbsolute(manifestPath)
        ? manifestPath
        : resolvePath(userCwd, manifestPath);
    const stubMode = process.env.OSS_UPLOADER_STUB === '1';
    let config;
    try {
        config = loadConfig();
    }
    catch (error) {
        process.stderr.write(`[add-artwork] FAIL: config-missing\n`);
        process.stderr.write(`  detail:   ${error instanceof Error ? error.message : String(error)}\n`);
        process.stderr.write(`  hint:     set the named environment variable, then re-run.\n`);
        process.exit(EXIT_CODES['config-missing']);
        return;
    }
    let uploader = null;
    if (!dryRun) {
        if (stubMode) {
            uploader = new StubOssUploader();
        }
        else if (config.oss.credentials) {
            uploader = createOssUploader(config.oss);
        }
        else {
            process.stderr.write(`[add-artwork] FAIL: oss-credentials-missing\n`);
            process.stderr.write('  hint:     set ALIBABA_CLOUD_ACCESS_KEY_ID and ALIBABA_CLOUD_ACCESS_KEY_SECRET, or re-run with --dry-run.\n');
            process.exit(EXIT_CODES['oss-credentials-missing']);
            return;
        }
    }
    const prisma = dryRun ? null : createPrismaClient(config.databaseUrl);
    let code = 1;
    try {
        code = await runAddArtwork({
            manifestPath: resolvedManifestPath,
            dryRun,
            verbose,
            prisma,
            uploader,
            stdout: process.stdout,
            stderr: process.stderr
        });
    }
    finally {
        if (prisma) {
            await prisma.$disconnect();
        }
    }
    process.exit(code);
}
const invokedDirectly = process.argv[1] && /addArtwork\.[cm]?[tj]s$/.test(process.argv[1]);
if (invokedDirectly) {
    void main();
}
//# sourceMappingURL=addArtwork.js.map