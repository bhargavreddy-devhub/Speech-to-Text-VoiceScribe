import { useCallback, useRef, useState } from 'react';

// A single array of past textarea values with a position pointer is simpler
// and less error-prone than juggling separate undo/redo stacks.
export function useEditorHistory(initial: string) {
  const [text, setTextState] = useState(initial);
  const historyRef = useRef<string[]>([initial]);
  const posRef = useRef(0);

  const reset = useCallback((value: string) => {
    historyRef.current = [value];
    posRef.current = 0;
    setTextState(value);
  }, []);

  const setText = useCallback((value: string) => {
    historyRef.current = historyRef.current.slice(0, posRef.current + 1);
    historyRef.current.push(value);
    if (historyRef.current.length > 100) historyRef.current.shift();
    posRef.current = historyRef.current.length - 1;
    setTextState(value);
  }, []);

  const undo = useCallback(() => {
    if (posRef.current <= 0) return;
    posRef.current -= 1;
    setTextState(historyRef.current[posRef.current]);
  }, []);

  const redo = useCallback(() => {
    if (posRef.current >= historyRef.current.length - 1) return;
    posRef.current += 1;
    setTextState(historyRef.current[posRef.current]);
  }, []);

  return { text, setText, undo, redo, reset };
}
