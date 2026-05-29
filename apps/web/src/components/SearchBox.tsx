type SearchBoxProps = {
  query: string;
  onQueryChange: (query: string) => void;
};

export function SearchBox({ query, onQueryChange }: SearchBoxProps) {
  return (
    <div className="search-box">
      <label className="search-label" htmlFor="artwork-search">
        Search artworks
      </label>
      <input
        className="search-input"
        id="artwork-search"
        name="artwork-search"
        type="search"
        value={query}
        placeholder="Search by title, artist, year, or medium"
        onChange={(event) => onQueryChange(event.currentTarget.value)}
      />
    </div>
  );
}
