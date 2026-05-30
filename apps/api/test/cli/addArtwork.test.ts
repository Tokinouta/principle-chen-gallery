import { execSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { PrismaClient } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runAddArtwork } from '../../src/cli/addArtwork';
import { StubOssUploader } from '../../src/services/ossUploader';

const REPO_API_DIR = resolve(__dirname, '../..');

let workDir: string;
let prisma: PrismaClient;
let stdout: WritableBuffer;
let stderr: WritableBuffer;

class WritableBuffer {
  chunks: string[] = [];
  write(chunk: string | Uint8Array): boolean {
    this.chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'));
    return true;
  }
  end(): void {}
  get text(): string {
    return this.chunks.join('');
  }
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'addArtwork-test-'));
  const dbPath = join(workDir, 'test.db');
  const databaseUrl = `file:${dbPath}`;

  execSync('npx prisma migrate deploy --schema prisma/schema.prisma', {
    cwd: REPO_API_DIR,
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: databaseUrl }
  });

  prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  stdout = new WritableBuffer();
  stderr = new WritableBuffer();
});

afterEach(async () => {
  await prisma.$disconnect();
  await rm(workDir, { recursive: true, force: true });
});

async function writeFixtureFile(relativePath: string, contents = 'x'): Promise<void> {
  const absolute = join(workDir, relativePath);
  const parent = absolute.slice(0, absolute.lastIndexOf('/'));
  await mkdir(parent, { recursive: true });
  await writeFile(absolute, contents);
}

async function writeManifest(body: unknown): Promise<string> {
  const path = join(workDir, 'manifest.json');
  await writeFile(path, JSON.stringify(body));
  return path;
}

const SAMPLE_ARTWORK = {
  id: 'harbor-lanterns',
  title: 'Harbour Lanterns at Slack Water',
  artist: 'Marian Elmsworth',
  year: 1871,
  medium: 'Oil on canvas',
  period: 'Victorian Social Realism',
  summary: 'Lanterns floating across a still harbour at dusk.',
  description: 'A restrained dusk study.'
};

describe('runAddArtwork', () => {
  it('creates artwork, media, and links on a fresh insert; uploader gets 1 head + 1 put per media', async () => {
    await writeFixtureFile('assets/primary.jpg');
    await writeFixtureFile('assets/theme.mp3');
    const manifestPath = await writeManifest({
      artwork: SAMPLE_ARTWORK,
      media: [
        {
          id: 'harbor-primary',
          file: './assets/primary.jpg',
          role: 'primary',
          mediaType: 'image',
          mimeType: 'image/jpeg'
        },
        {
          id: 'harbor-soundtrack',
          file: './assets/theme.mp3',
          role: 'soundtrack',
          mediaType: 'audio',
          mimeType: 'audio/mpeg'
        }
      ]
    });

    const uploader = new StubOssUploader();
    const code = await runAddArtwork({
      manifestPath,
      dryRun: false,
      verbose: false,
      prisma,
      uploader,
      stdout,
      stderr
    });

    expect(code).toBe(0);
    expect(stderr.text).toBe('');
    expect(uploader.heads).toHaveLength(2);
    expect(uploader.puts).toHaveLength(2);

    const rows = await prisma.artwork.findMany({ include: { media: true } });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('harbor-lanterns');
    expect(rows[0].media).toHaveLength(2);
    expect(stdout.text).toContain('UPSERTED');
    expect(stdout.text).toContain('OK');
  });

  it('re-running the same manifest is idempotent (only head calls, no puts)', async () => {
    await writeFixtureFile('assets/primary.jpg');
    const manifestPath = await writeManifest({
      artwork: SAMPLE_ARTWORK,
      media: [
        {
          id: 'harbor-primary',
          file: './assets/primary.jpg',
          role: 'primary',
          mediaType: 'image',
          mimeType: 'image/jpeg'
        }
      ]
    });
    const uploader = new StubOssUploader();

    await runAddArtwork({
      manifestPath, dryRun: false, verbose: false, prisma, uploader, stdout, stderr
    });
    const linksAfterFirst = await prisma.artworkMedia.findMany({});
    const updatedAtBefore = linksAfterFirst[0].id;

    const uploader2 = new StubOssUploader();
    uploader2.preseedPresent('artworks/harbor-lanterns/media/harbor-primary/original.jpg');
    const stdout2 = new WritableBuffer();
    const stderr2 = new WritableBuffer();

    const code = await runAddArtwork({
      manifestPath, dryRun: false, verbose: false, prisma, uploader: uploader2,
      stdout: stdout2, stderr: stderr2
    });

    expect(code).toBe(0);
    expect(uploader2.heads).toHaveLength(1);
    expect(uploader2.puts).toHaveLength(0);
    const linksAfterSecond = await prisma.artworkMedia.findMany({});
    expect(linksAfterSecond).toHaveLength(1);
    expect(linksAfterSecond[0].id).toBe(updatedAtBefore);
  });

  it('replaces media on re-run: removes old link, deletes orphaned media asset (does not touch OSS)', async () => {
    await writeFixtureFile('assets/primary.jpg');
    await writeFixtureFile('assets/soundtrack-v1.mp3');
    const firstManifest = await writeManifest({
      artwork: SAMPLE_ARTWORK,
      media: [
        {
          id: 'harbor-primary',
          file: './assets/primary.jpg',
          role: 'primary',
          mediaType: 'image',
          mimeType: 'image/jpeg'
        },
        {
          id: 'harbor-soundtrack-v1',
          file: './assets/soundtrack-v1.mp3',
          role: 'soundtrack',
          mediaType: 'audio',
          mimeType: 'audio/mpeg'
        }
      ]
    });
    const uploader1 = new StubOssUploader();
    const code1 = await runAddArtwork({
      manifestPath: firstManifest, dryRun: false, verbose: false,
      prisma, uploader: uploader1, stdout, stderr
    });
    expect(code1).toBe(0);

    await writeFixtureFile('assets/soundtrack-v2.mp3');
    const secondManifest = await writeManifest({
      artwork: SAMPLE_ARTWORK,
      media: [
        {
          id: 'harbor-primary',
          file: './assets/primary.jpg',
          role: 'primary',
          mediaType: 'image',
          mimeType: 'image/jpeg'
        },
        {
          id: 'harbor-soundtrack-v2',
          file: './assets/soundtrack-v2.mp3',
          role: 'soundtrack',
          mediaType: 'audio',
          mimeType: 'audio/mpeg'
        }
      ]
    });
    const uploader2 = new StubOssUploader();
    uploader2.preseedPresent('artworks/harbor-lanterns/media/harbor-primary/original.jpg');
    const stdout2 = new WritableBuffer();
    const stderr2 = new WritableBuffer();
    const code2 = await runAddArtwork({
      manifestPath: secondManifest, dryRun: false, verbose: false,
      prisma, uploader: uploader2, stdout: stdout2, stderr: stderr2
    });

    expect(code2).toBe(0);
    const links = await prisma.artworkMedia.findMany({ where: { artworkId: 'harbor-lanterns' } });
    const linkMediaIds = links.map((l) => l.mediaAssetId).sort();
    expect(linkMediaIds).toEqual(['harbor-primary', 'harbor-soundtrack-v2']);

    const v1 = await prisma.mediaAsset.findUnique({ where: { id: 'harbor-soundtrack-v1' } });
    expect(v1).toBeNull();
    expect(stdout2.text).toContain('removed-links');
    expect(stdout2.text).toContain('harbor-soundtrack-v1');
  });

  it('rolls back DB changes if an OSS upload fails partway; subsequent media are not attempted', async () => {
    await writeFixtureFile('assets/primary.jpg');
    await writeFixtureFile('assets/theme.mp3');
    const manifestPath = await writeManifest({
      artwork: SAMPLE_ARTWORK,
      media: [
        {
          id: 'harbor-primary',
          file: './assets/primary.jpg',
          role: 'primary',
          mediaType: 'image',
          mimeType: 'image/jpeg'
        },
        {
          id: 'harbor-soundtrack',
          file: './assets/theme.mp3',
          role: 'soundtrack',
          mediaType: 'audio',
          mimeType: 'audio/mpeg'
        }
      ]
    });

    const uploader = new StubOssUploader();
    uploader.queuePutError(new Error('boom'));
    uploader.queuePutError(new Error('should not reach'));

    const code = await runAddArtwork({
      manifestPath, dryRun: false, verbose: false, prisma, uploader, stdout, stderr
    });

    expect(code).toBe(30);
    expect(stderr.text).toContain('oss-upload-failed');
    expect(uploader.puts).toHaveLength(0);
    // Only one put attempt was made (the failing one); we should not have tried the second.
    expect(uploader.heads.length).toBeGreaterThanOrEqual(1);
    const artworkCount = await prisma.artwork.count();
    expect(artworkCount).toBe(0);
  });

  it('dry-run prints a plan without touching OSS or DB', async () => {
    await writeFixtureFile('assets/primary.jpg');
    const manifestPath = await writeManifest({
      artwork: SAMPLE_ARTWORK,
      media: [
        {
          id: 'harbor-primary',
          file: './assets/primary.jpg',
          role: 'primary',
          mediaType: 'image',
          mimeType: 'image/jpeg'
        }
      ]
    });

    const code = await runAddArtwork({
      manifestPath, dryRun: true, verbose: false,
      prisma: null, uploader: null, stdout, stderr
    });

    expect(code).toBe(0);
    expect(stdout.text).toContain('DRY-RUN');
    expect(stdout.text).toContain('artworks/harbor-lanterns/media/harbor-primary/original.jpg');
    expect(stderr.text).toBe('');
    const count = await prisma.artwork.count();
    expect(count).toBe(0);
  });

  it('returns exit code 13 with a clear error if a media file is missing on disk', async () => {
    const manifestPath = await writeManifest({
      artwork: SAMPLE_ARTWORK,
      media: [
        {
          id: 'harbor-primary',
          file: './assets/missing.jpg',
          role: 'primary',
          mediaType: 'image',
          mimeType: 'image/jpeg'
        }
      ]
    });

    const code = await runAddArtwork({
      manifestPath, dryRun: false, verbose: false,
      prisma, uploader: new StubOssUploader(), stdout, stderr
    });

    expect(code).toBe(13);
    expect(stderr.text).toContain('manifest-file-missing');
    expect(stderr.text).toContain('missing.jpg');
    const count = await prisma.artwork.count();
    expect(count).toBe(0);
  });
});
