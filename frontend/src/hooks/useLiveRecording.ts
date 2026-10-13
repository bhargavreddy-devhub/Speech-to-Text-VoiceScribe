import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import type { StreamMessage } from '../types';
import { applyLiveMessage, MAX_RECONNECT_ATTEMPTS, nextReconnectDelayMs } from './liveStreamReducer';

export type LivePhase = 'idle' | 'starting' | 'recording' | 'paused' | 'reconnecting' | 'finalizing';

function micErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Microphone access was denied. Allow microphone permission for this site in your browser settings and try again.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No microphone was found. Plug one in or check your system’s sound settings.';
  }
  if (name === 'NotReadableError') {
    return 'Your microphone is busy or unavailable — close other apps that might be using it.';
  }
  const message = err instanceof Error ? err.message : String(err);
  return `Could not access the microphone: ${message || name}`;
}

// All mutable recording handles (socket, recorder, audio graph, timers) live in
// refs rather than state — they're written from async callbacks (socket events,
// rAF ticks, interval ticks) that must always see the latest handle, not a
// value captured by a stale render closure.
export function useLiveRecording(language: string) {
  const [phase, setPhase] = useState<LivePhase>('idle');
  const [confirmedText, setConfirmedText] = useState('');
  const [tentativeText, setTentativeText] = useState('');
  const [error, setError] = useState('');
  const [duration, setDuration] = useState(0);
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState<number | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const chunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const noiseRafRef = useRef<number | null>(null);
  const noiseMeterElRef = useRef<HTMLSpanElement | null>(null);
  const languageRef = useRef(language);
  const intentionalCloseRef = useRef(false);
  const discardNextRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const lastUpdateAtRef = useRef<number | null>(null);
  const connectSocketRef = useRef<(isReconnect: boolean) => void>(() => {});
  // Bridges the gap between a Start click and React actually committing the
  // 'starting' phase: two rapid clicks/shortcut-presses in the same tick both
  // still see the stale 'idle' phase from the last render, so the `phase`
  // check alone can't stop a second concurrent start() from requesting a
  // second mic stream.
  const startingRef = useRef(false);
  // Mirrors `phase` for code (stop(), the 'ended' track listener) that needs
  // the current value synchronously rather than whatever was captured by a
  // closure at render time.
  const phaseRef = useRef<LivePhase>('idle');
  useEffect(() => {
    languageRef.current = language;
  }, [language]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const qc = useQueryClient();

  const stopNoiseMeter = useCallback(() => {
    if (noiseRafRef.current !== null) cancelAnimationFrame(noiseRafRef.current);
    noiseRafRef.current = null;
    if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});
    audioCtxRef.current = null;
  }, []);

  const startNoiseMeter = useCallback((stream: MediaStream) => {
    try {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtxClass) return;
      const ctx = new AudioCtxClass();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const level = Math.min(1, avg / 80);
        const bars = noiseMeterElRef.current?.querySelectorAll('span');
        if (bars) {
          const litCount = Math.round(level * bars.length);
          bars.forEach((bar, i) => {
            bar.classList.toggle('lit', i < litCount);
            bar.classList.toggle('hot', i < litCount && i >= bars.length - 2);
          });
        }
        noiseRafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // Web Audio unavailable — the noise meter is a nice-to-have, not essential.
    }
  }, []);

  const clearChunkTimer = useCallback(() => {
    if (chunkTimerRef.current) clearInterval(chunkTimerRef.current);
    chunkTimerRef.current = null;
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  }, []);

  const resetUi = useCallback(() => {
    setPhase('idle');
    setSecondsSinceUpdate(null);
    lastUpdateAtRef.current = null;
    reconnectAttemptRef.current = 0;
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    clearChunkTimer();
    clearReconnectTimer();
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    stopNoiseMeter();
  }, [clearChunkTimer, clearReconnectTimer, stopNoiseMeter]);

  // Wires up message/close/error handling for a socket and (re)starts the
  // chunk-send timer against it. Used for both the initial connection and
  // reconnection — the MediaRecorder/mic stream are never recreated, so no
  // audio is lost or re-captured across a reconnect.
  const connectSocket = useCallback(
    (isReconnect: boolean) => {
      const token = useAuthStore.getState().token;
      const wsProtocol = location.protocol === 'https:' ? 'wss' : 'ws';
      const lang = languageRef.current;
      const url = `${wsProtocol}://${location.host}/ws/stream?token=${encodeURIComponent(
        token || '',
      )}${lang ? `&language=${lang}` : ''}`;
      const socket = new WebSocket(url);
      socket.binaryType = 'arraybuffer';
      socketRef.current = socket;
      intentionalCloseRef.current = false;
      // Scoped to this connection attempt: distinguishes "never connected at
      // all" (likely an auth/config problem retries won't fix) from "was
      // open, then dropped" (worth retrying).
      let openedOk = false;

      socket.addEventListener('open', () => {
        openedOk = true;
        reconnectAttemptRef.current = 0;
        setPhase((p) => (p === 'reconnecting' ? 'recording' : p));
        if (isReconnect) setError('');

        clearChunkTimer();
        chunkTimerRef.current = setInterval(() => {
          const sock = socketRef.current;
          if (!chunksRef.current.length || !sock || sock.readyState !== WebSocket.OPEN) return;
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          blob.arrayBuffer().then((buf) => {
            // Guard against the timer firing again (or a reconnect replacing
            // the socket) while this async encode was in flight.
            if (socketRef.current === sock && sock.readyState === WebSocket.OPEN) sock.send(buf);
          });
        }, 2000);
      });

      socket.addEventListener('message', (event) => {
        const msg: StreamMessage = JSON.parse(event.data);
        const result = applyLiveMessage(msg, discardNextRef.current);
        if (result.state) {
          lastUpdateAtRef.current = Date.now();
          setConfirmedText(result.state.confirmedText);
          setTentativeText(result.state.tentativeText);
        }
        if (result.error) setError(result.error);
        if (msg.type === 'final') {
          discardNextRef.current = false;
          qc.invalidateQueries({ queryKey: ['transcripts'] });
        }
      });

      socket.addEventListener('error', () => {
        // The 'close' handler (always fired alongside/after 'error') decides
        // whether to reconnect or give up — avoid duplicating that logic here.
      });

      socket.addEventListener('close', () => {
        if (intentionalCloseRef.current) {
          resetUi();
          return;
        }
        // Unexpected drop. If the mic is still live, the socket did manage
        // to open at some point (a connection that fails before ever
        // opening is most likely an auth/config problem retries won't fix),
        // and we haven't exhausted retries, reconnect instead of silently
        // ending the session — audio capture keeps running uninterrupted
        // throughout.
        const stream = streamRef.current;
        const canRetry =
          openedOk && stream && stream.active && reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS;
        if (!canRetry) {
          setError(
            reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS
              ? 'Lost connection to the server after several attempts. Your audio so far is preserved — stop and start a new recording when ready.'
              : !openedOk
                ? 'Could not connect to the transcription server. Check your connection and try again.'
                : 'Connection to the server was lost. Your recording so far will still be saved.',
          );
          resetUi();
          return;
        }
        reconnectAttemptRef.current += 1;
        setPhase('reconnecting');
        clearChunkTimer();
        const delay = nextReconnectDelayMs(reconnectAttemptRef.current);
        // Recurse via the ref (not the `connectSocket` binding itself) so
        // this doesn't read the useCallback result while it's still being
        // assigned.
        reconnectTimerRef.current = setTimeout(() => connectSocketRef.current(true), delay);
      });
    },
    [clearChunkTimer, resetUi, qc],
  );
  // Keep the ref in sync outside of render (effects run after commit), so
  // the recursive reconnect call above always reaches the latest version.
  useEffect(() => {
    connectSocketRef.current = connectSocket;
  }, [connectSocket]);

  // Guards against double/overlapping finalization (repeated Stop clicks,
  // the mic-disconnect handler and a manual Stop firing together, Stop
  // during 'starting' before there's anything to stop).
  const stop = useCallback(() => {
    const currentPhase = phaseRef.current;
    if (currentPhase === 'idle' || currentPhase === 'starting' || currentPhase === 'finalizing') return;

    intentionalCloseRef.current = true;
    clearReconnectTimer();
    clearChunkTimer();
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);

    const socket = socketRef.current;
    const recorder = mediaRecorderRef.current;
    const canFinalize = !!socket && socket.readyState === WebSocket.OPEN;

    if (!canFinalize) {
      // No live connection to finalize through (e.g. the socket dropped and
      // we're mid-reconnect-backoff) — the last confirmed text we already
      // have from the server is all that's recoverable, so stop the mic and
      // settle back to idle immediately instead of waiting on a final
      // result that will never arrive.
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      resetUi();
      return;
    }

    setPhase('finalizing');
    if (recorder && recorder.state !== 'inactive') {
      // recorder.onstop (set up in start()) flushes the last buffered audio
      // chunk to the server before sending the "stop" action, so audio
      // captured between the last 2s chunk-timer tick and this click isn't
      // silently dropped.
      recorder.stop();
    } else {
      socket.send(JSON.stringify({ action: 'stop' }));
    }
  }, [clearChunkTimer, clearReconnectTimer, resetUi]);

  const start = useCallback(async () => {
    // `phase` alone can't catch two calls fired in the same tick (double
    // click, or the keyboard shortcut repeated while still awaiting the mic
    // permission prompt) — both would still see the stale 'idle' value from
    // the last render. startingRef is set synchronously below and closes
    // that gap.
    if (phase !== 'idle' || startingRef.current) return;
    startingRef.current = true;
    setPhase('starting');

    try {
      setError('');
      setConfirmedText('');
      setTentativeText('');
      discardNextRef.current = false;
      reconnectAttemptRef.current = 0;

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        setError(micErrorMessage(err));
        setPhase('idle');
        return;
      }
      streamRef.current = stream;
      chunksRef.current = [];

      // If a mic track ends unexpectedly (device unplugged), stop cleanly
      // instead of silently recording nothing.
      stream.getAudioTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          if (mediaRecorderRef.current?.state !== 'inactive') {
            setError('Microphone disconnected — recording stopped. Your recording so far will still be saved.');
            stop();
          }
        });
      });

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      } catch {
        setError("This browser can't record audio in a supported format.");
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setPhase('idle');
        return;
      }
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onerror = () => {
        setError('Recording error occurred — stopping. You can try starting again.');
        stop();
      };
      // Fires once, after the final dataavailable event, when stop() calls
      // recorder.stop() — flushes whatever audio accumulated since the last
      // chunk-timer tick before telling the server to finalize, so the tail
      // of the recording (up to ~2s) isn't silently dropped on Stop.
      recorder.onstop = () => {
        const sock = socketRef.current;
        if (!sock || sock.readyState !== WebSocket.OPEN) return;
        if (chunksRef.current.length) {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          blob.arrayBuffer().then((buf) => {
            if (socketRef.current === sock && sock.readyState === WebSocket.OPEN) sock.send(buf);
            if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ action: 'stop' }));
          });
        } else {
          sock.send(JSON.stringify({ action: 'stop' }));
        }
      };
      recorder.start(500);

      setPhase('recording');
      startedAtRef.current = Date.now();
      durationTimerRef.current = setInterval(() => {
        setDuration((Date.now() - startedAtRef.current) / 1000);
        setSecondsSinceUpdate(
          lastUpdateAtRef.current === null ? null : (Date.now() - lastUpdateAtRef.current) / 1000,
        );
      }, 500);

      startNoiseMeter(stream);
      connectSocket(false);
    } finally {
      startingRef.current = false;
    }
  }, [connectSocket, phase, startNoiseMeter, stop]);

  const pause = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.pause();
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
      setPhase('paused');
    }
  }, []);

  const resume = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'paused') {
      recorder.resume();
      const pausedAt = Date.now() - startedAtRef.current;
      startedAtRef.current = Date.now() - pausedAt;
      durationTimerRef.current = setInterval(() => {
        setDuration((Date.now() - startedAtRef.current) / 1000);
        setSecondsSinceUpdate(
          lastUpdateAtRef.current === null ? null : (Date.now() - lastUpdateAtRef.current) / 1000,
        );
      }, 500);
      setPhase('recording');
    }
  }, []);

  // Clearing while a session is still live would otherwise be instantly
  // undone by the next in-flight "partial" message (the server still has
  // the full confirmed text) — so an active session is stopped first, and
  // the next final/partial message for it is discarded rather than applied.
  const clear = useCallback(() => {
    setError('');
    if (phase !== 'idle') {
      discardNextRef.current = true;
      stop();
    }
    setConfirmedText('');
    setTentativeText('');
  }, [phase, stop]);

  useEffect(
    () => () => {
      intentionalCloseRef.current = true;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (socketRef.current) socketRef.current.close();
      clearChunkTimer();
      clearReconnectTimer();
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      stopNoiseMeter();
    },
    [clearChunkTimer, clearReconnectTimer, stopNoiseMeter],
  );

  return {
    phase,
    confirmedText,
    tentativeText,
    error,
    duration,
    secondsSinceUpdate,
    noiseMeterElRef,
    start,
    pause,
    resume,
    stop,
    clear,
  };
}
