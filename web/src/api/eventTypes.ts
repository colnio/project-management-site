/**
 * Types for the calendar events API.
 * These are not yet in the generated schema, so defined manually.
 */

export type EventKind =
  | 'deadline'
  | 'milestone_end'
  | 'meeting'
  | 'reminder'
  | 'custom';

export interface CalendarEvent {
  id: string;
  project_id: string;
  iteration_id?: string;
  sample_id?: string;
  experiment_id?: string;
  kind: EventKind;
  title: string;
  description?: string;
  start_at: string; // RFC3339
  end_at?: string; // RFC3339
  all_day: boolean;
  recurrence_rule?: string;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface CreateEventBody {
  kind: EventKind;
  title: string;
  description?: string;
  start_at: string;
  end_at?: string;
  all_day?: boolean;
  recurrence_rule?: string;
}

export interface UpdateEventBody {
  kind?: EventKind;
  title?: string;
  description?: string;
  start_at?: string;
  end_at?: string;
  all_day?: boolean;
  recurrence_rule?: string;
}
