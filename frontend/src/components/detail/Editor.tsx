import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

interface EditorProps {
  text: string;
  setText: (value: string) => void;
  undo: () => void;
  redo: () => void;
  autosaveNote: string;
}

export function Editor({ text, setText, undo, redo, autosaveNote }: EditorProps) {
  const [findOpen, setFindOpen] = useState(false);
  const [findValue, setFindValue] = useState('');
  const [replaceValue, setReplaceValue] = useState('');
  const lastFindIndexRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
    } else if (mod && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      setFindOpen((v) => !v);
    }
  }

  function replaceOne() {
    if (!findValue) return;
    const idx = text.indexOf(findValue, lastFindIndexRef.current);
    if (idx === -1) {
      lastFindIndexRef.current = 0;
      return;
    }
    const next = text.slice(0, idx) + replaceValue + text.slice(idx + findValue.length);
    setText(next);
    lastFindIndexRef.current = idx + replaceValue.length;
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(idx, idx + replaceValue.length);
    });
  }

  function replaceAll() {
    if (!findValue || !text.includes(findValue)) return;
    const next = text.split(findValue).join(replaceValue);
    setText(next);
    lastFindIndexRef.current = 0;
  }

  async function copyText() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard API may be unavailable — fail silently in the UI */
    }
  }

  return (
    <>
      <div className="editor-toolbar">
        <button className="btn btn-ghost btn-sm" title="Undo (Ctrl+Z)" onClick={undo}>
          ↶ Undo
        </button>
        <button className="btn btn-ghost btn-sm" title="Redo (Ctrl+Y)" onClick={redo}>
          ↷ Redo
        </button>
        <button
          className="btn btn-ghost btn-sm"
          title="Find & replace (Ctrl+F)"
          onClick={() => setFindOpen((v) => !v)}
        >
          🔎 Find &amp; replace
        </button>
        <button className="btn btn-ghost btn-sm" onClick={copyText}>
          📋 Copy
        </button>
        <span className="spacer" />
        <span className="autosave-note">{autosaveNote}</span>
      </div>
      <div className={`find-replace-row${findOpen ? ' open' : ''}`}>
        <input
          type="text"
          placeholder="Find…"
          value={findValue}
          onChange={(e) => setFindValue(e.target.value)}
        />
        <input
          type="text"
          placeholder="Replace with…"
          value={replaceValue}
          onChange={(e) => setReplaceValue(e.target.value)}
        />
        <button className="btn btn-ghost btn-sm" onClick={replaceOne}>
          Replace next
        </button>
        <button className="btn btn-ghost btn-sm" onClick={replaceAll}>
          Replace all
        </button>
      </div>
      <textarea
        ref={textareaRef}
        rows={12}
        aria-label="Transcript text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
      />
    </>
  );
}
