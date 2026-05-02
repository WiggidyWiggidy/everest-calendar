// load-canonical.mjs
// Pulls product_context.kryo_v4_canonical from Supabase. No hardcoded constants.
// When Tom updates the product spec in Supabase, the next swarm run picks it up.

const SUPABASE_URL = process.env.EVEREST_SUPABASE_URL;
const SUPABASE_KEY = process.env.EVEREST_SUPABASE_SERVICE_KEY;

export async function loadKryoCanonical() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('EVEREST_SUPABASE_URL + EVEREST_SUPABASE_SERVICE_KEY required to load canonical');
  }
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/product_context?context_key=eq.kryo_v4_canonical&select=content,context_data,updated_at`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  if (!res.ok) throw new Error(`load-canonical HTTP ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('product_context.kryo_v4_canonical row missing');
  }
  const row = rows[0];
  // Two storage shapes possible: structured `context_data` JSONB OR free-text `content`. Use whichever is populated.
  return {
    text: row.content || '',
    data: row.context_data || null,
    updated_at: row.updated_at,
  };
}

// Convenience: returns a prompt-ready text block.
export async function loadCanonicalAsPrompt() {
  const c = await loadKryoCanonical();
  if (c.text) return c.text;
  if (c.data) return JSON.stringify(c.data, null, 2);
  throw new Error('canonical row exists but is empty');
}

// CLI: node load-canonical.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  const c = await loadKryoCanonical();
  process.stdout.write(JSON.stringify(c, null, 2) + '\n');
}
