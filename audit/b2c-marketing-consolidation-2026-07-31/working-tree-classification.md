# Working-Tree Classification — 144 changes (2026-07-31)

Every changed/untracked path classified. "Commit?" = should eventually be version-controlled.
"Archive?" = belongs in an archive rather than the live tree. Confidence H/M/L.
**Rule applied: an untracked file is NOT assumed disposable.**

## A. Current B2C application code (modified, tracked) — COMMIT
| Path | Purpose | Commit | Risk | Confidence |
|---|---|---|---|---|
| src/app/api/cron/marketing-analytics-sync/route.ts | Nightly sync orchestrator (Meta/GA4/Shopify/Clarity) | Yes | Med — core cron | H |
| src/app/api/cron/process-directives/route.ts | Directive/queue processor | Yes | Med | H |
| src/app/api/marketing/insights/route.ts | Insights read API | Yes | Low | H |
| src/app/api/marketing/launch/{clone-page,promote-ads,publish-product}/route.ts | Launch/split-test unlock routes | Yes | Med (touches Shopify/Meta writes) | H |
| src/app/api/marketing/shopify/upload-image/route.ts | Shopify image upload | Yes | Low | H |
| src/app/api/marketing/sync/{clarity,ga4,ga4-pages,gsc,meta-ad-insights,storefront-event}/route.ts | Data sync routes | Yes | Med — data trust depends on these | H |
| src/app/api/marketing/theme/{configure-product,deploy-asset}/route.ts | Approved theme-patch paths | Yes | High (live theme) | H |
| src/app/api/webhooks/meta-leads/route.ts | Meta lead webhook | Yes | Med | H |
| src/components/marketing/MarketingDashboard.tsx | Dashboard UI | Yes | Low | H |
| src/lib/page-sections/{index,types}.ts | LP section registry/types | Yes | Low | H |
| src/lib/supabase/middleware.ts | Auth middleware | Yes | Med | H |

## B. Deleted (tracked) — CONFIRM intent before committing deletion
| Path | Note | Confidence |
|---|---|---|
| docs/SHOPIFY_WEB_PIXEL.md | Doc removed — likely superseded by newer docs | M |
| src/app/api/marketing/sync/meta-breakdowns/route.ts | Route removed — Meta breakdowns folded elsewhere? verify no caller | M |
| supabase/migrations/2026-05-04_meta_ad_breakdowns_daily.sql | Migration deletion is DANGEROUS if already applied remotely — **requires review** | L |

## C. Marketing analytics / data-pipeline toolchain (UNTRACKED) — COMMIT, HIGH VALUE / HIGH RISK
The core of the new analytics system. Exists on this Mac only.
| Path | Purpose | Commit | Risk if lost | Conf |
|---|---|---|---|---|
| scripts/kryo-source-health.mjs | Per-source freshness/health gate | Yes | High | H |
| scripts/kryo-preflight.mjs | Blocking marketing preflight | Yes | High | H |
| scripts/kryo-recommendation-gate.mjs | Blocks stale CPA/ROAS claims | Yes | High | H |
| scripts/kryo-measurement-spine-health.mjs | Measurement-spine integrity | Yes | High | H |
| scripts/kryo-experiment-{loop-smoke,packet,reviewer,velocity}.mjs | Split-test engine scripts | Yes | High | H |
| scripts/kryo-ice-queue.mjs / kryo-growth-decision-brief.mjs | ICE prioritisation + brief | Yes | High | H |
| scripts/kryo-meta-direct-readiness.mjs / verify-meta-token.mjs / exchange-meta-token.mjs | Meta-direct migration tooling | Yes | High | H |
| scripts/kryo-shopify-readiness.mjs / shopify-release-guard.mjs / qc-shopify-page.mjs(+test) | Shopify safety/QC | Yes | High | H |
| scripts/kryo-checkout-reconciliation.mjs / kryo-route-audit.mjs / kryo-proof-{gate,runner}.mjs | Reconciliation + proof gates | Yes | High | H |
| scripts/system/kryo-creative-director/* + kryo-creative-director.mjs | Creative generation system | Yes | Med | M |
| scripts/system/kryo-analytics-ops-runner.{mjs,plist} | Local ops runner + launchd job | Yes (mjs); plist = env-specific | Med | M |
| src/lib/marketing/ (untracked dir, 112K) | Marketing lib used by routes | Yes | **Critical — routes may import this** | H |
| src/app/api/marketing/{kryo,ops,reports,log-change}/ | New analytics/ops/report APIs | Yes | High | H |
| src/app/api/marketing/shopify/{admin-graphql,delete-product,upsert-redirect}/ | Shopify admin routes | Yes | Med | H |
| src/app/api/webhooks/meta-whatsapp/ | WhatsApp Cloud webhook | Yes | Med | H |
| src/components/marketing/ICEMatrixTab.tsx | ICE UI tab | Yes | Low | H |
| src/lib/page-sections/{bentoGrid,comparisonSlider,marqueeBand,scrollRevealMetrics,stickyScrollytelling}.ts | New LP section variants for split tests | Yes | Med | H |
| supabase/migrations/20260608170000_kryo_analytics_operating_system_v2.sql | Analytics OS v2 schema | Yes | **Critical** | H |
| supabase/migrations/20260725050000_kryo_measurement_spine.sql | Measurement spine schema | Yes | **Critical** | H |
| supabase/migrations/20260725062000_kryo_whatsapp_cloud_api.sql | WhatsApp Cloud tables | Yes | High | H |
| supabase/migrations/{20260504_atc_diagnosis_loop,20260505024314_test_velocity,20260526010000_ga4_48h_diagnostics_cache}.sql | Diagnostics/experiment schema | Yes | High | H |

## D. B2C marketing source-of-truth docs (UNTRACKED) — COMMIT
| Path | Purpose | Conf |
|---|---|---|
| MARKETING_RUNBOOK.md | Tool-neutral marketing spec | H |
| KRYO_SYSTEM_OPERATING_MAP.md | Canonical ops map + data validity | H |
| KRYO_MARKETING_SYSTEM_QC.md | System QC dimensions | H |
| KRYO_PRODUCT_RUNBOOK.md | Product facts for copy | H |
| AGENTS.md | Codex/agent instructions (repo scope) | H |
| marketing/foundation/{positioning,offer,brand-voice,funnel,visual-direction}.md | Foundation source of truth | H |
| marketing/{experiments,analytics,creative,agents,skills}/ | Marketing subsystem docs/skills | H |
| docs/KRYO_{COPY_CONSTITUTION,CREATIVE_DIRECTOR,STOREFRONT_RELIABILITY_PROTOCOL,TRUST_LANGUAGE_TEST_PLAN,WHATSAPP_PLAYBOOK}.md | Playbooks/test plans | H |
| docs/KRYO_MARKETING_SYSTEM_AUDIT_2026-07-25.md | Prior audit | H |
| config/{kryo-system-registry.json,kryo-whatsapp-tracking.json,qc-shopify-pages.json} | Machine-readable registries (no secrets) | H |

## E. Claude configuration (UNTRACKED / modified) — COMMIT (except local perms)
| Path | Purpose | Commit | Conf |
|---|---|---|---|
| .claude/meta/*.md (analysis-rules, metric-dictionary, account-context, query-policy, tool-map, report-template, change-log) | **Meta analytics-agent config** | Yes | H |
| .claude/skills/meta-* (experiment, setup, daily, audit, verify, change, creative) | Meta agent skills | Yes | H |
| .claude/hooks/meta_mcp_guard.py | PreToolUse guard for Meta MCP mutations | Yes | H |
| .claude/settings.json (modified) | Project Claude settings | Yes | H |
| .claude/settings.local.json | **Local perms — DO NOT COMMIT** (should be gitignored) | No | H |
| .github/ (untracked) | CI/workflows? verify then commit | Yes | M |

## F. Generated reports / proofs / test output — ARCHIVE (do not commit to live tree)
| Path | Action | Conf |
|---|---|---|
| artifacts/ (kryo-preflight, shopify-page-qc, atc-diagnosis, …) | Archive; likely already gitignored | H |
| reports/ , screenshots/ , tmp/ (8MB), tmp-ai_gen_block_bbfce70.liquid | Archive/discard | H |
| .tmp_linktest/ , supabase/.temp/* , $CODEX_HOME/ | Local caches — gitignore, do not commit | H |

## G. Excluded domains (present in repo, keep OUT of B2C agent)
| Path | Domain | Action |
|---|---|---|
| CAD_RUNBOOK.md | CAD/manufacturing | Leave; exclude from B2C scope; NOT copied to recovery |
| SUPPLIER_RUNBOOK.md | Suppliers | Leave; exclude; NOT copied to recovery |

## H. Potential secret / local-only config — NEVER COMMIT
| Path | Note |
|---|---|
| .env.local, .env.prod.local, .vercel/.env.production.local | Live secrets. Confirm all are gitignored. |
| .claude/settings.local.json | Local permissions. Gitignore. |
| scripts/*.plist (launchd) | Machine-specific paths; keep local or template-ise. |

## I. Unclear — REQUIRES REVIEW
| Path | Question |
|---|---|
| .gitignore (modified) | What was added/removed? Ensure it now ignores .env*, .claude/settings.local.json, tmp/, artifacts/. |
| package.json (modified) | New scripts/deps for the toolchain — reconcile before commit. |
| supabase migration DELETION (see B) | Never delete an applied migration; confirm remote state first. |
| vercel.json (modified) | Cron set changed (now 3 crons). Confirm Vercel plan allows 3. |
