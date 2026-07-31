# Skill: validate-marketing-data

Run:

```bash
npm run audit:kryo-source-health
npm run audit:kryo-measurement-spine
```

Blocks:

- Current CPA, ROAS, winner, best ad, scale, and conversion-rate claims when source-health is stale.
- Qualified lead and deposit claims when measurement-spine tables or events are missing.
