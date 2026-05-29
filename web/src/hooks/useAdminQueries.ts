/**
 * Admin user management hooks.
 * Endpoints: GET/PATCH/DELETE /v1/admin/users
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { AdminUserView } from '@/api/types';

// ─── Query keys ──────────────────────────────────────────────────────────────

export const adminKeys = {
  users: ['admin', 'users'] as const,
};

// ─── Fetch all users ─────────────────────────────────────────────────────────

interface AdminUsersResponse {
  items?: AdminUserView[];
}

export function useAdminUsers() {
  return useQuery({
    queryKey: adminKeys.users,
    queryFn: async (): Promise<AdminUserView[]> => {
      const res = await api.get<AdminUsersResponse | AdminUserView[]>('/v1/admin/users');
      // Handle both { items: [...] } and bare array responses
      if (Array.isArray(res)) return res;
      return (res as AdminUsersResponse).items ?? [];
    },
  });
}

// ─── Update user (status / global_role) ─────────────────────────────────────

interface UpdateAdminUserPayload {
  id: string;
  status?: 'pending' | 'approved' | 'suspended';
  global_role?: 'admin' | 'pi' | 'member';
}

export function useUpdateAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateAdminUserPayload) =>
      api.patch<{ ok: boolean }>(`/v1/admin/users/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.users }),
  });
}

// ─── Delete / reject user ────────────────────────────────────────────────────

export function useDeleteAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ ok: boolean }>(`/v1/admin/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.users }),
  });
}

// ─── Email broadcast ───────────────────────────────────────────────────────────

export interface CreateBroadcastPayload {
  subject: string;
  body: string;
  audience: 'all' | 'workspace' | 'users';
  workspace_id?: string;
  user_ids?: string[];
}

export interface CreateBroadcastResult {
  id: string;
  recipients_queued: number;
}

export function useCreateBroadcast() {
  return useMutation({
    mutationFn: (body: CreateBroadcastPayload) =>
      api.post<CreateBroadcastResult>('/v1/admin/broadcasts', body),
  });
}
