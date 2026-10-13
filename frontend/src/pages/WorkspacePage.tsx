import { useState, type FormEvent } from 'react';
import { useFileUpload } from '../hooks/useFileUpload';
import { LiveRecorderPanel } from '../components/workspace/LiveRecorderPanel';
import { Dropzone } from '../components/workspace/Dropzone';
import { FileChipList } from '../components/workspace/FileChipList';
import { UploadResultPanel } from '../components/workspace/UploadResultPanel';
import { LangSelect } from '../components/common/LangSelect';
import type { TranscriptDetail } from '../types';

export default function WorkspacePage() {
  const [translateTo, setTranslateTo] = useState('');
  const { pendingFiles, addFiles, removeFile, status, progress, submitting, previewUrl, result, submit } =
    useFileUpload();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit(translateTo);
  }

  const showResult = result && result.status === 'completed';

  return (
    <section className="page">
      <h2>Transcription Workspace</h2>

      <LiveRecorderPanel />

      <div className="card">
        <h2>Upload Audio / Video</h2>
        <p className="muted">
          WAV, MP3, M4A, AAC, OGG, FLAC, WebM, MP4, MOV — up to 100&nbsp;MB each. Long files are
          chunked and transcribed in the background.
        </p>

        <Dropzone onFiles={addFiles} />
        <FileChipList files={pendingFiles} onRemove={removeFile} />

        <form className="upload-form" onSubmit={handleSubmit}>
          <label>
            Translate transcript to (optional)
            <LangSelect
              value={translateTo}
              onChange={setTranslateTo}
              leadingOptionLabel="No translation — show original text only"
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            Transcribe
          </button>
        </form>

        {submitting && pendingFiles.length <= 1 && (
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
          </div>
        )}

        {status && <div className={`status-box ${status.kind === 'error' ? 'error' : status.kind}`}>{status.message}</div>}

        {showResult && <UploadResultPanel result={result as TranscriptDetail} previewUrl={previewUrl} />}
      </div>
    </section>
  );
}
