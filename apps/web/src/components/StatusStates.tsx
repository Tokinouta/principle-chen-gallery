export function LoadingState() {
  return (
    <section className="status-panel" aria-live="polite" aria-busy="true">
      <p className="gallery-kicker">
        <span className="ornament" aria-hidden="true">✦</span>
        Catalogue
        <span className="ornament" aria-hidden="true">✦</span>
      </p>
      <h2 className="status-title">Preparing the gallery catalogue</h2>
      <p className="status-copy">The attendants are setting the final labels in place.</p>
    </section>
  );
}

export function ErrorState() {
  return (
    <section className="status-panel" role="alert">
      <p className="gallery-kicker">
        <span className="ornament" aria-hidden="true">✦</span>
        Interruption
        <span className="ornament" aria-hidden="true">✦</span>
      </p>
      <h2 className="status-title">Unable to load the gallery</h2>
      <p className="status-copy">Please try again once the catalogue desk is available.</p>
    </section>
  );
}

export function EmptyState() {
  return (
    <section className="status-panel" aria-live="polite">
      <p className="gallery-kicker">
        <span className="ornament" aria-hidden="true">✦</span>
        No match
        <span className="ornament" aria-hidden="true">✦</span>
      </p>
      <h2 className="status-title">No artworks found</h2>
      <p className="status-copy">Try another title, artist, year, or medium from the catalogue.</p>
    </section>
  );
}
