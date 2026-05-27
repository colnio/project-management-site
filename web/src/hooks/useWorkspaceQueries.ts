/**
 * Workspace-level hooks: Inbox, Meetings, Audit log.
 * Members: reuse useWorkspaceMembers from useQueries.ts.
 * AI Usage: reuse useAIUsage from useAIQueries.ts.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InboxItem {
  id: string;
  kind: 'pi_flag' | 'ai_proposal' | 'action_item' | 'comment' | 'system' | 'mention' | 'approval';
  title: string;
  body: string;
  link: string;
  created_at: string;
}

export interface Meeting {
  id: string;
  workspace_id: string;
  project_id?: string;
  title: string;
  kind: string;
  chair?: string;
  start_at: string;
  end_at?: string;
  location: string;
  agenda: string;
  notes: string;
  attendees: unknown[];
  decisions: unknown[];
  action_items: ActionItem[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ActionItem {
  text?: string;
  owner?: string;
  done?: boolean;
  [key: string]: unknown;
}

export interface AuditEntry {
  actor: string;
  via_token_id?: string;
  via_ai_conversation_id?: string;
  action: string;
  resource_type: string;
  resource_id: string;
  request_payload_digest?: string;
  response_status: number;
  created_at: string;
}

export interface MemberView {
  id: string;
  workspace_id: string;
  user_id: string;
  role: string;
  email: string;
  display_name: string;
  user_created_at: string;
  created_at: string;
}

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const wsKeys = {
  inbox: (wsId: string) => ['workspaces', wsId, 'inbox'] as const,
  meetings: (wsId: string) => ['workspaces', wsId, 'meetings'] as const,
  meeting: (id: string) => ['meetings', id] as const,
  audit: ['audit'] as const,
};

// ─── Inbox ────────────────────────────────────────────────────────────────────

export function useInbox(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceId ? wsKeys.inbox(workspaceId) : ['workspaces', 'none', 'inbox'],
    queryFn: () =>
      api.get<InboxItem[] | null>(`/v1/workspaces/${workspaceId}/inbox`).then(r => r ?? []),
    enabled: !!workspaceId,
  });
}

// ─── Meetings ─────────────────────────────────────────────────────────────────

export function useMeetings(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceId ? wsKeys.meetings(workspaceId) : ['workspaces', 'none', 'meetings'],
    queryFn: () =>
      api.get<Meeting[] | null>(`/v1/workspaces/${workspaceId}/meetings`).then(r => r ?? []),
    enabled: !!workspaceId,
  });
}

export function useMeeting(id: string | undefined) {
  return useQuery({
    queryKey: id ? wsKeys.meeting(id) : ['meetings', 'none'],
    queryFn: () => api.get<Meeting>(`/v1/meetings/${id}`),
    enabled: !!id,
  });
}

export function useCreateMeeting(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      title: string;
      kind?: string;
      start_at: string;
      end_at?: string;
      location?: string;
      agenda?: string;
      notes?: string;
    }) => api.post<Meeting>(`/v1/workspaces/${workspaceId}/meetings`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: wsKeys.meetings(workspaceId) }),
  });
}

export function useUpdateMeeting(meetingId: string, workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      title?: string;
      kind?: string;
      notes?: string;
      agenda?: string;
      location?: string;
      start_at?: string;
      end_at?: string;
    }) => api.patch<Meeting>(`/v1/meetings/${meetingId}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: wsKeys.meeting(meetingId) });
      void qc.invalidateQueries({ queryKey: wsKeys.meetings(workspaceId) });
    },
  });
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export function useAuditLog(_wsId?: string) {
  return useQuery({
    queryKey: wsKeys.audit,
    queryFn: () =>
      api
        .get<{ items: AuditEntry[]; next_cursor?: string } | null>('/v1/audit?limit=50')
        .then(r => r?.items ?? []),
  });
}
