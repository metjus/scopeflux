# Launch checklist (phase 8)

Work through this in order. Each step says what you should see. If something looks wrong,
stop and note which step it was.

## 1. Before merging to `main`

- [ ] `npm install` then `npm test` → every test passes.
- [ ] Create the database once (see `README.md` → "Switching on Discover"):
      `npx wrangler d1 create scopeflux`, paste the `database_id` into `wrangler.json`,
      `npx wrangler d1 migrations apply scopeflux --remote`.
- [ ] `npm run check` (a dry-run deploy) → no errors.
- [ ] Merge the pull request into `main`. Cloudflare deploys it automatically.

## 2. Right after the deploy (desktop browser)

- [ ] https://scopeflux.io opens on **Discover trends** with the dark design.
- [ ] Discover shows either results, or "The first results for Worldwide are still being
      collected". It must never show topics that were not measured.
- [ ] Type a topic in the top search box (e.g. `matcha`) → **Scan** opens its topic page with up
      to three lines (Wikipedia, Hacker News, GDELT). Hovering the chart shows raw numbers with
      units. 30 / 90 days switches the window.
- [ ] A topic with no Wikipedia article (e.g. `best running shoes`) says so and still shows the
      other sources.
- [ ] **Sources & help** lists 4 sources and the thresholds table is filled in.
- [ ] **CSV analytics**: look up `matcha` → chart and metrics load from Wikipedia.
- [ ] **Import data**: download the blank template, fill in numbers, import it, open it.
- [ ] **Compare topics**, **Seasonality**, **Saved topics**, **Google Trends RSS list** open
      without errors.

## 3. After 1–2 hours

- [ ] Cloudflare dashboard → Workers → scopeflux → **Logs**: lines `pipeline step` appear every
      5 minutes with `collected`, `evaluated`, `finished`.
- [ ] No `Exceeded CPU` errors. If they appear, the free plan's 10 ms limit is too tight:
      lower `candidatesPerRun` in `lib/config.mjs` (e.g. to 5) or switch to the $5 paid plan.
- [ ] Discover → Worldwide shows "Rising now" or "Early signals" with an "Updated …" time.
      The source row says "responding" for each source.

## 4. After one day

- [ ] All 8 markets in the Market picker have results (small markets may be quiet — that is
      allowed and the page says so).
- [ ] Open a few topics from Rising now: each one's chart should actually go up on the sources
      shown with coloured dots.
- [ ] Note topics that look wrong (wrong article, obvious noise). After a week, use these notes to
      tune the thresholds in `lib/config.mjs` (docs/data-sources.md → "Rising rules").

## 5. On a phone (both iPhone and Android if possible)

- [ ] The ☰ button opens the menu from the left; tapping a page closes it.
- [ ] Discover: one topic per row, dots and change are readable, nothing scrolls sideways.
- [ ] Topic page: tapping the chart shows the readout; 30 / 90 days buttons are easy to hit.
- [ ] The search box does not zoom the page when tapped.
- [ ] Sources & help: the source table scrolls sideways inside its box only.

## What uses sample data in production?

Nothing. Sample answers exist only in `tests/samples/` and are used only by `npm test`.
The only code that mentions "sample" in `public/` removes old generated demo series that earlier
versions of ScopeFlux stored in visitors' browsers.
