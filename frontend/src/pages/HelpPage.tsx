export default function HelpPage() {
  return (
    <section className="page">
      <h2>Help &amp; FAQ</h2>
      <details className="faq-item" open>
        <summary>Which audio and video formats are supported?</summary>
        <p>
          WAV, MP3, M4A, AAC, OGG, FLAC and WebM audio, plus MP4 and MOV video (the audio track is
          extracted automatically). Max 100&nbsp;MB per file by default.
        </p>
      </details>
      <details className="faq-item">
        <summary>How does live transcription work?</summary>
        <p>
          Your browser records short audio chunks and streams them to the server over a
          WebSocket. The last ~2 seconds of text may still change as more audio arrives; everything
          before that is locked in.
        </p>
      </details>
      <details className="faq-item">
        <summary>Is speaker labeling real voice-based diarization?</summary>
        <p>
          No — "Speaker 1 / Speaker 2" labels are an approximation based on pauses between
          sentences, not actual voice recognition. True diarization (pyannote.audio) can be added
          but needs a Hugging Face token and heavier dependencies.
        </p>
      </details>
      <details className="faq-item">
        <summary>Why are AI features (summarize, ask, rewrite) unavailable?</summary>
        <p>
          They call Anthropic's Claude API and need an API key configured on the server (
          <code>ANTHROPIC_API_KEY</code> in <code>backend/.env</code>). Ask your administrator to
          set one if you see a "not configured" message.
        </p>
      </details>
      <details className="faq-item">
        <summary>How do I enable Google sign-in?</summary>
        <p>
          Create an OAuth client in the Google Cloud Console, then set{' '}
          <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>, and{' '}
          <code>GOOGLE_REDIRECT_URI</code> in <code>backend/.env</code>.
        </p>
      </details>
      <details className="faq-item">
        <summary>Can I use keyboard shortcuts?</summary>
        <p>
          <kbd>Ctrl+Shift+R</kbd> start/stop live recording on the Workspace page, <kbd>Ctrl+F</kbd>{' '}
          opens find &amp; replace in the transcript editor, <kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Y</kbd>{' '}
          undo/redo edits.
        </p>
      </details>
      <h2 style={{ marginTop: 28 }}>Contact</h2>
      <p className="muted">
        Questions or issues? Email{' '}
        <a href="mailto:support@voicescribe.example">support@voicescribe.example</a>.
      </p>
    </section>
  );
}
