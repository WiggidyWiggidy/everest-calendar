// ============================================
// Supabase Service Role Client
// Bypasses RLS — only used in trusted API routes
// that authenticate via X-API-Key header instead
// of user sessions.
// ============================================
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }

  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}
