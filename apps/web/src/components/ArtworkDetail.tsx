import type { Artwork } from '../api/artworks';

type ArtworkDetailProps = {
  artwork: Artwork;
  onClose: () => void;
};

export function ArtworkDetail({ artwork, onClose }: ArtworkDetailProps) {
  return (
    <div className="detail-backdrop">
      <article className="detail-panel" role="dialog" aria-modal="true" aria-labelledby="artwork-detail-title">
        <button className="detail-close" type="button" onClick={onClose}>
          Return to gallery
        </button>
        <p className="gallery-kicker">
          <span className="ornament" aria-hidden="true">✦</span>
          Private viewing
          <span className="ornament" aria-hidden="true">✦</span>
        </p>
        <h2 className="detail-title" id="artwork-detail-title">{artwork.title}</h2>
        <dl className="detail-list">
          <dt>Artist</dt>
          <dd>{artwork.artist}</dd>
          <dt>Year</dt>
          <dd>{artwork.year}</dd>
          <dt>Medium</dt>
          <dd>{artwork.medium}</dd>
        </dl>
        <p className="detail-description">{artwork.description}</p>
      </article>
    </div>
  );
}
