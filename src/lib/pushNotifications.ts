// ============================================
// Push Notification Sender
// Server-side only. Called from webhook routes.
// ============================================
import webpush from 'web-push';
import { createClient as createAnonClient } from '@supabase/supabase-js';

interface PushPayload {
  title: string;
  body:  string;
  url?:  string;
  tag?:  string;
}

export async function sendPushToAll(payload: PushPayload): Promise<void> {
  const publicKey  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject    = process.env.VAPID_SUBJECT ?? 'mailto:admin@everestlabs.co';

  if (!publicKey || !privateKey) {
    console.warn('pushNotifications: VAPID keys not configured — skipping push');
    return;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);

  // Fetch subscriptions via SECURITY DEFINER RPC (anon-accessible)
  const supabase = createAnonClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data: subs } = await supabase.rpc('get_push_subscriptions');
  if (!Array.isArray(subs) || subs.length === 0) return;

  await Promise.allSettled(
    subs.map((sub: { endpoint: string; p256dh: string; auth: string }) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys:     { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload)
      )
    )
  );
}
