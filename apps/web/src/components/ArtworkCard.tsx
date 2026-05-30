import { pickCardMedia, type Artwork } from '../api/artworks';

type ArtworkCardProps = {
  artwork: Artwork;
  onSelect: (artwork: Artwork) => void;
};

export function ArtworkCard({ artwork, onSelect }: ArtworkCardProps) {
  const cardMedia = pickCardMedia(artwork);

  return (
    <button
      className="artwork-card"
      type="button"
      aria-label={`${artwork.title} by ${artwork.artist}, ${artwork.year}`}
      onClick={() => onSelect(artwork)}
    >
      {cardMedia && cardMedia.signedUrl ? (
        <img
          className="artwork-thumb"
          src={cardMedia.signedUrl}
          alt={cardMedia.altText ?? artwork.title}
          loading="lazy"
        />
      ) : (
        <span className="artwork-plate" aria-hidden="true">❦</span>
      )}
      <h2 className="artwork-title">{artwork.title}</h2>
      <p className="artwork-meta">
        {artwork.artist} · {artwork.year}
      </p>
      <p className="artwork-medium">{artwork.medium}</p>
    </button>
  );
}
