// ============================================
// Focus Notification System
// Uses browser Notification API + sonner toasts
// ============================================
import { toast } from 'sonner';

// ─── Browser permission ───────────────────────────────────────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

function sendBrowserNotification(title: string, body: string) {
  if (typeof window === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  new Notification(title, { body, icon: '/favicon.ico' });
}

// ─── Focus alerts ─────────────────────────────────────────────────────────────

/** Called when critical path timer runs out */
export function notifyCriticalPathExpired() {
  const msg = 'Critical path time is up — switch to review mode.';
  toast.warning('Critical path time expired', { description: msg, duration: 8000 });
  sendBrowserNotification('⏰ Critical Path Expired', msg);
}

/** Called when the user is approaching their feature work limit (e.g. 15 min left) */
export function notifyApproachingFeatureLimit(minutesLeft: number) {
  const msg = `Only ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''} of feature work remaining today.`;
  toast.warning('Approaching feature limit', { description: msg, duration: 6000 });
  sendBrowserNotification('⚠️ Feature Work Limit', msg);
}

/** Called when the feature work limit is fully reached */
export function notifyFeatureLimitReached() {
  const msg = 'Feature work budget exhausted — protect the critical path.';
  toast.error('Feature limit reached', { description: msg, duration: 10000 });
  sendBrowserNotification('🚫 Feature Limit Reached', msg);
}

/** Called when a critical path task is overdue (not started by mid-day) */
export function notifyCriticalPathAtRisk(taskTitle: string) {
  const msg = `"${taskTitle}" hasn't been started yet — it's blocking your critical path.`;
  toast.error('Critical path at risk', { description: msg, duration: 8000 });
  sendBrowserNotification('🚨 Critical Path At Risk', msg);
}

/** General focus reminder when no tasks have been completed after a period */
export function notifyFocusReminder() {
  const msg = 'No tasks completed yet today. Pick your #1 critical path task and start.';
  toast.info('Focus reminder', { description: msg, duration: 6000 });
  sendBrowserNotification('🎯 Focus Reminder', msg);
}

// ─── Feature limit calculation ────────────────────────────────────────────────

/**
 * Given how many feature-work minutes have elapsed and the daily limit,
 * returns the warning state: null | 'approaching' | 'exceeded'
 */
export function getFeatureLimitState(
  elapsedMinutes: number,
  limitHours: number,
): 'ok' | 'approaching' | 'exceeded' {
  const limitMinutes = limitHours * 60;
  if (elapsedMinutes >= limitMinutes) return 'exceeded';
  if (elapsedMinutes >= limitMinutes - 15) return 'approaching';
  return 'ok';
}
