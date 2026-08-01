# KRYO Creative Director v1

Read-only dynamic marketing package generator.

## What it does

`node scripts/kryo-creative-director.mjs run` reads:

- Eight Sleep reference library: `/Users/happy/Desktop/02_Marketing/Research/EIGHTSLEEP_REFERENCE/`
- KRYO approved image pool: `/Users/happy/Downloads/APPROVED/`
- marketing findings from Supabase when env vars are available
- durable Tom/KRYO memory files
- prior Creative Director learnings from `~/Desktop/02_Marketing/KRYO/creative_director/learning.jsonl`

It writes a review-ready package to:

`~/Desktop/02_Marketing/KRYO/creative_director/runs/<timestamp>/`

No Shopify page is patched. No Meta ad is created. No spend changes are made.

## Commands

```bash
node scripts/kryo-creative-director.mjs index
node scripts/kryo-creative-director.mjs run --target kryo2-uae --angle anchor_compare
node scripts/kryo-creative-director.mjs learn --source tom_feedback --note "Hero felt too functional; make it more premium."
```

## Output files

- `reference_index.json` — current Eight Sleep/KRYO asset inventory and extracted playbook snippets.
- `strategy_package.json` — machine-readable plan for future build automation.
- `strategy_package.md` — human-readable Creative Director package.
- `image_briefs.md` — image generation/editing prompts for missing assets.
- `tom_review_card.md` — compact approval card.

## Dynamic improvement loop

1. Each run rereads the current folders and Supabase findings.
2. Tom feedback is appended with `learn`.
3. Future packages load the last 20 learnings.
4. The quality gate blocks packages that violate Tom feedback or KRYO rules.
5. When build routes consume `strategy_package.json`, package generation and execution become one approval-gated loop.
