import type { Artwork, MediaAsset } from '../api/artworks';

type ArtworkDetailProps = {
  artwork: Artwork;
  onClose: () => void;
};

function sortByRoleAndOrder(media: MediaAsset[]): MediaAsset[] {
  const rolePriority: Record<MediaAsset['role'], number> = {
    primary: 0,
    detail: 1,
    video: 2,
    audio: 3,
    soundtrack: 4,
    thumbnail: 5
  };
  return [...media].sort((a, b) => rolePriority[a.role] - rolePriority[b.role]);
}

function MediaRenderer({ asset, artworkTitle }: { asset: MediaAsset; artworkTitle: string }) {
  if (asset.status === 'unavailable' || asset.signedUrl === null) {
    return (
      <figure className="detail-media detail-media-unavailable">
        <figcaption>
          <span aria-label="Media currently unavailable">{asset.caption ?? `${asset.mediaType} unavailable`}</span>
        </figcaption>
      </figure>
    );
  }

  const captionNode = asset.caption ? <figcaption>{asset.caption}</figcaption> : null;
  const transcriptNode = asset.transcript ? (
    <details className="detail-transcript">
      <summary>Transcript</summary>
      <p>{asset.transcript}</p>
    </details>
  ) : null;

  switch (asset.mediaType) {
    case 'image':
      return (
        <figure className="detail-media">
          <img
            className="detail-image"
            src={asset.signedUrl}
            alt={asset.altText ?? artworkTitle}
            loading="lazy"
          />
          {captionNode}
        </figure>
      );
    case 'video':
      return (
        <figure className="detail-media">
          <video className="detail-video" src={asset.signedUrl} controls preload="metadata">
            <track kind="descriptions" label={asset.altText ?? artworkTitle} />
          </video>
          {captionNode}
          {transcriptNode}
        </figure>
      );
    case 'audio':
      return (
        <figure className="detail-media">
          <audio className="detail-audio" src={asset.signedUrl} controls preload="metadata" />
          {captionNode}
          {transcriptNode}
        </figure>
      );
    default:
      return null;
  }
}

export function ArtworkDetail({ artwork, onClose }: ArtworkDetailProps) {
  const sortedMedia = sortByRoleAndOrder(artwork.media);

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
          <dt>Period</dt>
          <dd>{artwork.period}</dd>
        </dl>
        <p className="detail-description">{artwork.description}</p>
        {sortedMedia.length > 0 ? (
          <section className="detail-media-grid" aria-label="Artwork media">
            {sortedMedia.map((asset) => (
              <MediaRenderer key={asset.id} asset={asset} artworkTitle={artwork.title} />
            ))}
          </section>
        ) : null}
      </article>
    </div>
  );
}
