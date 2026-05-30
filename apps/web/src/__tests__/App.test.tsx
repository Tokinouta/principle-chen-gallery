import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import type { Artwork, MediaAsset } from '../api/artworks';

function makeMedia(overrides: Partial<MediaAsset> & Pick<MediaAsset, 'id' | 'mediaType' | 'role'>): MediaAsset {
  return {
    id: overrides.id,
    mediaType: overrides.mediaType,
    role: overrides.role,
    mimeType: overrides.mimeType ?? (overrides.mediaType === 'audio' ? 'audio/mpeg' : 'image/jpeg'),
    signedUrl: overrides.signedUrl ?? 'https://signed.example.invalid/' + overrides.id,
    expiresAt: overrides.expiresAt ?? '2099-01-01T00:00:00.000Z',
    status: overrides.status ?? 'available',
    altText: overrides.altText,
    transcript: overrides.transcript,
    caption: overrides.caption,
    width: overrides.width,
    height: overrides.height,
    durationSeconds: overrides.durationSeconds
  };
}

const ophelia: Artwork = {
  id: 'ophelia-study',
  title: 'Study of Ophelia Among the Reeds',
  artist: 'Eleanor Ashworth',
  year: 1874,
  medium: 'Oil on panel',
  period: 'Victorian Pre-Raphaelite',
  summary: 'A quiet riverbank meditation.',
  description: 'A quiet study of Ophelia held among reeds and dim river light.',
  media: [
    makeMedia({
      id: 'ophelia-primary',
      mediaType: 'image',
      role: 'primary',
      altText: 'Ophelia among reeds',
      caption: 'Primary panel'
    }),
    makeMedia({
      id: 'ophelia-soundtrack',
      mediaType: 'audio',
      role: 'soundtrack',
      caption: 'Pianoforte theme',
      transcript: 'Slow pianoforte in D minor.'
    })
  ]
};

const roseWindow: Artwork = {
  id: 'rose-window-morning',
  title: 'Rose Window at Morning',
  artist: 'Beatrice Vale',
  year: 1881,
  medium: 'Watercolour on paper',
  period: 'Victorian Gothic Revival',
  summary: 'Morning light through rose window.',
  description: 'Morning light breaks through stained glass and settles into gold wash.',
  media: [
    makeMedia({
      id: 'rose-primary',
      mediaType: 'image',
      role: 'primary',
      altText: 'Rose window'
    })
  ]
};

function jsonResponse(artworks: Artwork[]): Response {
  return new Response(JSON.stringify(artworks), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Galleria Principii', () => {
  it('loads and displays the seeded gallery artwork with a primary image thumbnail', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse([ophelia]));

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Galleria Principii' })).toBeInTheDocument();
    expect(screen.getByText('Preparing the gallery catalogue')).toBeInTheDocument();
    const card = await screen.findByRole('button', { name: /Study of Ophelia Among the Reeds/i });
    expect(card).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/artworks');
    const thumb = within(card).getByRole('img');
    expect(thumb).toHaveAttribute('src', expect.stringContaining('ophelia-primary'));
    expect(thumb).toHaveAttribute('alt', 'Ophelia among reeds');
  });

  it('requeries the backend when the search query changes and renders only returned artworks', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('search=')) {
        const term = new URL(url, 'http://localhost').searchParams.get('search') ?? '';
        const lower = term.toLowerCase();
        if (lower.includes('rose')) {
          return jsonResponse([roseWindow]);
        }
        if (lower.includes('zzzz')) {
          return jsonResponse([]);
        }
        return jsonResponse([]);
      }
      return jsonResponse([ophelia, roseWindow]);
    });

    render(<App />);
    await screen.findByRole('button', { name: /Study of Ophelia Among the Reeds/i });

    await user.type(screen.getByLabelText('Search artworks'), 'rose');

    await screen.findByRole('button', { name: /Rose Window at Morning/i });
    expect(screen.queryByRole('button', { name: /Study of Ophelia Among the Reeds/i })).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('search=rose'))).toBe(true);

    await user.clear(screen.getByLabelText('Search artworks'));
    await user.type(screen.getByLabelText('Search artworks'), 'zzzz-no-match');

    expect(await screen.findByText('No artworks found')).toBeInTheDocument();
  });

  it('shows an error state when the gallery cannot be loaded', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('Service unavailable', { status: 503 }));

    render(<App />);

    expect(await screen.findByText('Unable to load the gallery')).toBeInTheDocument();
    expect(screen.getByText(/Please try again/)).toBeInTheDocument();
  });

  it('opens artwork details, renders image plus audio media, and returns to the gallery', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(jsonResponse([ophelia]));

    render(<App />);
    await user.click(await screen.findByRole('button', { name: /Study of Ophelia Among the Reeds/i }));

    const detail = screen.getByRole('dialog', { name: 'Study of Ophelia Among the Reeds' });
    expect(within(detail).getByRole('heading', { name: 'Study of Ophelia Among the Reeds' })).toBeInTheDocument();
    expect(within(detail).getByText('Eleanor Ashworth')).toBeInTheDocument();
    expect(within(detail).getByText('1874')).toBeInTheDocument();
    expect(within(detail).getByText('Oil on panel')).toBeInTheDocument();
    expect(within(detail).getByText(/quiet study of Ophelia/)).toBeInTheDocument();

    const detailImg = within(detail).getByRole('img', { name: /Ophelia among reeds/i });
    expect(detailImg).toHaveAttribute('src', expect.stringContaining('ophelia-primary'));

    expect(within(detail).getByText('Pianoforte theme')).toBeInTheDocument();
    expect(within(detail).getByText('Transcript')).toBeInTheDocument();

    await user.click(within(detail).getByRole('button', { name: 'Return to gallery' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders an unavailable indicator when a media asset has no signed url and does not crash', async () => {
    const unavailable: Artwork = {
      ...ophelia,
      media: [
        makeMedia({
          id: 'ophelia-primary',
          mediaType: 'image',
          role: 'primary',
          signedUrl: null,
          expiresAt: null,
          status: 'unavailable',
          caption: 'Image being restored'
        })
      ]
    };
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(jsonResponse([unavailable]));

    render(<App />);
    const card = await screen.findByRole('button', { name: /Study of Ophelia Among the Reeds/i });
    expect(within(card).queryByRole('img')).not.toBeInTheDocument();

    await user.click(card);
    const detail = screen.getByRole('dialog', { name: 'Study of Ophelia Among the Reeds' });
    expect(within(detail).getByText('Image being restored')).toBeInTheDocument();
  });
});
