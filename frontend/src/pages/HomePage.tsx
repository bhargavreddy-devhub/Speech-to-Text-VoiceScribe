import { LANGUAGES } from '../constants/languages';

const FEATURES = [
  {
    emoji: '🎙️',
    title: 'Live Speech-to-Text',
    text: 'Start, pause, and stop recording with real-time interim and final transcripts.',
  },
  {
    emoji: '📁',
    title: 'File Transcription',
    text: 'Drag & drop MP3, WAV, M4A, AAC, OGG, FLAC, WebM, MP4 or MOV files, even in batches.',
  },
  {
    emoji: '🌐',
    title: '30+ Languages',
    text: 'Automatic language detection plus optional translation of the transcript.',
  },
  {
    emoji: '✍️',
    title: 'Full Transcript Editor',
    text: 'Undo/redo, find & replace, timestamps, speaker turns, and autosave.',
  },
  {
    emoji: '🤖',
    title: 'AI Summaries & Q&A',
    text: 'Summarize, extract meeting notes and action items, or ask questions about any transcript.',
  },
  {
    emoji: '📤',
    title: 'Export Anywhere',
    text: 'Download as TXT, DOCX, PDF, Markdown, or subtitles in SRT/VTT.',
  },
];

export default function HomePage() {
  return (
    <section className="page">
      <div className="hero">
        <h1>Turn speech into text, instantly.</h1>
        <p>
          Live microphone transcription, audio/video file uploads, 30+ languages, AI summaries, and
          exports to TXT, DOCX, PDF, SRT, VTT and Markdown — all in one workspace.
        </p>
        <div className="hero-actions">
          <a href="#/register" className="btn btn-primary">
            Get Started — it's free
          </a>
          <a href="#/workspace" className="btn btn-ghost">
            Try the demo
          </a>
        </div>
      </div>

      <div className="feature-grid">
        {FEATURES.map((f) => (
          <div className="feature-card" key={f.title}>
            <div className="emoji">{f.emoji}</div>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </div>
        ))}
      </div>

      <h2 style={{ textAlign: 'center' }}>Supported languages</h2>
      <div className="lang-chip-row">
        {LANGUAGES.map((l) => (
          <span className="lang-chip" key={l.code}>
            {l.name}
          </span>
        ))}
      </div>
    </section>
  );
}
