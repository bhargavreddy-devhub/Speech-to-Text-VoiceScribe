import { useEffect, useMemo, useState } from 'react';
import { useFolders, useTranscripts } from '../hooks/useTranscripts';
import { HistoryFilters } from '../components/history/HistoryFilters';
import { HistoryListRow } from '../components/history/HistoryListRow';
import { debounce } from '../utils/format';
import type { HistoryFilters as HistoryFiltersType } from '../types';

export default function HistoryPage() {
  const [searchInput, setSearchInput] = useState('');
  const [committedSearch, setCommittedSearch] = useState('');
  const [language, setLanguage] = useState('');
  const [source, setSource] = useState('');
  const [folder, setFolder] = useState('');
  const [favorite, setFavorite] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortCombined, setSortCombined] = useState('created_at');

  const debouncedCommit = useMemo(() => debounce((v: string) => setCommittedSearch(v), 300), []);
  useEffect(() => {
    debouncedCommit(searchInput);
  }, [searchInput, debouncedCommit]);

  const [sortBy, sortDir] = sortCombined.split(':');
  const filters: HistoryFiltersType = {
    search: committedSearch,
    language,
    source,
    folder,
    favorite,
    dateFrom,
    dateTo,
    sortBy,
    sortDir: (sortDir as 'asc' | 'desc') || 'desc',
  };

  const { data: items, isError, error } = useTranscripts(filters);
  const { data: folders } = useFolders();

  return (
    <section className="page">
      <div className="card">
        <HistoryFilters
          search={searchInput}
          onSearchChange={setSearchInput}
          language={language}
          onLanguageChange={setLanguage}
          source={source}
          onSourceChange={setSource}
          folder={folder}
          onFolderChange={setFolder}
          folders={folders || []}
          favorite={favorite}
          onFavoriteChange={setFavorite}
          dateFrom={dateFrom}
          onDateFromChange={setDateFrom}
          dateTo={dateTo}
          onDateToChange={setDateTo}
          sortCombined={sortCombined}
          onSortChange={setSortCombined}
        />
        <div className="history-list" aria-live="polite">
          {isError && <p className="muted">Could not load history: {(error as Error).message}</p>}
          {items && items.length === 0 && (
            <p className="muted">No transcripts match these filters yet.</p>
          )}
          {items && items.map((item) => <HistoryListRow key={item.id} item={item} />)}
        </div>
      </div>
    </section>
  );
}
