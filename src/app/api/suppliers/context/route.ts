// ============================================
// GET /api/suppliers/context?contact=Steven+Huang
// Returns negotiation context for a supplier
// ============================================
import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  const contact = request.nextUrl.searchParams.get('contact');
  if (!contact) {
    return NextResponse.json({ error: 'contact parameter required' }, { status: 400 });
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_negotiation_context`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_contact_name: contact }),
  });

  const data = await res.json();
  return NextResponse.json({ context: data ?? [] });
}
