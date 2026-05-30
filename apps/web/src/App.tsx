import { useEffect, useState } from 'react';
import { fetchArtworks, type Artwork } from './api/artworks';
import { ArtworkDetail } from './components/ArtworkDetail';
import { GalleryGrid } from './components/GalleryGrid';
import { SearchBox } from './components/SearchBox';
import { EmptyState, ErrorState, LoadingState } from './components/StatusStates';
import './styles/tokens.css';
import './styles/global.css';
import './styles/victorian.css';

type GalleryStatus = 'loading' | 'ready' | 'error';

export function App() {
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [status, setStatus] = useState<GalleryStatus>('loading');
  const [query, setQuery] = useState('');
  const [selectedArtwork, setSelectedArtwork] = useState<Artwork | null>(null);

  useEffect(() => {
    let isCurrentRequest = true;

    async function loadGallery() {
      try {
        const catalogue = await fetchArtworks({ search: query });
        if (isCurrentRequest) {
          setArtworks(catalogue);
          setStatus('ready');
        }
      } catch {
        if (isCurrentRequest) {
          setStatus('error');
        }
      }
    }

    setStatus((prev) => (prev === 'error' ? 'loading' : prev));
    void loadGallery();

    return () => {
      isCurrentRequest = false;
    };
  }, [query]);

  return (
    <main className="page-shell">
      <header className="gallery-masthead">
        <p className="gallery-kicker">
          <span className="ornament" aria-hidden="true">✦</span>
          Museum catalogue
          <span className="ornament" aria-hidden="true">✦</span>
        </p>
        <h1 className="gallery-title">Galleria Principii</h1>
        <p className="gallery-intro">
          A chamber of Victorian studies, river-lit panels, and carefully preserved painterly curiosities.
        </p>
      </header>

      {status === 'loading' ? <LoadingState /> : null}
      {status === 'error' ? <ErrorState /> : null}
      {status === 'ready' ? (
        <>
          <div className="gallery-controls">
            <SearchBox query={query} onQueryChange={setQuery} />
          </div>
          {artworks.length > 0 ? (
            <GalleryGrid artworks={artworks} onSelectArtwork={setSelectedArtwork} />
          ) : (
            <EmptyState />
          )}
        </>
      ) : null}

      {selectedArtwork ? <ArtworkDetail artwork={selectedArtwork} onClose={() => setSelectedArtwork(null)} /> : null}
    </main>
  );
}

export default App;
