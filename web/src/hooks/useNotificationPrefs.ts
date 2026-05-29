/**
 * Notification preference hooks — GET/PATCH /v1/me/notification-preferences
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';

export interface NotificationPreference {
  category: string;
  label: string;
  description: string;
  enabled: boolean;
  mandatory: boolean;
}

export const notificationPrefsKeys = {
  all: ['me', 'notification-preferences'] as const,
};

export function useNotificationPreferences() {
  return useQuery({
    queryKey: notificationPrefsKeys.all,
    queryFn: () =>
      api.get<NotificationPreference[]>('/v1/me/notification-preferences').then(
        r => r ?? [],
      ),
  });
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (preferences: Record<string, boolean>) =>
      api.patch<{ ok: boolean }>('/v1/me/notification-preferences', { preferences }),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationPrefsKeys.all }),
  });
}
