import { LANGUAGES } from '../../constants/languages';

interface HistoryFiltersProps {
  search: string;
  onSearchChange: (v: string) => void;
  language: string;
  onLanguageChange: (v: string) => void;
  source: string;
  onSourceChange: (v: string) => void;
  folder: string;
  onFolderChange: (v: string) => void;
  folders: string[];
  favorite: string;
  onFavoriteChange: (v: string) => void;
  dateFrom: string;
  onDateFromChange: (v: string) => void;
  dateTo: string;
  onDateToChange: (v: string) => void;
  sortCombined: string;
  onSortChange: (v: string) => void;
}

export function HistoryFilters({
  search,
  onSearchChange,
  language,
  onLanguageChange,
  source,
  onSourceChange,
  folder,
  onFolderChange,
  folders,
  favorite,
  onFavoriteChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  sortCombined,
  onSortChange,
}: HistoryFiltersProps) {
  return (
    <>
      <div className="history-header">
        <h2 style={{ margin: 0 }}>Transcript History</h2>
        <input
          type="search"
          placeholder="Search transcripts…"
          aria-label="Search transcripts"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <div className="filter-row">
        <select value={language} onChange={(e) => onLanguageChange(e.target.value)}>
          <option value="">All languages</option>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
        <select value={source} onChange={(e) => onSourceChange(e.target.value)}>
          <option value="">All sources</option>
          <option value="upload">Upload</option>
          <option value="live">Live recording</option>
        </select>
        <select value={folder} onChange={(e) => onFolderChange(e.target.value)}>
          <option value="">All folders</option>
          {folders.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select value={favorite} onChange={(e) => onFavoriteChange(e.target.value)}>
          <option value="">All</option>
          <option value="true">⭐ Favorites only</option>
        </select>
        <input
          type="date"
          aria-label="From date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
        />
        <input
          type="date"
          aria-label="To date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
        />
        <select value={sortCombined} onChange={(e) => onSortChange(e.target.value)}>
          <option value="created_at">Newest first</option>
          <option value="created_at:asc">Oldest first</option>
          <option value="name:asc">Name A–Z</option>
          <option value="duration:desc">Longest first</option>
        </select>
      </div>
    </>
  );
}
