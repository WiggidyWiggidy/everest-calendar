'use client';

// ============================================
// Focus Notification System
// Alerts for feature work limits and missing
// critical path targets — uses browser Notification
// API with graceful degradation to console.warn
// ============================================
import { FocusSession, FocusTask } from '@/types/focus';

// Request notification permission on first use
async function requestPermission(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

function notify(title: string, body: string) {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    console.warn(`[Focus] ${title}: ${body}`);
    return;
  }
  new Notification(title, { body, icon: '/favicon.ico' });
}

// Throttle: store last notification time per key to avoid spam
const lastNotified: Record<string, number> = {};
const THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

function throttledNotify(key: string, title: string, body: string) {
  const now = Date.now();
  if (lastNotified[key] && now - lastNotified[key] < THROTTLE_MS) return;
  lastNotified[key] = now;
  notify(title, body);
}

// Called after each task mutation to check limits
export async function checkFocusLimits(
  tasks: FocusTask[],
  session: FocusSession | null
) {
  if (!session) return;
  await requestPermission();

  const featureTasks   = tasks.filter((t) => !t.is_critical_path);
  const criticalTasks  = tasks.filter((t) => t.is_critical_path);
  const criticalPending = criticalTasks.filter((t) => t.status !== 'done');
  const featureMinutes = featureTasks.reduce((a, t) => a + (t.estimated_minutes ?? 0), 0);
  const featureLimitMins = session.feature_limit_hours * 60;

  // Alert: approaching feature work limit (within 30 minutes)
  if (
    featureLimitMins > 0 &&
    featureMinutes > 0 &&
    featureMinutes >= featureLimitMins * 0.8
  ) {
    throttledNotify(
      'feature-limit',
      'Feature Work Limit Approaching',
      `You have ${featureMinutes}m of feature work scheduled — limit is ${featureLimitMins}m.`
    );
  }

  // Alert: over feature limit
  if (featureMinutes > featureLimitMins && featureLimitMins > 0) {
    throttledNotify(
      'feature-over',
      'Feature Work Limit Exceeded',
      `${featureMinutes}m planned vs ${featureLimitMins}m limit. Consider cutting scope.`
    );
  }

  // Alert: critical path tasks not started past midday
  const hour = new Date().getHours();
  if (hour >= 12 && criticalPending.length > 0) {
    throttledNotify(
      'critical-incomplete',
      'Critical Path At Risk',
      `${criticalPending.length} critical task${criticalPending.length > 1 ? 's' : ''} still pending — it's past midday.`
    );
  }
}

// Notify when critical path timer expires
export async function notifyCriticalPathExpired(criticalHours: number) {
  await requestPermission();
  throttledNotify(
    'timer-expired',
    'Critical Path Block Complete',
    `Your ${criticalHours}h critical path block has ended. Feature work is now locked.`
  );
}

// Notify when approaching end of day with outstanding critical tasks
export async function notifyEndOfDayRisk(incompleteCritical: number) {
  if (incompleteCritical === 0) return;
  await requestPermission();
  throttledNotify(
    'eod-risk',
    'End-of-Day Risk',
    `${incompleteCritical} critical task${incompleteCritical > 1 ? 's' : ''} incomplete. Reschedule or push hard now.`
  );
}
