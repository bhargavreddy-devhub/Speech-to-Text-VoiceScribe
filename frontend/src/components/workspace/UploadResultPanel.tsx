import { languageName } from '../../constants/languages';
import type { TranscriptDetail } from '../../types';

interface UploadResultPanelProps {
  result: TranscriptDetail;
  previewUrl: string | null;
}

export function UploadResultPanel({ result, previewUrl }: UploadResultPanelProps) {
  return (
    <div className="result-panel">
      <div className="result-block">
        <h3>Original Audio</h3>
        {previewUrl && <audio src={previewUrl} controls />}
      </div>
      <div className="result-block">
        <h3>Transcript{result.language ? ` (detected: ${languageName(result.language)})` : ''}</h3>
        <div className="transcript-box">{result.text || '(no speech detected)'}</div>
      </div>
      {result.translated_text && (
        <div className="result-block">
          <h3>Translated ({languageName(result.translated_language)})</h3>
          <div className="transcript-box">{result.translated_text}</div>
        </div>
      )}
      <div>
        <a href="#/history" className="btn btn-ghost btn-sm">
          Open in History for full editor &amp; AI tools →
        </a>
      </div>
    </div>
  );
}
