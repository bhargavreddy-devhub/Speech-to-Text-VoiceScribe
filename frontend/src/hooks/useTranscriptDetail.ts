import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../lib/apiClient';
import type { TranscriptDetail } from '../types';

export function useTranscriptDetail(id: string | null) {
  return useQuery({
    queryKey: ['transcript', id],
    queryFn: () => apiJson<TranscriptDetail>(`/transcripts/${id}`),
    enabled: !!id,
  });
}
