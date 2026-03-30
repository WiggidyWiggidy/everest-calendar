import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300; // 5 min max for backfill

async function authenticateSync(request: NextRequest) {
  const syncSecret = request.headers.get('x-sync-secret');
  if (syncSecret && syncSecret === process.env.MARKETING_SYNC_SECRET) {
    return { authenticated: true };
  }
  return { authenticated: false };
}

function getDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateSync(request);
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { start_date, end_date, sources } = await request.json() as {
      start_date: string;
      end_date: string;
      sources?: string[];
    };

    if (!start_date || !end_date) {
      return NextResponse.json({ error: 'start_date and end_date required (YYYY-MM-DD)' }, { status: 400 });
    }

    const dates = getDateRange(start_date, end_date);
    if (dates.length > 90) {
      return NextResponse.json({ error: 'Max 90 days per backfill request' }, { status: 400 });
    }

    const activeSources = sources || ['meta', 'shopify'];
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://everest-calendar.vercel.app';
    const syncSecret = process.env.MARKETING_SYNC_SECRET || '';

    const results: Record<string, { ok: number; errors: string[] }> = {};
    for (const source of activeSources) {
      results[source] = { ok: 0, errors: [] };
    }

    for (const date of dates) {
      for (const source of activeSources) {
        try {
          const res = await fetch(`${baseUrl}/api/marketing/sync/${source}`, {
            method: 'POST',
            headers: {
              'x-sync-secret': syncSecret,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ date }),
          });

          if (res.ok) {
            results[source].ok++;
          } else {
            const data = await res.json().catch(() => ({ error: `${res.status}` }));
            results[source].errors.push(`${date}: ${data.error || res.status}`);
          }
        } catch (e) {
          results[source].errors.push(`${date}: ${(e as Error).message}`);
        }

        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 300));
      }
    }

    const summary = Object.entries(results).map(([source, r]) =>
      `${source}: ${r.ok}/${dates.length} ok` + (r.errors.length ? `, ${r.errors.length} errors` : '')
    ).join(' | ');

    return NextResponse.json({
      backfilled: true,
      date_range: { start_date, end_date, total_days: dates.length },
      sources: results,
      summary,
    });
  } catch (err) {
    console.error('backfill error:', err);
    return NextResponse.json({ error: 'Backfill failed: ' + (err as Error).message }, { status: 500 });
  }
}
