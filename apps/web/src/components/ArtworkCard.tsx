import type { Artwork } from '../api/artworks';

type ArtworkCardProps = {
  artwork: Artwork;
  onSelect: (artwork: Artwork) => void;
};

export function ArtworkCard({ artwork, onSelect }: ArtworkCardProps) {
  return (
    <button
      className="artwork-card"
      type="button"
      aria-label={`${artwork.title} by ${artwork.artist}, ${artwork.year}`}
      onClick={() => onSelect(artwork)}
    >
      <span className="artwork-plate" aria-hidden="true">❦</span>
      <h2 className="artwork-title">{artwork.title}</h2>
      <p className="artwork-meta">
        {artwork.artist} · {artwork.year}
      </p>
      <p className="artwork-medium">{artwork.medium}</p>
    </button>
  );
}
