import type { Artwork } from '../api/artworks';
import { ArtworkCard } from './ArtworkCard';

type GalleryGridProps = {
  artworks: Artwork[];
  onSelectArtwork: (artwork: Artwork) => void;
};

export function GalleryGrid({ artworks, onSelectArtwork }: GalleryGridProps) {
  return (
    <section className="gallery-grid" aria-label="Artwork catalogue">
      {artworks.map((artwork) => (
        <ArtworkCard key={artwork.id} artwork={artwork} onSelect={onSelectArtwork} />
      ))}
    </section>
  );
}
