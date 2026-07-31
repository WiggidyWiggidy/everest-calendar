#!/usr/bin/env node
import { readdir, readFile, stat, mkdir, writeFile, appendFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const EIGHT_SLEEP_ROOT = '/Users/happy/Desktop/02_Marketing/Research/EIGHTSLEEP_REFERENCE';
const APPROVED_KRYO_ASSETS = '/Users/happy/Downloads/APPROVED';
const OUTPUT_ROOT = '/Users/happy/Desktop/02_Marketing/KRYO/creative_director';
const SYSTEM_DIR = path.join(REPO_ROOT, 'scripts/system/kryo-creative-director');
const MEMORY_ROOT = '/Users/happy/.claude/projects/-Users-happy-Desktop-Claude-Project/memory';

const IMPORTANT_MEMORY_FILES = [
  'project_kryo_eight_sleep_playbook.md',
  'feedback_clean_real_urls_and_objection_hierarchy.md',
  'project_kryo_checkout_diagnosis_2026-05-18.md',
  'project_kryo_winning_ads_analysis.md',
  'feedback_test_velocity_north_star.md',
  'project_kryo2_updated_specs_2026_05_20.md',
  'project_kryo_approved_assets_folder_2026_05_20.md',
];

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const DOC_EXT = new Set(['.md', '.json', '.pdf']);

function nowStamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) args[key] = true;
      else { args[key] = next; i++; }
    } else args._.push(token);
  }
  return args;
}

async function walk(dir, maxDepth = 4, depth = 0) {
  if (!existsSync(dir) || depth > maxDepth) return [];
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name.startsWith('.')) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...await walk(full, maxDepth, depth + 1));
    else out.push(full);
  }
  return out;
}

async function readTextIfExists(file, maxChars = 16000) {
  try {
    const txt = await readFile(file, 'utf8');
    return txt.slice(0, maxChars);
  } catch { return ''; }
}

async function loadEnvLocal() {
  const envPath = path.join(REPO_ROOT, '.env.local');
  const txt = await readTextIfExists(envPath, 20000);
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const [, k, raw] = m;
    if (process.env[k]) continue;
    process.env[k] = raw.replace(/^['"]|['"]$/g, '');
  }
}

async function supabaseGet(pathAndQuery) {
  await loadEnvLocal();
  const url = process.env.EVEREST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.EVEREST_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || typeof fetch !== 'function') return { ok: false, error: 'missing_supabase_env' };
  try {
    const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, status: res.status, error: text.slice(0, 400) };
    return { ok: true, data: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

function excerptSection(txt, pattern, chars = 1400) {
  const idx = txt.toLowerCase().indexOf(pattern.toLowerCase());
  if (idx < 0) return '';
  return txt.slice(idx, idx + chars).trim();
}

async function inventoryImages(root) {
  const files = await walk(root, 5);
  const rows = [];
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    if (!IMAGE_EXT.has(ext)) continue;
    const st = await stat(f).catch(() => null);
    const rel = path.relative(root, f);
    rows.push({ path: f, relative_path: rel, filename: path.basename(f), ext, bytes: st?.size ?? null, tags: tagsForFilename(rel) });
  }
  return rows.sort((a, b) => a.relative_path.localeCompare(b.relative_path));
}

function tagsForFilename(name) {
  const n = name.toLowerCase();
  const tags = [];
  for (const [tag, tests] of Object.entries({
    product: ['product', 'studio', 'unit', 'front', 'side', 'panel'],
    lifestyle: ['lifestyle', 'man', 'bathroom', 'shower', 'apartment'],
    setup: ['setup', 'bathroom', 'apartment', 'panel', 'cable'],
    meta: ['meta', 'square', 'vertical'],
    comparison: ['dead', 'plunge', 'blue', 'old'],
    wide: ['wide', 'landscape', '16x9'],
    vertical: ['vertical', 'portrait', '9x16'],
    square: ['square', '1x1'],
    dark: ['dark', 'blue', 'black'],
  })) {
    if (tests.some(t => n.includes(t))) tags.push(tag);
  }
  return tags;
}

async function buildReferenceIndex() {
  const playbookFiles = (await walk(path.join(EIGHT_SLEEP_ROOT, 'playbook'), 2)).filter(f => f.endsWith('.md'));
  const playbooks = [];
  for (const file of playbookFiles) {
    const txt = await readTextIfExists(file, 50000);
    playbooks.push({
      path: file,
      filename: path.basename(file),
      title: (txt.match(/^#\s+(.+)$/m)?.[1] || path.basename(file)),
      key_excerpts: {
        tl_dr: excerptSection(txt, 'TL;DR', 900),
        hero: excerptSection(txt, 'Hero', 1200),
        section_structure: excerptSection(txt, 'Section structure', 1600),
        image_strategy: excerptSection(txt, 'Image strategy', 1600),
        kryo_application: excerptSection(txt, 'KRYO', 1600),
      },
    });
  }

  const eightAds = await inventoryImages(path.join(EIGHT_SLEEP_ROOT, 'ad_images'));
  const eightWebsite = await inventoryImages(path.join(EIGHT_SLEEP_ROOT, 'website_images'));
  const kryoApproved = await inventoryImages(APPROVED_KRYO_ASSETS);
  const pageScreenshots = await walk(path.join(EIGHT_SLEEP_ROOT, 'page_screenshots'), 2);
  const pagePdfs = await walk(path.join(EIGHT_SLEEP_ROOT, 'page_pdfs'), 2);

  const benchmarkProfile = JSON.parse(await readTextIfExists(path.join(REPO_ROOT, 'benchmarks/www-eightsleep-com-product-pod-cover-profile.json'), 20000) || '{}');
  const translationMap = JSON.parse(await readTextIfExists(path.join(SYSTEM_DIR, 'translation-map.json'), 20000) || '{}');
  const memories = [];
  for (const name of IMPORTANT_MEMORY_FILES) {
    const txt = await readTextIfExists(path.join(MEMORY_ROOT, name), 12000);
    if (txt) memories.push({ filename: name, excerpt: txt.replace(/^---[\s\S]*?---\s*/,'').slice(0, 2500).trim() });
  }

  return {
    generated_at: new Date().toISOString(),
    roots: { eight_sleep: EIGHT_SLEEP_ROOT, kryo_approved_assets: APPROVED_KRYO_ASSETS, output_root: OUTPUT_ROOT },
    inventory_counts: {
      eight_sleep_ad_images: eightAds.length,
      eight_sleep_website_images: eightWebsite.length,
      eight_sleep_page_screenshots: pageScreenshots.length,
      eight_sleep_page_pdfs: pagePdfs.length,
      kryo_approved_assets: kryoApproved.length,
      playbooks: playbooks.length,
    },
    benchmark_profile: benchmarkProfile,
    playbooks,
    assets: {
      eight_sleep_ad_images: eightAds,
      eight_sleep_website_images: eightWebsite,
      kryo_approved_assets: kryoApproved,
      page_screenshots: pageScreenshots,
      page_pdfs: pagePdfs,
    },
    translation_map: translationMap,
    memory_signals: memories,
  };
}

async function loadMarketingSignals() {
  const findings = await supabaseGet('marketing_findings?select=category,finding_key,finding_text,evidence,refreshed_at&order=category,finding_key');
  const clarity = await supabaseGet('clarity_friction_elements?select=date,page_url,element_selector,rage_click_count,dead_click_count,error_click_count,script_error_count,excessive_scroll_count,quick_back_count,total_sessions,avg_scroll_depth_pct,avg_engagement_time_sec,is_top_offender&order=date.desc&limit=20');
  const inbox = await supabaseGet('platform_inbox?select=id,platform,status,contact_name,raw_content,ai_summary,ai_recommendation,draft_reply,metadata,created_at&status=eq.pending&order=created_at.desc&limit=20');
  return {
    findings: findings.ok ? findings.data : [],
    findings_error: findings.ok ? null : findings.error,
    clarity: clarity.ok ? clarity.data : [],
    clarity_error: clarity.ok ? null : clarity.error,
    pending_inbox: inbox.ok ? inbox.data : [],
    pending_inbox_error: inbox.ok ? null : inbox.error,
  };
}

async function loadLearnings() {
  const file = path.join(OUTPUT_ROOT, 'learning.jsonl');
  const txt = await readTextIfExists(file, 100000);
  return txt.split(/\r?\n/).filter(Boolean).slice(-20).map(line => {
    try { return JSON.parse(line); } catch { return { note: line }; }
  });
}

function pickAsset(assets, includeTags, fallbackContains = []) {
  const scored = assets.map(a => {
    const tagScore = includeTags.reduce((s, t) => s + (a.tags.includes(t) ? 3 : 0), 0);
    const nameScore = fallbackContains.reduce((s, t) => s + (a.relative_path.toLowerCase().includes(t) ? 2 : 0), 0);
    return { ...a, score: tagScore + nameScore };
  }).filter(a => a.score > 0).sort((a, b) => b.score - a.score || a.relative_path.localeCompare(b.relative_path));
  return scored[0] || null;
}

function findFinding(signals, keyPart) {
  return (signals.findings || []).find(r => `${r.category}.${r.finding_key}`.includes(keyPart));
}


function summarizeClarity(rows = []) {
  const byUrl = new Map();
  for (const r of rows) {
    let key = r.page_url || 'unknown';
    try { const u = new URL(key); key = `${u.origin}${u.pathname}`; } catch {}
    const cur = byUrl.get(key) || { page_url: key, sessions: 0, dead_clicks: 0, rage_clicks: 0, error_clicks: 0, script_errors: 0, excessive_scrolls: 0, quick_backs: 0 };
    cur.sessions += Number(r.total_sessions || 0);
    cur.dead_clicks += Number(r.dead_click_count || 0);
    cur.rage_clicks += Number(r.rage_click_count || 0);
    cur.error_clicks += Number(r.error_click_count || 0);
    cur.script_errors += Number(r.script_error_count || 0);
    cur.excessive_scrolls += Number(r.excessive_scroll_count || 0);
    cur.quick_backs += Number(r.quick_back_count || 0);
    byUrl.set(key, cur);
  }
  return Array.from(byUrl.values())
    .map(r => ({ ...r, friction_score: r.dead_clicks + r.rage_clicks * 2 + r.error_clicks * 2 + r.script_errors * 3 + r.excessive_scrolls + r.quick_backs }))
    .sort((a, b) => b.friction_score - a.friction_score)
    .slice(0, 5);
}

function summarizeInboxObjections(rows = []) {
  const themes = {
    setup: ['setup', 'install', 'installation', 'plumbing', 'bathroom', 'apartment'],
    payment: ['pay', 'payment', 'deposit', 'installment', 'tabby', 'tamara', 'apple pay', 'price', 'aed'],
    shipping: ['ship', 'delivery', 'deliver', 'uae', 'dubai'],
    trust: ['warranty', 'return', 'guarantee', 'review', 'legit'],
    electrical: ['cable', 'wire', 'power', 'plug', 'electric', 'voltage'],
    checkout: ['checkout', 'cart', 'order', 'buy']
  };
  const out = Object.fromEntries(Object.keys(themes).map(k => [k, { count: 0, examples: [] }]));
  for (const r of rows) {
    const text = [r.raw_content, r.ai_summary, r.ai_recommendation, r.draft_reply, JSON.stringify(r.metadata || {})].filter(Boolean).join(' ').toLowerCase();
    for (const [theme, words] of Object.entries(themes)) {
      if (words.some(w => text.includes(w))) {
        out[theme].count += 1;
        if (out[theme].examples.length < 2) out[theme].examples.push((r.ai_summary || r.raw_content || '').slice(0, 220));
      }
    }
  }
  return Object.entries(out).filter(([, v]) => v.count > 0).sort((a, b) => b[1].count - a[1].count).map(([theme, v]) => ({ theme, ...v }));
}

function qualityScore({ index, signals, learnings }) {
  const reasons = [];
  let score = 72;
  if ((index.inventory_counts.eight_sleep_ad_images || 0) >= 30) score += 5;
  else reasons.push('Eight Sleep ad image inventory is thin.');
  if ((index.inventory_counts.kryo_approved_assets || 0) >= 10) score += 6;
  else reasons.push('KRYO approved asset pool needs more usable images.');
  if (findFinding(signals, 'top_ad')) score += 5;
  else reasons.push('No top_ad marketing finding available.');
  if (findFinding(signals, 'next_test')) score += 3;
  else reasons.push('No next_test finding available.');
  if (learnings.length > 0) score += Math.min(4, learnings.length);
  const stale = (signals.findings || []).some(r => r.refreshed_at && Date.now() - Date.parse(r.refreshed_at) > 36 * 3600 * 1000);
  if (stale) { score -= 5; reasons.push('marketing_findings has stale rows; refresh before spend decisions.'); }
  return { score: Math.max(0, Math.min(100, score)), reasons };
}

function buildPackage({ index, signals, learnings, target, angle }) {
  const approved = index.assets.kryo_approved_assets;
  const topAd = findFinding(signals, 'top_ad') || findFinding(signals, 'best_ice_shower_ad');
  const nextTest = findFinding(signals, 'next_test');
  const heroAsset = pickAsset(approved, ['product', 'wide', 'dark'], ['studio', 'front', 'product']);
  const setupAsset = pickAsset(approved, ['setup', 'lifestyle'], ['bathroom_setup', 'apartment_ready']);
  const metaSquare = pickAsset(approved, ['meta', 'square'], ['square']);
  const metaVertical = pickAsset(approved, ['meta', 'vertical'], ['vertical']);
  const comparisonAsset = pickAsset(approved, ['comparison', 'square'], ['dead_blue', 'plunge']);
  const qc = qualityScore({ index, signals, learnings });
  const claritySummary = summarizeClarity(signals.clarity);
  const objectionSummary = summarizeInboxObjections(signals.pending_inbox);
  const currentBottleneck = 'Traffic can create ATC/IC intent; the urgent layer is checkout/payment/setup confidence without making objections the hero.';
  const isSetupClarity = angle === 'setup_clarity';
  const heroCopy = isSetupClarity ? {
    eyebrow: 'KRYO 2.0',
    headline: 'Cold the way it was meant to be.',
    subhead: 'Turn Dubai tap water into a 1°C reset. No tub. No ice. Always ready.',
    cta: 'Shop KRYO 2.0',
    proof_line: 'AED 3,990 or 4 × AED 997.50. UAE setup support included.'
  } : {
    eyebrow: 'KRYO 2.0',
    headline: angle === 'morning_energy' ? 'Wake cold. Stay sharp.' : 'Cold the way it was meant to be.',
    subhead: 'Turn Dubai tap water into a 1°C reset. No tub. No ice. No bathroom rebuild.',
    cta: 'Shop KRYO 2.0',
    proof_line: 'AED 3,990 or 4 × AED 997.50. UAE setup support included.'
  };
  const setupCopy = isSetupClarity ? {
    headline: 'Apartment-ready by design.',
    subhead: 'Bathroom-side shower panel. 12L refillable reservoir. 48V bathroom-side power architecture. Slim 6.5mm cord. No plumbing rebuild.'
  } : {
    headline: 'Designed for apartments.',
    subhead: 'Bathroom-side shower panel. Compact cryo-engine. 6.5mm cord. No plumbing rebuild.'
  };
  const setupFaqs = isSetupClarity ? [
    ['Will this work in a Dubai apartment?', 'Yes. KRYO is built for apartment bathrooms where tap water is too warm and cold tubs are impractical.'],
    ['Do I need plumbing work?', 'No bathroom rebuild. The system uses a shower-side setup with a refillable 12L reservoir.'],
    ['Is the power setup bathroom-safe?', 'The bathroom-side architecture is based around low-voltage 48V power and a slim 6.5mm cord path, with setup support included.'],
    ['How do I pay?', 'KRYO is AED 3,990, available as 4 × AED 997.50 payments.']
  ] : [
    ['Will this work in a Dubai apartment?', 'Yes. KRYO is designed for apartment bathrooms where tap water is too warm and cold tubs are impractical.'],
    ['Do I need plumbing work?', 'No bathroom rebuild. The system is designed around a shower-side setup and support during installation.'],
    ['How do I pay?', 'KRYO is AED 3,990, available as 4 × AED 997.50 payments.']
  ];

  const pagePlan = [
    {
      order: 1,
      section: 'Hero',
      eight_sleep_reference: 'Hero uses premium system shot + single CTA + numerical proof.',
      kryo_action: 'Keep desire-first hero. Do not lead with setup. Add one proof line under CTA.',
      copy: heroCopy,
      asset: heroAsset,
    },
    {
      order: 2,
      section: 'Four-card feature strip',
      eight_sleep_reference: 'Smart technology that fits on any bed.',
      kryo_action: 'Add 4 scannable cards after hero to answer the first-scroll buyer questions.',
      cards: [
        ['1°C output', '5× colder than typical Dubai tap water.'],
        ['No tub', 'Designed for ensuite cold-shower protocols.'],
        ['No ice', 'The cryo-engine chills the water for you.'],
        ['Fast reset', 'Built for a 30-second morning protocol.']
      ],
      asset: setupAsset,
    },
    {
      order: 3,
      section: 'Dark big-stat banner',
      eight_sleep_reference: 'Get up to 34% more deep sleep with the Pod.',
      kryo_action: 'Create the iconic recall moment. One number. One outcome. Dark cinematic image.',
      copy: { headline: '1°C water. In your ensuite.', subhead: 'The cold-shock moment people remember.' },
      asset: heroAsset,
    },
    {
      order: 4,
      section: 'Anchor comparison',
      eight_sleep_reference: 'Without/with comparison + price/rental alternative.',
      kryo_action: 'Compare KRYO against AED 18,000+ cold plunges and messy ice setups.',
      copy: { headline: 'Cold plunge results. Shower footprint.', subhead: 'AED 3,990 instead of a balcony tub, ice bags, and lost space.' },
      asset: comparisonAsset,
    },
    {
      order: 5,
      section: 'System architecture / setup confidence',
      eight_sleep_reference: 'Annotated components + installation tabs.',
      kryo_action: 'Add lower-page confidence proof. This is where setup/electrical reassurance belongs.',
      copy: setupCopy,
      asset: setupAsset,
    },
    {
      order: 6,
      section: 'Repeated risk reversal + FAQ',
      eight_sleep_reference: 'Repeat warranty/trial/shipping near buy moments.',
      kryo_action: 'Compress CS objections into 2-3 FAQs plus one reassurance banner.',
      faqs: setupFaqs
    }
  ];

  const adVariants = [
    {
      angle: 'anchor_compare',
      headline: 'No Tub. No Ice. 1°C Cold.',
      primary_text: 'Industrial cold plunges can cost AED 18,000+ and eat your balcony. KRYO brings 1°C cold-shower therapy into your ensuite for AED 3,990.',
      creative_asset: metaSquare || heroAsset,
      placement: 'IG/FB feed square'
    },
    {
      angle: 'dubai_heat',
      headline: 'Dubai tap water is not cold therapy.',
      primary_text: 'When your building water turns warm, KRYO gives you a real 1°C reset in your bathroom. No ice bags. No tub. No rebuild.',
      creative_asset: metaVertical || setupAsset,
      placement: 'IG stories/reels vertical'
    },
    {
      angle: 'morning_energy',
      headline: 'Your 30-second morning reset.',
      primary_text: 'Step into cold that actually feels cold. KRYO turns warm tap water into a sharp 1°C protocol before work, training, or recovery.',
      creative_asset: metaSquare || setupAsset,
      placement: 'IG feed square'
    }
  ];

  const missingImageBriefs = [];
  if (!comparisonAsset) missingImageBriefs.push({
    slot: 'comparison_old_way',
    priority: 'high',
    prompt: 'Premium realistic photo of a defeated old cold-plunge setup: bathtub full of melting ice, torn ice bags, water puddles, towel over rim, thermometer floating. Modern apartment bathroom. Daylight. Slight chaos, but not dirty. 1:1 crop. No text.'
  });
  missingImageBriefs.push({
    slot: 'dark_big_stat_banner',
    priority: 'high',
    prompt: 'Cinematic dark premium bathroom scene. KRYO unit visible near shower, subtle steel-blue light, cold mist, product feels expensive and engineered. Wide 16:9 composition with empty negative space for overlay text. No visible cheap cables. No text baked in.'
  });
  missingImageBriefs.push({
    slot: 'system_architecture_diagram',
    priority: 'medium',
    prompt: 'Clean premium annotated product diagram showing bathroom-side shower panel, compact cryo-engine, 12L reservoir, 6.5mm cord route, and water flow. Matte black and steel-blue palette. Minimal labels. 16:9.'
  });

  return {
    version: 'kryo_creative_director_v1',
    generated_at: new Date().toISOString(),
    target,
    requested_angle: angle,
    reference_used: index.roots.eight_sleep,
    dynamic_inputs: {
      eight_sleep_inventory: index.inventory_counts,
      top_ad_finding: topAd?.finding_text || null,
      next_test_finding: nextTest?.finding_text || null,
      current_bottleneck: currentBottleneck,
      loaded_learnings: learnings.length,
      clarity_top_friction: claritySummary,
      inbox_objection_themes: objectionSummary,
    },
    strategic_decision: 'Build the next KRYO package as an Eight Sleep-style prospecting page: desire-first hero, first-scroll proof cards, dark stat moment, anchor comparison, lower-page setup confidence, repeated checkout reassurance.',
    page_plan: pagePlan,
    ad_variants: adVariants,
    missing_image_briefs: missingImageBriefs,
    qc,
    approval_rules: [
      'Do not patch Shopify until Tom explicitly approves the package.',
      'Do not activate Meta ads or change budgets from this package.',
      'If building ads, keep rows draft/paused and write an inbox card.',
      'Refresh marketing findings before spend decisions if stale warning appears.'
    ]
  };
}

function assetLine(asset) {
  if (!asset) return 'Needs generated asset.';
  return `${asset.filename} — ${asset.path}`;
}

function renderMarkdown(pkg) {
  const lines = [];
  lines.push(`# KRYO Creative Director Package`);
  lines.push('');
  lines.push(`Generated: ${pkg.generated_at}`);
  lines.push(`Target: ${pkg.target}`);
  lines.push(`Angle: ${pkg.requested_angle}`);
  lines.push(`QC score: ${pkg.qc.score}/100`);
  if (pkg.qc.reasons.length) lines.push(`Warnings: ${pkg.qc.reasons.join(' ')}`);
  lines.push('');
  lines.push(`## Strategic decision`);
  lines.push(pkg.strategic_decision);
  lines.push('');
  lines.push(`## Data used`);
  lines.push(`- Eight Sleep library: ${JSON.stringify(pkg.dynamic_inputs.eight_sleep_inventory)}`);
  lines.push(`- Top ad: ${pkg.dynamic_inputs.top_ad_finding || 'not available'}`);
  lines.push(`- Next test: ${pkg.dynamic_inputs.next_test_finding || 'not available'}`);
  lines.push(`- Bottleneck: ${pkg.dynamic_inputs.current_bottleneck}`);
  lines.push(`- Prior learnings loaded: ${pkg.dynamic_inputs.loaded_learnings}`);
  if (pkg.dynamic_inputs.clarity_top_friction?.length) {
    lines.push('- Clarity top friction URLs:');
    for (const r of pkg.dynamic_inputs.clarity_top_friction.slice(0,3)) lines.push(`  - ${r.page_url} — score ${r.friction_score}, sessions ${r.sessions}`);
  }
  if (pkg.dynamic_inputs.inbox_objection_themes?.length) {
    lines.push('- Inbox objection themes:');
    for (const r of pkg.dynamic_inputs.inbox_objection_themes.slice(0,4)) lines.push(`  - ${r.theme}: ${r.count}`);
  }
  lines.push('');
  lines.push(`## Page plan`);
  for (const s of pkg.page_plan) {
    lines.push(`### ${s.order}. ${s.section}`);
    lines.push(`- Eight Sleep reference: ${s.eight_sleep_reference}`);
    lines.push(`- KRYO action: ${s.kryo_action}`);
    if (s.copy) {
      for (const [k, v] of Object.entries(s.copy)) lines.push(`- ${k}: ${v}`);
    }
    if (s.cards) for (const [h, b] of s.cards) lines.push(`- Card: **${h}** — ${b}`);
    if (s.faqs) for (const [q, a] of s.faqs) lines.push(`- FAQ: **${q}** ${a}`);
    if ('asset' in s) lines.push(`- Asset: ${assetLine(s.asset)}`);
    lines.push('');
  }
  lines.push(`## Meta ad drafts`);
  for (const ad of pkg.ad_variants) {
    lines.push(`### ${ad.angle}`);
    lines.push(`- Headline: ${ad.headline}`);
    lines.push(`- Primary text: ${ad.primary_text}`);
    lines.push(`- Placement: ${ad.placement}`);
    lines.push(`- Creative asset: ${assetLine(ad.creative_asset)}`);
    lines.push('');
  }
  lines.push(`## Missing image briefs`);
  for (const b of pkg.missing_image_briefs) {
    lines.push(`### ${b.slot} (${b.priority})`);
    lines.push(b.prompt);
    lines.push('');
  }
  lines.push(`## Approval rules`);
  for (const r of pkg.approval_rules) lines.push(`- ${r}`);
  return lines.join('\n');
}

function renderImageBriefs(pkg) {
  return pkg.missing_image_briefs.map((b, i) => [
    `# Image brief ${i + 1}: ${b.slot}`,
    `Priority: ${b.priority}`,
    '',
    b.prompt,
    '',
    'Negative constraints: no cheap visible wiring, no plastic-looking product, no clutter unless intentionally showing the old-way comparison, no text baked into image, no medical claims.',
    ''
  ].join('\n')).join('\n---\n');
}

function renderReviewCard(pkg) {
  return [
    '# Tom review card',
    '',
    `QC: ${pkg.qc.score}/100`,
    '',
    'Approve if this direction is right:',
    '',
    '- Eight Sleep-style prospecting structure.',
    '- Desire-first hero.',
    '- Four-card first-scroll proof.',
    '- Dark 1°C stat banner.',
    '- Anchor comparison against tubs/ice.',
    '- Setup confidence lower on page.',
    '- 3 draft Meta ads, no activation.',
    '',
    'Main risk:',
    pkg.qc.reasons[0] || 'No blocking risk detected in the read-only package.',
    '',
    'Next build command after approval:',
    '`node scripts/kryo-creative-director.mjs run --target kryo2-uae --angle anchor_compare` then use strategy_package.json to create Shopify/Meta drafts.'
  ].join('\n');
}


function latestRunDir() {
  const runsRoot = path.join(OUTPUT_ROOT, 'runs');
  if (!existsSync(runsRoot)) throw new Error(`No runs directory: ${runsRoot}`);
  const entries = readdirSync(runsRoot, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => path.join(runsRoot, e.name))
    .sort();
  if (!entries.length) throw new Error('No Creative Director runs found. Run command first.');
  return entries[entries.length - 1];
}

function stampCompact() {
  return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
}

function slugClean(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 54);
}

function briefJson(x, n = 700) {
  try { return JSON.stringify(x).slice(0, n); } catch { return String(x).slice(0, n); }
}

async function marketingFetch(pathname, opts = {}) {
  await loadEnvLocal();
  const secret = process.env.MARKETING_SYNC_SECRET;
  if (!secret) throw new Error('MARKETING_SYNC_SECRET missing');
  const res = await fetch(`https://everest-calendar.vercel.app${pathname}`, {
    ...opts,
    headers: { 'x-sync-secret': secret, 'content-type': 'application/json', ...(opts.headers || {}) },
    signal: AbortSignal.timeout(opts.timeout || 120000),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${pathname} HTTP ${res.status}: ${briefJson(json)}`);
  return json;
}
async function marketingGet(pathname) { return marketingFetch(pathname); }
async function marketingPost(pathname, body, timeout = 120000) { return marketingFetch(pathname, { method: 'POST', body: JSON.stringify(body), timeout }); }

async function shopifyToken() {
  await loadEnvLocal();
  const store = process.env.SHOPIFY_STORE_URL;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!store || !clientId || !clientSecret) throw new Error('Missing SHOPIFY_STORE_URL/CLIENT_ID/CLIENT_SECRET');
  const res = await fetch(`https://${store}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json().catch(async () => ({ raw: await res.text().catch(() => '') }));
  if (!res.ok || !data.access_token) throw new Error(`Shopify token failed ${res.status}: ${briefJson(data)}`);
  return { token: data.access_token, store };
}

async function shopifyGql(query, variables = {}) {
  const { token, store } = await shopifyToken();
  const res = await fetch(`https://${store}/admin/api/2025-04/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(60000),
  });
  const data = await res.json().catch(async () => ({ raw: await res.text().catch(() => '') }));
  if (!res.ok || data.errors) throw new Error(`Shopify GraphQL failed ${res.status}: ${briefJson(data)}`);
  return data.data;
}

async function shopifyRest(pathname, opts = {}) {
  const { token, store } = await shopifyToken();
  const res = await fetch(`https://${store}/admin/api/2024-10${pathname}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token, ...(opts.headers || {}) },
    signal: AbortSignal.timeout(opts.timeout || 60000),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`Shopify REST ${pathname} HTTP ${res.status}: ${briefJson(json)}`);
  return json;
}

async function graphMeta(pathname, params = {}) {
  await loadEnvLocal();
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return null;
  const u = new URL(`https://graph.facebook.com/v25.0/${pathname}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  u.searchParams.set('access_token', token);
  const res = await fetch(u, { signal: AbortSignal.timeout(30000) });
  const json = await res.json().catch(async () => ({ raw: await res.text().catch(() => '') }));
  if (!res.ok) throw new Error(`Meta Graph ${pathname} HTTP ${res.status}: ${briefJson(json)}`);
  return json;
}

async function resolveMetaSource() {
  const preferred = '120247320903060279';
  const fields = 'id,name,status,effective_status,adset_id,creative{id,name,title,body,object_story_spec,thumbnail_url,url_tags},tracking_specs,conversion_specs';
  const ad = await graphMeta(preferred, { fields });
  if (!ad?.id) return { source_ad_id: preferred, source_campaign_id: '120242411668770279', source_adset_id: '120247320877650279', source_thumbnail_url: null, target_audience: null, daily_budget: 5, source_note: 'fallback_constants' };
  const adset = await graphMeta(ad.adset_id, { fields: 'id,name,status,effective_status,campaign_id,daily_budget,optimization_goal,billing_event,promoted_object,targeting' });
  const campaign = await graphMeta(adset.campaign_id, { fields: 'id,name,status,effective_status,objective' });
  return {
    source_ad_id: ad.id,
    source_ad_name: ad.name,
    source_ad_status: ad.effective_status,
    source_campaign_id: campaign.id,
    source_campaign_name: campaign.name,
    source_campaign_status: campaign.effective_status,
    source_adset_id: adset.id,
    source_adset_name: adset.name,
    source_adset_status: adset.effective_status,
    source_thumbnail_url: ad.creative?.thumbnail_url || null,
    target_audience: adset.targeting || null,
    daily_budget: Number(adset.daily_budget || 0) / 100 || 5,
    optimization_goal: adset.optimization_goal,
    promoted_object: adset.promoted_object || null,
  };
}

async function supabaseInsert(table, rows, select = '*') {
  await loadEnvLocal();
  const url = process.env.EVEREST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.EVEREST_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');
  const res = await fetch(`${url}/rest/v1/${table}?select=${encodeURIComponent(select)}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(rows),
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`Supabase insert ${table} HTTP ${res.status}: ${briefJson(json)}`);
  return json;
}

function packageBodyHtml(pkg) {
  const hero = pkg.page_plan.find(s => s.section === 'Hero')?.copy || {};
  const cards = pkg.page_plan.find(s => s.section === 'Four-card feature strip')?.cards || [];
  const stat = pkg.page_plan.find(s => s.section === 'Dark big-stat banner')?.copy || {};
  const comp = pkg.page_plan.find(s => s.section === 'Anchor comparison')?.copy || {};
  const setup = pkg.page_plan.find(s => s.section.includes('System'))?.copy || {};
  const faqs = pkg.page_plan.find(s => s.section.includes('FAQ'))?.faqs || [];
  const esc = (x) => String(x || '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  return [
    `<p>${esc(hero.subhead)}</p>`,
    `<ul>${cards.map(([h,b]) => `<li><strong>${esc(h)}:</strong> ${esc(b)}</li>`).join('')}</ul>`,
    `<h3>${esc(stat.headline)}</h3><p>${esc(stat.subhead)}</p>`,
    `<h3>${esc(comp.headline)}</h3><p>${esc(comp.subhead)}</p>`,
    `<h3>${esc(setup.headline)}</h3><p>${esc(setup.subhead)}</p>`,
    `<h3>Questions before ordering</h3>${faqs.map(([q,a]) => `<p><strong>${esc(q)}</strong><br>${esc(a)}</p>`).join('')}`,
  ].join('\n');
}

async function uploadLocalAsset(asset, label) {
  if (!asset?.path || !existsSync(asset.path)) return null;
  const data = await readFile(asset.path);
  const ext = path.extname(asset.path).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  const filename = `creative_director_${label}_${path.basename(asset.path)}`.replace(/[^a-zA-Z0-9._-]/g, '_');
  const res = await marketingPost('/api/marketing/shopify/upload-image', { filename, data_b64: data.toString('base64'), mime_type: mime, alt: `KRYO ${label}` }, 180000);
  if (!res.success || !res.cdn_url) throw new Error(`upload-image failed: ${briefJson(res)}`);
  return res.cdn_url;
}

async function duplicateProductDirect({ sourceHandle, targetHandle, targetTitle, bodyHtml }) {
  const sourceInfo = await marketingGet(`/api/marketing/shopify/get-product?handle=${encodeURIComponent(sourceHandle)}`);
  if (!sourceInfo?.id) throw new Error(`Source product not found via marketing API: ${sourceHandle}`);

  const sourceFull = await shopifyRest(`/products/${sourceInfo.id}.json?fields=id,handle,title,body_html,template_suffix,status`);
  const sourceProduct = sourceFull.product;

  const templateClone = await marketingPost('/api/marketing/theme/clone-template', {
    source_key: sourceInfo.template_filename,
    target_key: `templates/product.${targetHandle}.json`,
    overwrite: true,
    patches: [],
  }, 120000);
  if (!templateClone.success) throw new Error(`Template clone failed: ${briefJson(templateClone)}`);

  const dupData = await shopifyGql(`
    mutation Duplicate($productId: ID!, $newTitle: String!, $newStatus: ProductStatus, $includeImages: Boolean) {
      productDuplicate(productId: $productId, newTitle: $newTitle, newStatus: $newStatus, includeImages: $includeImages) {
        newProduct { id handle title status }
        userErrors { field message }
      }
    }
  `, { productId: `gid://shopify/Product/${sourceInfo.id}`, newTitle: targetTitle, newStatus: 'ACTIVE', includeImages: true });
  const errs = dupData.productDuplicate?.userErrors || [];
  if (errs.length) throw new Error(`productDuplicate userErrors: ${briefJson(errs)}`);
  const newGid = dupData.productDuplicate?.newProduct?.id;
  if (!newGid) throw new Error(`productDuplicate missing newProduct: ${briefJson(dupData)}`);
  const productId = newGid.replace(/^gid:\/\/shopify\/Product\//, '');

  const update = await shopifyRest(`/products/${productId}.json`, {
    method: 'PUT',
    body: JSON.stringify({ product: { id: Number(productId), handle: targetHandle, body_html: bodyHtml || sourceProduct.body_html || '' } }),
  });
  const finalHandle = update.product?.handle || targetHandle;

  const pubs = await shopifyGql(`query { publications(first: 25) { edges { node { id name } } } }`);
  const publications = pubs.publications?.edges?.map(e => e.node) || [];
  if (publications.length) {
    const pub = await shopifyGql(`
      mutation Publish($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) { publishable { ... on Product { id status } } userErrors { field message } }
      }
    `, { id: newGid, input: publications.map(p => ({ publicationId: p.id })) });
    const pubErrs = pub.publishablePublish?.userErrors || [];
    if (pubErrs.length) throw new Error(`publishablePublish userErrors: ${briefJson(pubErrs)}`);
  }

  const configured = await marketingPost('/api/marketing/theme/configure-product', { product_id: String(productId), template_suffix: targetHandle, body_html: bodyHtml }, 120000);
  if (!configured.success) throw new Error(`configure-product failed: ${briefJson(configured)}`);

  return { source_info: sourceInfo, product_id: productId, handle: finalHandle, requested_handle: targetHandle, public_url: `https://everestlabs.co/en-gb/products/${finalHandle}`, raw_public_url: `https://everestlabs.co/products/${finalHandle}`, template_clone: templateClone, configured, publications };
}

async function commandBuild(args) {
  const packagePath = args.package || path.join(latestRunDir(), 'strategy_package.json');
  const runDir = path.dirname(packagePath);
  const pkg = JSON.parse(await readTextIfExists(packagePath, 200000));
  if (!pkg?.page_plan?.length) throw new Error(`Invalid strategy package: ${packagePath}`);
  const sourceHandle = args.source || pkg.target || 'kryo2-uae';
  const targetHandle = args.handle || 'kryo2-dubai';
  const targetTitle = args.title || 'KRYO 2.0 Dubai';
  const execute = args.execute === true || args.execute === 'true';
  const bodyHtml = packageBodyHtml(pkg);
  const meta = await resolveMetaSource();
  const buildPlan = { packagePath, runDir, sourceHandle, targetHandle, targetTitle, execute, body_html_bytes: bodyHtml.length, meta_source: meta, ad_count: pkg.ad_variants.length };
  if (!execute) {
    await writeFile(path.join(runDir, 'build_plan.json'), JSON.stringify(buildPlan, null, 2));
    console.log(JSON.stringify({ success: true, dry_run: true, build_plan: path.join(runDir, 'build_plan.json'), next: 'rerun with build --execute to create Shopify product + DB ad drafts' }, null, 2));
    return;
  }

  const expRows = await supabaseInsert('marketing_experiments', [{
    user_id: '174f2dff-7a96-464c-a919-b473c328d531',
    name: `KRYO Creative Director - ${pkg.requested_angle} - ${new Date().toISOString().slice(0,10)}`,
    type: 'landing_page',
    hypothesis: pkg.strategic_decision,
    status: 'running',
    start_date: new Date().toISOString().slice(0,10),
    primary_metric: 'add_to_cart',
    target_metric: 'overall_conversion_rate',
    expected_lift_pct: 20,
    ice_impact: 9,
    ice_confidence: 7,
    ice_ease: 6,
    rationale: 'Creative Director v1 package generated from Eight Sleep reference structure, KRYO approved assets, Meta/Clarity/inbox signals, and Tom feedback learning loop.',
    execution_spec: { creative_director_version: pkg.version, package_path: packagePath, qc: pkg.qc, sourceHandle, targetHandle, meta_source: meta },
    data_sources: ['Eight Sleep reference library', 'KRYO approved assets', 'marketing_findings', 'clarity_friction_elements', 'platform_inbox'],
  }], '*');
  const experiment = expRows[0];

  const page = await duplicateProductDirect({ sourceHandle, targetHandle, targetTitle, bodyHtml });
  const lpRows = await supabaseInsert('landing_pages', [{
    user_id: '174f2dff-7a96-464c-a919-b473c328d531',
    name: targetTitle,
    shopify_url: page.raw_public_url,
    shopify_page_id: page.product_id,
    status: 'testing',
    page_type: 'product',
    parent_page_id: null,
    variant_angle: pkg.requested_angle,
    experiment_id: experiment.id,
    product_line: 'kryo',
    product_family: 'ice_shower',
    notes: `Creative Director v1 build from ${sourceHandle}. Package: ${packagePath}. Public URL: ${page.public_url}`,
  }], '*');
  const landingPage = lpRows[0];

  const uploaded = [];
  const adRows = [];
  for (const [i, ad] of pkg.ad_variants.entries()) {
    const cdn = await uploadLocalAsset(ad.creative_asset, `ad_${i+1}_${ad.angle}`);
    uploaded.push({ angle: ad.angle, source: ad.creative_asset?.path || null, cdn_url: cdn });
    adRows.push({
      user_id: '174f2dff-7a96-464c-a919-b473c328d531',
      experiment_id: experiment.id,
      landing_page_id: landingPage.id,
      channel: 'meta',
      status: 'draft',
      angle: ad.angle,
      hook_type: 'question',
      cta_style: 'shop_now',
      image_style: 'premium_reference',
      meta_campaign_id: meta.source_campaign_id,
      meta_adset_id: meta.source_adset_id,
      meta_ad_id: null,
      headline: ad.headline,
      body_copy: ad.primary_text,
      cta_text: 'Shop Now',
      composite_image_url: cdn || meta.source_thumbnail_url || null,
      daily_budget: meta.daily_budget || 5,
      target_audience: meta.target_audience,
      audience_segment_label: meta.source_adset_name || 'KRYO live source adset',
    });
  }
  const ads = await supabaseInsert('ad_creatives', adRows, '*');

  const inboxRows = await supabaseInsert('platform_inbox', [{
    user_id: '174f2dff-7a96-464c-a919-b473c328d531',
    platform: 'marketing',
    status: 'pending',
    approval_tier: 1,
    contact_name: `KRYO Creative Director - ${pkg.requested_angle}`,
    contact_identifier: `kryo_cd:${experiment.id}`,
    raw_content: `Creative Director build ready. Page: ${page.public_url}\nExperiment: ${experiment.id}\nLanding page row: ${landingPage.id}\nAd drafts: ${ads.map(a=>a.id).join(', ')}\nQC: ${pkg.qc.score}/100`,
    ai_summary: `KRYO Creative Director build ready: ${targetHandle} page + ${ads.length} Meta ad drafts.`,
    ai_recommendation: 'Review the live page and ad drafts. Ads are DB drafts only. Do not promote or activate spend until approved.',
    metadata: { category: 'angle_launch', creative_director_version: pkg.version, package_path: packagePath, experiment_id: experiment.id, landing_page_id: landingPage.id, shopify_product_id: page.product_id, page_url: page.public_url, handle: page.handle, ad_creative_ids: ads.map(a => a.id), uploaded_assets: uploaded, qc: pkg.qc, approval_required: true, no_spend_changed: true },
  }], '*');

  const result = { success: true, package_path: packagePath, experiment, page, landing_page: landingPage, ads, inbox: inboxRows[0], uploaded_assets: uploaded };
  await writeFile(path.join(runDir, 'build_result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ success: true, run_dir: runDir, build_result: path.join(runDir, 'build_result.json'), page_url: page.public_url, experiment_id: experiment.id, landing_page_id: landingPage.id, ad_creative_ids: ads.map(a=>a.id), inbox_id: inboxRows[0].id }, null, 2));
}

async function commandIndex() {
  const index = await buildReferenceIndex();
  await mkdir(OUTPUT_ROOT, { recursive: true });
  const file = path.join(OUTPUT_ROOT, 'eight_sleep_reference_index.json');
  await writeFile(file, JSON.stringify(index, null, 2));
  console.log(JSON.stringify({ success: true, file, counts: index.inventory_counts }, null, 2));
}

async function commandRun(args) {
  const target = args.target || 'kryo2-uae';
  const angle = args.angle || 'anchor_compare';
  const runDir = path.join(OUTPUT_ROOT, 'runs', nowStamp());
  await mkdir(runDir, { recursive: true });
  const [index, signals, learnings] = await Promise.all([buildReferenceIndex(), loadMarketingSignals(), loadLearnings()]);
  const pkg = buildPackage({ index, signals, learnings, target, angle });
  await writeFile(path.join(runDir, 'reference_index.json'), JSON.stringify(index, null, 2));
  await writeFile(path.join(runDir, 'marketing_signals.json'), JSON.stringify(signals, null, 2));
  await writeFile(path.join(runDir, 'strategy_package.json'), JSON.stringify(pkg, null, 2));
  await writeFile(path.join(runDir, 'strategy_package.md'), renderMarkdown(pkg));
  await writeFile(path.join(runDir, 'image_briefs.md'), renderImageBriefs(pkg));
  await writeFile(path.join(runDir, 'tom_review_card.md'), renderReviewCard(pkg));
  console.log(JSON.stringify({
    success: true,
    run_dir: runDir,
    qc_score: pkg.qc.score,
    warnings: pkg.qc.reasons,
    files: ['reference_index.json','marketing_signals.json','strategy_package.json','strategy_package.md','image_briefs.md','tom_review_card.md'].map(f => path.join(runDir, f))
  }, null, 2));
}

async function commandLearn(args) {
  const note = args.note;
  if (!note) throw new Error('Missing --note');
  await mkdir(OUTPUT_ROOT, { recursive: true });
  const row = { ts: new Date().toISOString(), source: args.source || 'tom_feedback', note };
  const file = path.join(OUTPUT_ROOT, 'learning.jsonl');
  await appendFile(file, JSON.stringify(row) + '\n');
  console.log(JSON.stringify({ success: true, file, row }, null, 2));
}

async function main() {
  const args = parseArgs(process.argv);
  const cmd = args._[0] || 'run';
  if (cmd === 'index') return commandIndex();
  if (cmd === 'run') return commandRun(args);
  if (cmd === 'learn') return commandLearn(args);
  if (cmd === 'build') return commandBuild(args);
  console.error(`Unknown command: ${cmd}`);
  process.exit(2);
}

main().catch(err => {
  console.error(JSON.stringify({ success: false, error: String(err.stack || err.message || err) }, null, 2));
  process.exit(1);
});
