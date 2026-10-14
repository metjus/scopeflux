# Prompts for Claude Code — one per phase

Paste one at a time. After each: read the summary, try the site locally
(`npx wrangler dev`), then commit. Start a fresh session (`/clear`) between phases
if the conversation gets long — CLAUDE.md and the docs keep the context.

---

## Phase 0 — look around (use plan mode)

Read CLAUDE.md and everything in docs/. Then read the whole repo. Do not edit anything.
Tell me: what each file does today, which files are minified, what already works,
and the biggest risks you see in docs/v1-spec.md. Ask me anything that is unclear
before we start phase 1.

## Phase 1 — readable code

Do phase 1 from docs/v1-spec.md: unminify and split public/ into clear modules with
zero change in behaviour. lib/wikipedia.mjs, the updated worker.mjs and tests are new
and already pass — keep them. Run npm test. At the end give me a README.md map of
every file and a plain-words summary of what you changed.

## Phase 2 — new look

Do phase 2: apply docs/design.md to every existing page. Put all colours in
public/styles/tokens.css. Behaviour must not change. Check it at phone width too.

## Phase 3 — source adapters

Do phase 3: adapters for Wikipedia (move lib/wikipedia.mjs into lib/sources/),
Hacker News, GDELT and Trends RSS, all with the same output shape. First check each
provider's current docs and update docs/data-sources.md if anything differs.
Tests use saved sample responses only, no live network.

## Phase 4 — pipeline, D1, cron

Do phase 4. First check the current Cloudflare Workers limits for the free plan and
tell me the batch size you chose and why. Then the D1 schema, the cron job and a
manual trigger that only works locally. Show me how to create the D1 database and
run the migration myself.

## Phase 5 — Discover page

Do phase 5: Discover on /api/discover, following docs/mockups/Main.dc.html with the
v1 differences in docs/mockups/README.md. Include loading, empty and error states.

## Phase 6 — Topic page

Do phase 6: the topic page on /api/topic — only the chart and per-source table from
docs/mockups/Result.dc.html. Hover readout with raw values and units.

## Phase 7 — Sources & help, states

Do phase 7 using Sources.dc.html and States.dc.html. Show the real thresholds from
lib/config.mjs on the Sources page.

## Phase 8 — ship

Help me deploy. Give me a checklist to verify every page on desktop and on a phone,
and tell me anything that still uses sample data (the answer should be: nothing).
