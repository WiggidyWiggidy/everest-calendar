# Landing Pages — Source of Truth

Measured from `attribution_touches`, 60 days to 2026-07-31, live site only.

| Path | Mobile sessions | Desktop sessions | Role |
|---|---:|---:|---|
| `/products/kryo2` | 545 | 77 | Primary PDP |
| `/products/kryo2_` | 213 | 81 | A/B clone |
| `/` | 99 | 62 | Home |
| `/collections/shop` | 70 | 16 | Collection |
| `/cart` | 45 | 60 | Cart |
| `/products/everestpod` | 43 | — | Adjacent product |
| `/products/kryo2-1` | 12 | 12 | Variant — purpose UNRESOLVED |

## Convention
Trailing-underscore handles (`kryo2_`, `everestpod_`) are A/B clones of the control page,
produced by `/clone-product`.

## Current constraint
**Both primary templates fail on mobile add-to-cart** (0.18% and 0.47% vs 10.4% and 4.9%
on desktop). Landing-page copy tests are held until this is resolved — see
[experiment-backlog.md](../../audit/b2c-growth-system-activation-2026-07-31/experiment-backlog.md).

## UNRESOLVED
- [ ] Purpose of `/products/kryo2-1` and `/products/kryo_2` — active tests or abandoned clones?
