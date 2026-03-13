// ============================================
// Daily Focus Control Dashboard Types
// ============================================

export type FocusTaskStatus = 'pending' | 'in-progress' | 'done' | 'skipped';

export interface FocusSession {
  id: string;
  user_id: string;
  date: string;                  // 'YYYY-MM-DD'
  critical_path_hours: number;   // hours reserved for critical path work
  feature_limit_hours: number;   // max hours allowed on feature work
  created_at: string;
}

export interface FocusTask {
  id: string;
  user_id: string;
  session_id: string;
  title: string;
  description: string | null;
  priority_order: number;        // 0-indexed drag order
  is_critical_path: boolean;
  status: FocusTaskStatus;
  estimated_minutes: number | null;
  created_at: string;
}

export interface TaskPriority {
  task_id: string;
  priority_order: number;
}

export interface WeeklyFocusStats {
  date: string;
  critical_path_hours: number;
  feature_limit_hours: number;
  critical_done: number;
  critical_total: number;
  feature_done: number;
  feature_total: number;
}
