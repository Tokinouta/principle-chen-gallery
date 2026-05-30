import { describe, expect, it } from 'vitest';

import { ossKeyForOriginal } from '../../src/cli/ossKeys';

describe('ossKeyForOriginal', () => {
  it('lowercases the extension', () => {
    expect(ossKeyForOriginal('aw', 'm', 'image.JPG')).toBe('artworks/aw/media/m/original.jpg');
  });

  it('uses the source filename extension as-is when already lowercase', () => {
    expect(ossKeyForOriginal('aw', 'm', 'theme.mp3')).toBe('artworks/aw/media/m/original.mp3');
  });

  it('defaults to bin when there is no extension', () => {
    expect(ossKeyForOriginal('aw', 'm', 'no-extension')).toBe('artworks/aw/media/m/original.bin');
  });

  it('treats a leading-dot file as having the full remainder as its extension', () => {
    expect(ossKeyForOriginal('aw', 'm', '.envrc')).toBe('artworks/aw/media/m/original.envrc');
  });

  it('strips directory components before extracting the extension', () => {
    expect(ossKeyForOriginal('aw', 'm', './path/to/Primary.Jpeg')).toBe(
      'artworks/aw/media/m/original.jpeg'
    );
  });

  it('interpolates ids literally', () => {
    expect(ossKeyForOriginal('ophelia-study', 'ophelia-soundtrack', 't.mp3')).toBe(
      'artworks/ophelia-study/media/ophelia-soundtrack/original.mp3'
    );
  });

  it('treats a trailing dot as no extension', () => {
    expect(ossKeyForOriginal('aw', 'm', 'odd.')).toBe('artworks/aw/media/m/original.bin');
  });
});
