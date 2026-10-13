import { useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiJson, API_BASE } from '../lib/apiClient';
import { useAuthStore } from '../store/authStore';
import type { TranscriptDetail, TranscriptOut } from '../types';

const ALLOWED_EXT = ['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.flac', '.webm', '.mp4', '.mov'];
const MAX_UPLOAD_MB = 100;

export type UploadStatusKind = 'info' | 'success' | 'error';

export interface UploadStatus {
  kind: UploadStatusKind;
  message: string;
}

function uploadSingleWithProgress(
  file: File,
  translateTo: string,
  onProgress: (pct: number) => void,
): Promise<TranscriptOut> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    if (translateTo) form.append('translate_to', translateTo);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/transcribe`);
    const token = useAuthStore.getState().token;
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    onProgress(0);
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener('load', () => {
      onProgress(100);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        let detail = 'Upload failed';
        try {
          detail = JSON.parse(xhr.responseText).detail || detail;
        } catch {
          /* noop */
        }
        reject(new Error(detail));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('Upload failed — check your connection.')));
    xhr.send(form);
  });
}

export function useFileUpload() {
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<UploadStatus | null>(null);
  const [progress, setProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [uploadedId, setUploadedId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const attemptsRef = useRef(0);
  const qc = useQueryClient();

  const addFiles = useCallback((files: File[]) => {
    const accepted: File[] = [];
    for (const file of files) {
      const ext = `.${(file.name.split('.').pop() || '').toLowerCase()}`;
      if (!ALLOWED_EXT.includes(ext)) {
        alert(`"${file.name}" has an unsupported file type (${ext}).`);
        continue;
      }
      if (file.size / (1024 * 1024) > MAX_UPLOAD_MB) {
        alert(`"${file.name}" is larger than the ${MAX_UPLOAD_MB} MB limit.`);
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length) setPendingFiles((prev) => [...prev, ...accepted]);
  }, []);

  const removeFile = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const reset = useCallback(() => {
    setPendingFiles([]);
    setStatus(null);
    setProgress(0);
    setUploadedId(null);
    setPreviewUrl(null);
  }, []);

  const submit = useCallback(
    async (translateTo: string) => {
      if (!pendingFiles.length) {
        alert('Choose or drop at least one audio/video file first.');
        return;
      }
      setSubmitting(true);
      setUploadedId(null);
      attemptsRef.current = 0;
      setPreviewUrl(URL.createObjectURL(pendingFiles[0]));
      setStatus({
        kind: 'info',
        message: pendingFiles.length > 1 ? `Uploading ${pendingFiles.length} files…` : 'Uploading…',
      });

      try {
        if (pendingFiles.length === 1) {
          const transcript = await uploadSingleWithProgress(pendingFiles[0], translateTo, setProgress);
          setStatus({
            kind: 'info',
            message: 'Processing in background… this tab will update automatically.',
          });
          setUploadedId(transcript.id);
        } else {
          const form = new FormData();
          pendingFiles.forEach((f) => form.append('files', f));
          if (translateTo) form.append('translate_to', translateTo);
          const res = await apiFetch('/transcribe/batch', { method: 'POST', body: form });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}) as { detail?: string });
            throw new Error(err.detail || 'Batch upload failed');
          }
          const transcripts: TranscriptOut[] = await res.json();
          setStatus({
            kind: 'success',
            message: `${transcripts.length} jobs queued — track progress in History.`,
          });
          qc.invalidateQueries({ queryKey: ['transcripts'] });
        }
        setPendingFiles([]);
      } catch (err) {
        setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      } finally {
        setSubmitting(false);
      }
    },
    [pendingFiles, qc],
  );

  const pollQuery = useQuery({
    queryKey: ['transcript', uploadedId],
    queryFn: () => apiJson<TranscriptDetail>(`/transcripts/${uploadedId}`),
    enabled: !!uploadedId,
    refetchInterval: (query) => {
      const data = query.state.data as TranscriptDetail | undefined;
      if (!data) return 2000;
      if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
        if (data.status === 'completed') {
          setStatus({ kind: 'success', message: 'Done — see the result below.' });
        } else if (data.status === 'failed') {
          setStatus({ kind: 'error', message: `Failed: ${data.error_message || 'unknown error'}` });
        } else {
          setStatus({ kind: 'error', message: 'Cancelled.' });
        }
        return false;
      }
      attemptsRef.current += 1;
      if (attemptsRef.current > 150) {
        setStatus({ kind: 'error', message: 'Still processing — check History later.' });
        return false;
      }
      return 2000;
    },
  });

  return {
    pendingFiles,
    addFiles,
    removeFile,
    status,
    progress,
    submitting,
    previewUrl,
    result: pollQuery.data ?? null,
    submit,
    reset,
  };
}
