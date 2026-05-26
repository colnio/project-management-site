/**
 * AI hooks: conversations (G6), workflows (G7), autonomy config (G8).
 * Streaming send is NOT a query — handled by the AIChatPanel component directly.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AIConversation {
  id: string;
  project_id: string;
  started_by: string;
  title: string;
  created_at: string;
}

export interface AIMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: AIToolCall[];
  tool_call_id?: string;
  name?: string;
  seq: number;
  created_at: string;
}

export interface AIToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status?: 'proposed' | 'approved' | 'rejected' | 'executed';
  result?: unknown;
}

export interface AutonomyConfig {
  scope: 'workspace' | 'project';
  scope_id: string;
  mode: 'read_only' | 'suggest_writes' | 'auto_routine' | 'full';
  allowed_tools: string[];
}

export interface AIWorkflow {
  key: string;
  title: string;
  description: string;
  scope: 'project' | 'sample' | 'experiment';
}

export interface AIRun {
  id: string;
  workflow_key: string;
  status: 'running' | 'completed' | 'failed';
  output?: WorkflowOutput;
  result_page_id?: string;
  step_results?: Record<string, unknown>;
}

export interface WorkflowOutput {
  overall_rating?: string;
  category_ratings?: Record<string, string>;
  mitigations?: string[];
  flagged_for_PI_review?: boolean;
  summary?: string;
  [key: string]: unknown;
}

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const aiKeys = {
  conversations: (projectId: string) => ['projects', projectId, 'ai', 'conversations'] as const,
  conversationMessages: (convId: string) => ['ai', 'conversations', convId, 'messages'] as const,
  workspaceAutonomy: (wsId: string) => ['workspaces', wsId, 'autonomy'] as const,
  projectAutonomy: (projectId: string) => ['projects', projectId, 'autonomy'] as const,
  workflows: ['ai', 'workflows'] as const,
  run: (runId: string) => ['ai', 'runs', runId] as const,
};

// ─── Conversations ────────────────────────────────────────────────────────────

export function useConversations(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? aiKeys.conversations(projectId) : ['ai', 'conversations', 'none'],
    queryFn: () =>
      api.get<AIConversation[] | null>(`/v1/projects/${projectId}/ai/conversations`).then(r => r ?? []),
    enabled: !!projectId,
  });
}

export function useCreateConversation(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (title: string) =>
      api.post<AIConversation>(`/v1/projects/${projectId}/ai/conversations`, { title }),
    onSuccess: () => qc.invalidateQueries({ queryKey: aiKeys.conversations(projectId) }),
  });
}

export function useConversationMessages(convId: string | undefined) {
  return useQuery({
    queryKey: convId ? aiKeys.conversationMessages(convId) : ['ai', 'conversations', 'none', 'messages'],
    queryFn: () =>
      api.get<AIMessage[] | null>(`/v1/ai/conversations/${convId}`).then(r => r ?? []),
    enabled: !!convId,
  });
}

// ─── Tool-call approvals ──────────────────────────────────────────────────────

export function useApproveToolCall(convId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tcId: string) =>
      api.post<{ ok: boolean }>(`/v1/ai/conversations/${convId}/tool-calls/${tcId}/approve`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: aiKeys.conversationMessages(convId) }),
  });
}

export function useRejectToolCall(convId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tcId: string) =>
      api.post<{ ok: boolean }>(`/v1/ai/conversations/${convId}/tool-calls/${tcId}/reject`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: aiKeys.conversationMessages(convId) }),
  });
}

// ─── Autonomy ─────────────────────────────────────────────────────────────────

export function useWorkspaceAutonomy(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceId ? aiKeys.workspaceAutonomy(workspaceId) : ['workspaces', 'none', 'autonomy'],
    queryFn: () => api.get<AutonomyConfig>(`/v1/workspaces/${workspaceId}/autonomy`),
    enabled: !!workspaceId,
  });
}

export function useUpdateWorkspaceAutonomy(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { mode: AutonomyConfig['mode']; allowed_tools: string[] }) =>
      api.patch<AutonomyConfig>(`/v1/workspaces/${workspaceId}/autonomy`, body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: aiKeys.workspaceAutonomy(workspaceId) }),
  });
}

export function useProjectAutonomy(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? aiKeys.projectAutonomy(projectId) : ['projects', 'none', 'autonomy'],
    queryFn: () => api.get<AutonomyConfig>(`/v1/projects/${projectId}/autonomy`),
    enabled: !!projectId,
  });
}

export function useUpdateProjectAutonomy(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { mode: AutonomyConfig['mode']; allowed_tools: string[] }) =>
      api.patch<AutonomyConfig>(`/v1/projects/${projectId}/autonomy`, body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: aiKeys.projectAutonomy(projectId) }),
  });
}

// ─── Workflows ────────────────────────────────────────────────────────────────

export function useWorkflows() {
  return useQuery({
    queryKey: aiKeys.workflows,
    queryFn: () => api.get<AIWorkflow[] | null>('/v1/ai/workflows').then(r => r ?? []),
  });
}

export function useRunWorkflow() {
  return useMutation({
    mutationFn: ({
      key,
      project_id,
      sample_id,
      experiment_id,
    }: {
      key: string;
      project_id: string;
      sample_id?: string;
      experiment_id?: string;
    }) =>
      api.post<AIRun>(`/v1/ai/workflows/${key}/run`, {
        project_id,
        sample_id,
        experiment_id,
      }),
  });
}

export function useAIRun(runId: string | undefined) {
  return useQuery({
    queryKey: runId ? aiKeys.run(runId) : ['ai', 'runs', 'none'],
    queryFn: () => api.get<AIRun>(`/v1/ai/runs/${runId}`),
    enabled: !!runId,
  });
}
