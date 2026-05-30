import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadManifest } from '../../src/cli/manifest';

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'manifest-test-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

async function writeFixtureFile(relativePath: string, contents = 'x'): Promise<string> {
  const absolute = join(workDir, relativePath);
  const parent = absolute.slice(0, absolute.lastIndexOf('/'));
  await mkdir(parent, { recursive: true });
  await writeFile(absolute, contents);
  return absolute;
}

async function writeManifest(name: string, body: unknown): Promise<string> {
  const path = join(workDir, name);
  await writeFile(path, JSON.stringify(body));
  return path;
}

const VALID_ARTWORK = {
  id: 'harbor-lanterns',
  title: 'Harbour Lanterns at Slack Water',
  artist: 'Marian Elmsworth',
  year: 1871,
  medium: 'Oil on canvas',
  period: 'Victorian Social Realism',
  summary: 'Lanterns floating across a still harbour at dusk.',
  description: 'A restrained dusk study of lantern light.'
};

describe('loadManifest', () => {
  it('parses a valid image-only manifest and applies defaults', async () => {
    await writeFixtureFile('assets/primary.jpg');
    const path = await writeManifest('manifest.json', {
      artwork: VALID_ARTWORK,
      media: [
        {
          id: 'harbor-lanterns-primary',
          file: './assets/primary.jpg',
          role: 'primary',
          mediaType: 'image',
          mimeType: 'image/jpeg'
        }
      ]
    });

    const result = await loadManifest(path);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.artwork.status).toBe('published');
    expect(result.manifest.artwork.sortOrder).toBe(0);
    expect(result.manifest.media[0].sortOrder).toBe(0);
    expect(result.manifest.media[0].resolvedPath).toBe(join(workDir, 'assets/primary.jpg'));
  });

  it('parses a valid image plus soundtrack manifest', async () => {
    await writeFixtureFile('assets/primary.jpg');
    await writeFixtureFile('assets/theme.mp3');
    const path = await writeManifest('manifest.json', {
      artwork: VALID_ARTWORK,
      media: [
        {
          id: 'm1',
          file: './assets/primary.jpg',
          role: 'primary',
          mediaType: 'image',
          mimeType: 'image/jpeg'
        },
        {
          id: 'm2',
          file: './assets/theme.mp3',
          role: 'soundtrack',
          mediaType: 'audio',
          mimeType: 'audio/mpeg',
          transcript: 'A short pianoforte motif.'
        }
      ]
    });

    const result = await loadManifest(path);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.media).toHaveLength(2);
    expect(result.manifest.media[1].transcript).toBe('A short pianoforte motif.');
  });

  it('returns manifest-not-found when the file does not exist', async () => {
    const result = await loadManifest(join(workDir, 'missing.json'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.category).toBe('manifest-not-found');
  });

  it('returns manifest-invalid-json on bad JSON', async () => {
    const path = join(workDir, 'broken.json');
    await writeFile(path, '{ not json');
    const result = await loadManifest(path);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.category).toBe('manifest-invalid-json');
    expect(result.issues).toHaveLength(1);
  });
});

describe('loadManifest schema errors', () => {
  it('rejects missing required artwork fields and collects multiple issues at once', async () => {
    await writeFixtureFile('assets/primary.jpg');
    const path = await writeManifest('manifest.json', {
      artwork: { id: 'good-id', title: 'has-title' },
      media: []
    });
    const result = await loadManifest(path);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.category).toBe('manifest-schema');
    const paths = result.issues.map((i) => i.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'artwork.artist',
        'artwork.year',
        'artwork.medium',
        'artwork.period',
        'artwork.summary',
        'artwork.description'
      ])
    );
  });

  it('rejects a bad id pattern', async () => {
    const path = await writeManifest('manifest.json', {
      artwork: { ...VALID_ARTWORK, id: 'Bad ID' },
      media: []
    });
    const result = await loadManifest(path);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.category).toBe('manifest-schema');
    expect(result.issues.some((i) => i.path === 'artwork.id')).toBe(true);
  });

  it('rejects unknown role values', async () => {
    await writeFixtureFile('assets/primary.jpg');
    const path = await writeManifest('manifest.json', {
      artwork: VALID_ARTWORK,
      media: [
        {
          id: 'm',
          file: './assets/primary.jpg',
          role: 'banner',
          mediaType: 'image',
          mimeType: 'image/jpeg'
        }
      ]
    });
    const result = await loadManifest(path);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.category).toBe('manifest-schema');
    expect(result.issues.some((i) => i.path === 'media[0].role')).toBe(true);
  });

  it('rejects role/mediaType mismatch (soundtrack + image)', async () => {
    await writeFixtureFile('assets/primary.jpg');
    const path = await writeManifest('manifest.json', {
      artwork: VALID_ARTWORK,
      media: [
        {
          id: 'm',
          file: './assets/primary.jpg',
          role: 'soundtrack',
          mediaType: 'image',
          mimeType: 'image/jpeg'
        }
      ]
    });
    const result = await loadManifest(path);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.category).toBe('manifest-schema');
    expect(result.issues.some((i) => i.path === 'media[0]')).toBe(true);
  });

  it('rejects duplicate (id, role) pairs within one manifest', async () => {
    await writeFixtureFile('assets/primary.jpg');
    const path = await writeManifest('manifest.json', {
      artwork: VALID_ARTWORK,
      media: [
        {
          id: 'shared',
          file: './assets/primary.jpg',
          role: 'primary',
          mediaType: 'image',
          mimeType: 'image/jpeg'
        },
        {
          id: 'shared',
          file: './assets/primary.jpg',
          role: 'primary',
          mediaType: 'image',
          mimeType: 'image/jpeg'
        }
      ]
    });
    const result = await loadManifest(path);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.category).toBe('manifest-schema');
    expect(result.issues.some((i) => i.message.includes('Duplicate'))).toBe(true);
  });
});

describe('loadManifest file errors', () => {
  it('rejects path traversal that escapes the manifest directory', async () => {
    const path = await writeManifest('manifest.json', {
      artwork: VALID_ARTWORK,
      media: [
        {
          id: 'm',
          file: '../../escape.jpg',
          role: 'primary',
          mediaType: 'image',
          mimeType: 'image/jpeg'
        }
      ]
    });
    const result = await loadManifest(path);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.category).toBe('manifest-file-missing');
    expect(result.issues[0].message).toMatch(/escapes the manifest directory/);
  });

  it('rejects a media file that does not exist', async () => {
    const path = await writeManifest('manifest.json', {
      artwork: VALID_ARTWORK,
      media: [
        {
          id: 'm',
          file: './assets/missing.jpg',
          role: 'primary',
          mediaType: 'image',
          mimeType: 'image/jpeg'
        }
      ]
    });
    const result = await loadManifest(path);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.category).toBe('manifest-file-missing');
  });
});
