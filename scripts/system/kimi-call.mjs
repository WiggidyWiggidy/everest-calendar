// kimi-call.mjs
// Minimal Kimi API wrapper. Replaces Claude Code subagent calls inside the autonomous loop.
// Uses Anthropic-compatible endpoint (Moonshot AI's drop-in) so prompt shape stays identical.
//
// Cost: $0.60/M input tokens, $2.50/M output (Kimi K2.6). ~$0.001 per writer call.
// Free if Tom's $KIMI_OAUTH_TOKEN routes via the Anthropic-compat tier on his Kimi sub.
//
// Usage:
//   import { kimiCall } from './kimi-call.mjs';
//   const text = await kimiCall({
//     system: 'You are the KRYO Hero Writer. ...',
//     user: 'variant_angle=athlete_recovery',
//     model: 'kimi-k2-6',          // optional; default below
//     maxTokens: 1500,
//   });
//
// Env vars (in priority order):
//   KIMI_OAUTH_TOKEN  → free with Tom's Moonshot subscription
//   MOONSHOT_API_KEY  → paid pay-per-token (cheap)
//   ANTHROPIC_API_KEY → emergency fallback (BANNED in production per Tom's rule, kept for dev only)

const ENDPOINT_KIMI = 'https://api.moonshot.cn/anthropic/v1/messages';
const ENDPOINT_ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = process.env.KIMI_MODEL || 'kimi-k2-6';

function pickAuth() {
  if (process.env.KIMI_OAUTH_TOKEN) {
    return { url: ENDPOINT_KIMI, headers: { 'x-api-key': process.env.KIMI_OAUTH_TOKEN, 'anthropic-version': '2023-06-01' }, label: 'kimi-oauth' };
  }
  if (process.env.MOONSHOT_API_KEY) {
    return { url: ENDPOINT_KIMI, headers: { 'x-api-key': process.env.MOONSHOT_API_KEY, 'anthropic-version': '2023-06-01' }, label: 'moonshot-paid' };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return { url: ENDPOINT_ANTHROPIC, headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }, label: 'anthropic-fallback' };
  }
  throw new Error('No LLM credentials. Set KIMI_OAUTH_TOKEN (free with Tom sub) or MOONSHOT_API_KEY.');
}

export async function kimiCall({ system, user, model = DEFAULT_MODEL, maxTokens = 2000, temperature = 0.7, maxRetries = 3 }) {
  const auth = pickAuth();
  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    system: system ?? undefined,
    messages: [{ role: 'user', content: user }],
  };

  // Retry on rate limits (429), 5xx, and transient network errors. Exponential backoff: 2s, 8s, 32s.
  let lastErr;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      const delayMs = 2000 * Math.pow(4, attempt - 1); // 2s, 8s, 32s
      process.stderr.write(`[kimi-call] retry ${attempt}/${maxRetries} after ${delayMs}ms (last: ${String(lastErr).slice(0, 120)})\n`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
    try {
      const res = await fetch(auth.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth.headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000), // 2 min hard cap per call
      });
      if (res.status === 429 || res.status >= 500) {
        const text = await res.text();
        lastErr = `HTTP ${res.status}: ${text.slice(0, 200)}`;
        continue; // retryable
      }
      if (!res.ok) {
        const text = await res.text();
        // Non-retryable (400, 401, 403, etc.) — fail fast
        throw new Error(`kimi-call ${auth.label} HTTP ${res.status} (non-retryable): ${text.slice(0, 400)}`);
      }
      const payload = await res.json();
      const blocks = payload.content || [];
      const text = blocks.map((b) => b.text || '').join('').trim();
      return { text, usage: payload.usage, auth_used: auth.label, retries: attempt };
    } catch (e) {
      // AbortError, network error, etc. — retryable
      lastErr = e.message || String(e);
      // If it's a non-retryable HTTP error from above, rethrow
      if (e.message?.includes('non-retryable')) throw e;
    }
  }
  throw new Error(`kimi-call ${auth.label} exhausted ${maxRetries} retries: ${lastErr}`);
}

// CLI usage: node kimi-call.mjs '<system>' '<user>'
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , systemArg, userArg] = process.argv;
  if (!userArg) {
    console.error('Usage: kimi-call.mjs "<system prompt>" "<user prompt>"');
    process.exit(2);
  }
  const out = await kimiCall({ system: systemArg, user: userArg });
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}
