// ============================================
// Focus Dashboard Type Definitions
// ============================================

export interface FocusSession {
  id: string;
  user_id: string;
  date: string; // 'YYYY-MM-DD'
  critical_path_hours: number;
  feature_limit_hours: number;
  created_at: string;
}

export interface FocusTask {
  id: string;
  user_id: string;
  session_id: string;
  title: string;
  description: string | null;
  priority_order: number;
  is_critical_path: boolean;
  status: 'pending' | 'in-progress' | 'done';
  estimated_minutes: number;
}

export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

export interface WeeklyFocusStats {
  date: string;
  critical_path_hours: number;
  feature_limit_hours: number;
  tasks_total: number;
  tasks_done: number;
  critical_tasks_done: number;
  critical_tasks_total: number;
}
