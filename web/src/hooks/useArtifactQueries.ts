/**
 * Artifact, PAT, and Calendar query/mutation hooks (C6 + F1).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { getAccessToken } from '@/api/client';
import type { Artifact } from '@/api/types';
import type { components } from '@/api/schema.d.ts';

// ─── Extra types ──────────────────────────────────────────────────────────────

export type SampleArtifact = components['schemas']['SampleArtifact'];
export type ExperimentArtifact = components['schemas']['ExperimentArtifact'];
export type PATInfo = components['schemas']['PATInfo'];
export type CreateArtifactOutput = components['schemas']['CreateArtifactOutputBody_9a5847a4'];

export type CreateTokenOutput = {
  id: string;
  token: string;
  name: string;
  scopes: string[] | null;
  expires_at?: string;
};

export interface CalSubscription {
  token: string;
  scope: string;
  project_ids: string[];
  ics_url: string;
}

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const artifactKeys = {
  projectArtifacts: (id: string) => ['projects', id, 'artifacts'] as const,
  sampleArtifacts: (id: string) => ['samples', id, 'artifacts'] as const,
  experimentArtifacts: (id: string) => ['experiments', id, 'artifacts'] as const,
  artifact: (id: string) => ['artifacts', id] as const,
  tokens: ['tokens'] as const,
  calSubscription: ['cal', 'me', 'subscription'] as const,
};

// ─── Artifact queries ─────────────────────────────────────────────────────────

export function useSampleArtifacts(sampleId: string | undefined) {
  return useQuery({
    queryKey: sampleId ? artifactKeys.sampleArtifacts(sampleId) : ['samples', 'none', 'artifacts'],
    queryFn: () =>
      api.get<SampleArtifact[] | null>(`/v1/samples/${sampleId}/artifacts`).then(r => r ?? []),
    enabled: !!sampleId,
  });
}

export function useExperimentArtifacts(experimentId: string | undefined) {
  return useQuery({
    queryKey: experimentId ? artifactKeys.experimentArtifacts(experimentId) : ['experiments', 'none', 'artifacts'],
    queryFn: () =>
      api.get<ExperimentArtifact[] | null>(`/v1/experiments/${experimentId}/artifacts`).then(r => r ?? []),
    enabled: !!experimentId,
  });
}

export function useArtifact(artifactId: string | undefined) {
  return useQuery({
    queryKey: artifactId ? artifactKeys.artifact(artifactId) : ['artifacts', 'none'],
    queryFn: () => api.get<Artifact>(`/v1/artifacts/${artifactId}`),
    enabled: !!artifactId,
  });
}

// ─── Artifact mutations ───────────────────────────────────────────────────────

export function useCreateArtifact(projectId: string) {
  return useMutation({
    mutationFn: (body: {
      filename: string;
      content_type: string;
      size_bytes: number;
      type?: 'pdf' | 'ipynb' | 'image' | 'other';
    }) => api.post<CreateArtifactOutput>(`/v1/projects/${projectId}/artifacts`, body),
  });
}

export function useCompleteArtifact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (artifactId: string) =>
      api.post<Artifact>(`/v1/artifacts/${artifactId}/complete`, {}),
    onSuccess: (artifact) => {
      void qc.invalidateQueries({ queryKey: ['projects', artifact.project_id, 'artifacts'] });
      void qc.invalidateQueries({ queryKey: artifactKeys.artifact(artifact.id) });
    },
  });
}

export function useDeleteArtifact(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (artifactId: string) =>
      api.delete<undefined>(`/v1/artifacts/${artifactId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'artifacts'] });
    },
  });
}

export function useAttachArtifactToSample(sampleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      artifact_id: string;
      role?: 'specimen_image' | 'datasheet' | 'reference' | 'other';
    }) => api.post<SampleArtifact>(`/v1/samples/${sampleId}/artifacts`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: artifactKeys.sampleArtifacts(sampleId) });
    },
  });
}

export function useAttachArtifactToExperiment(experimentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      artifact_id: string;
      role?: 'raw_data' | 'analysis' | 'report' | 'calibration' | 'photo' | 'other';
    }) => api.post<ExperimentArtifact>(`/v1/experiments/${experimentId}/artifacts`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: artifactKeys.experimentArtifacts(experimentId) });
    },
  });
}

// ─── Upload helper (presigned PUT, bypasses Vite proxy) ──────────────────────

export async function uploadToPresignedUrl(
  uploadUrl: string,
  file: File,
  headers: Record<string, string>,
  onProgress?: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);

    // Set headers from presigned URL response
    Object.entries(headers).forEach(([k, v]) => {
      // Skip Content-Type override if MinIO expects it in the URL sig
      xhr.setRequestHeader(k, v);
    });

    // If no Content-Type header provided, set from file
    if (!headers['Content-Type'] && !headers['content-type']) {
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Upload network error'));
    xhr.send(file);
  });
}

// ─── Token (PAT) queries ──────────────────────────────────────────────────────

export function useTokens() {
  return useQuery({
    queryKey: artifactKeys.tokens,
    queryFn: () => api.get<PATInfo[] | null>('/v1/tokens').then(r => r ?? []),
  });
}

export function useCreateToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; scopes: string[]; expires_at?: string }) =>
      api.post<CreateTokenOutput>('/v1/tokens', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: artifactKeys.tokens }),
  });
}

export function useRevokeToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tokenId: string) => api.delete<{ ok: boolean }>(`/v1/tokens/${tokenId}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: artifactKeys.tokens }),
  });
}

// ─── Calendar subscription queries ───────────────────────────────────────────

export function useCalSubscription() {
  return useQuery({
    queryKey: artifactKeys.calSubscription,
    queryFn: () => api.get<CalSubscription>('/v1/cal/me/subscription'),
  });
}

export function useRotateCalSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<CalSubscription>('/v1/cal/me/subscription/rotate'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: artifactKeys.calSubscription }),
  });
}

export function usePatchCalSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { scope?: string; project_ids?: string[] }) =>
      api.patch<CalSubscription>('/v1/cal/me/subscription', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: artifactKeys.calSubscription }),
  });
}

// Re-export getAccessToken for use in components
export { getAccessToken };
