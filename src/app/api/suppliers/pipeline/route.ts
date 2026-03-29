// GET /api/suppliers/pipeline — full supplier pipeline grouped by component
import { NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_supplier_pipeline`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  const data = await res.json();

  // Also get components with no active conversations
  const compRes = await fetch(
    `${SUPABASE_URL}/rest/v1/components?select=id,name,category&name=not.like.*ELIMINATED*&order=category,name`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    }
  );
  const components = await compRes.json();

  return NextResponse.json({ pipeline: data ?? [], components: components ?? [] });
}
