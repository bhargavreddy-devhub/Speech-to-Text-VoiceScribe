import { formatBytes } from '../../utils/format';

interface FileChipListProps {
  files: File[];
  onRemove: (index: number) => void;
}

export function FileChipList({ files, onRemove }: FileChipListProps) {
  return (
    <div className="file-chip-list">
      {files.map((file, idx) => (
        <div className="file-chip" key={`${file.name}-${idx}`}>
          <span className="name">{file.name}</span>
          <span className="muted">{formatBytes(file.size)}</span>
          <button className="remove" aria-label={`Remove ${file.name}`} onClick={() => onRemove(idx)}>
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
