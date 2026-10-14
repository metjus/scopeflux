# ScopeFlux

Trend discovery tool at https://scopeflux.io. Shows which topics are rising across
several free public data sources at once, and how each one is moving.

Owner: Matúš (solo). He reads code but is not a full-time developer — explain what
you changed in plain words at the end of every task.

## Stack

- Cloudflare Worker (`worker.mjs`) serving `/api/*`, static frontend in `public/`
- Plain JavaScript ES modules, no framework, no build step
- Tests: `npm test` (node:test). Deploy: `npm run deploy` (wrangler)
- Storage for v1: Cloudflare D1. Scheduled work: Cloudflare Cron Triggers

## Where things are

- `docs/v1-spec.md` — what to build now, phase by phase. **Read it before any task.**
- `docs/data-sources.md` — every source: endpoint, what it counts, limits, thresholds
- `docs/design.md` — colours, type, layout rules
- `docs/mockups/` — reference markup for the screens (not runnable, see its README)

## Rules that always apply

1. **No invented numbers.** No combined "trend score", no forecasts, no AI summaries
   of what a number means. Every figure shown must come from one named source.
2. **Every number carries its source and unit** in the UI (e.g. "Wikipedia article
   views per day"). Sources are never averaged or blended together.
3. **Missing data is shown as missing.** If a source fails or has too little data,
   say so in the UI. Never fill gaps with sample, synthetic or guessed values.
4. **Readable code.** One file = one job. Short functions, clear names, a comment
   on anything non-obvious. No minified source in the repo. Matúš or someone else
   must be able to edit it later.
5. **Small steps.** One phase from the spec at a time. Run `npm test` before
   saying a task is done. Do not start the next phase unless asked.
6. **Reddit is not used.** Do not add Reddit code, keys or references.
7. Keep secrets out of the repo. Use `wrangler secret` for any credentials.
8. Every external request: timeout, size limit, descriptive User-Agent with
   https://scopeflux.io, and a friendly error the UI can show.

## Copy

The site is in English, for a worldwide audience. Short, plain sentences.
Explain limits openly — honesty about the data is part of the product.
