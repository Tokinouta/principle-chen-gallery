import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import type { Artwork } from '../api/artworks';

const ophelia: Artwork = {
  id: 'ophelia-study',
  title: 'Study of Ophelia Among the Reeds',
  artist: 'Eleanor Ashworth',
  year: 1874,
  medium: 'Oil on panel',
  description: 'A quiet study of Ophelia held among reeds and dim river light.',
};

const roseWindow: Artwork = {
  id: 'rose-window-morning',
  title: 'Rose Window at Morning',
  artist: 'Beatrice Vale',
  year: 1881,
  medium: 'Watercolour on paper',
  description: 'Morning light breaks through stained glass and settles into gold wash.',
};

function mockGalleryResponse(artworks: Artwork[]): void {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify(artworks), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Galleria Principii', () => {
  it('loads and displays the seeded gallery artwork', async () => {
    mockGalleryResponse([ophelia]);

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Galleria Principii' })).toBeInTheDocument();
    expect(screen.getByText('Preparing the gallery catalogue')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Study of Ophelia Among the Reeds/i })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/artworks');
    expect(screen.getByText(/Eleanor Ashworth/)).toBeInTheDocument();
    expect(screen.getByText('Oil on panel')).toBeInTheDocument();
  });

  it('filters artworks by the search query and shows an empty state when none match', async () => {
    const user = userEvent.setup();
    mockGalleryResponse([ophelia, roseWindow]);

    render(<App />);
    await screen.findByRole('button', { name: /Study of Ophelia Among the Reeds/i });

    await user.type(screen.getByLabelText('Search artworks'), 'rose');

    expect(screen.queryByRole('button', { name: /Study of Ophelia Among the Reeds/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rose Window at Morning/i })).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Search artworks'));
    await user.type(screen.getByLabelText('Search artworks'), 'zzzz-no-match');

    expect(screen.getByText('No artworks found')).toBeInTheDocument();
  });

  it('shows an error state when the gallery cannot be loaded', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('Service unavailable', { status: 503 }));

    render(<App />);

    expect(await screen.findByText('Unable to load the gallery')).toBeInTheDocument();
    expect(screen.getByText(/Please try again/)).toBeInTheDocument();
  });

  it('opens artwork details and returns to the gallery', async () => {
    const user = userEvent.setup();
    mockGalleryResponse([ophelia]);

    render(<App />);
    await user.click(await screen.findByRole('button', { name: /Study of Ophelia Among the Reeds/i }));

    const detail = screen.getByRole('dialog', { name: 'Study of Ophelia Among the Reeds' });
    expect(within(detail).getByRole('heading', { name: 'Study of Ophelia Among the Reeds' })).toBeInTheDocument();
    expect(within(detail).getByText('Eleanor Ashworth')).toBeInTheDocument();
    expect(within(detail).getByText('1874')).toBeInTheDocument();
    expect(within(detail).getByText('Oil on panel')).toBeInTheDocument();
    expect(within(detail).getByText(/quiet study of Ophelia/)).toBeInTheDocument();

    await user.click(within(detail).getByRole('button', { name: 'Return to gallery' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Study of Ophelia Among the Reeds/i })).toBeInTheDocument();
  });
});
