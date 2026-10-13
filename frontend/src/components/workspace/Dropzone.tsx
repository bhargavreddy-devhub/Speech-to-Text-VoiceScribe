import { useRef, useState } from 'react';

export function Dropzone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      className={`dropzone${dragOver ? ' dragover' : ''}`}
      tabIndex={0}
      role="button"
      aria-label="Upload audio or video files"
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onFiles(Array.from(e.dataTransfer.files || []));
      }}
    >
      <p>Drag &amp; drop files here, or click to browse</p>
      <p className="muted" style={{ fontSize: '0.8rem' }}>
        You can select multiple files for batch transcription.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".wav,.mp3,.m4a,.aac,.ogg,.flac,.webm,.mp4,.mov"
        multiple
        onChange={(e) => {
          if (e.target.files) onFiles(Array.from(e.target.files));
          e.target.value = '';
        }}
      />
    </div>
  );
}
