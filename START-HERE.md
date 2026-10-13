# ScopeFlux free launch update

This update is for the EXISTING metjus/scopeflux repository and Cloudflare Worker.
Do not create a new repository or Worker. Domain settings stay as configured.

## Update
1. Unzip this package.
2. Open metjus/scopeflux on GitHub, choose Add file > Upload files.
3. Upload the CONTENTS of this folder, including public/ and lib/, replacing existing files.
   package.json, wrangler.json and worker.mjs must stay at repository root.
4. Commit changes to the Cloudflare-connected branch.
5. Wait for Cloudflare's existing deployment to succeed, then open scopeflux.io.

Build command stays empty. Deploy command stays npx wrangler deploy.
No API credentials, advertising account or paid plan are needed for this beta.

## Useful tools
- Current RSS topics with reporting links and honest source traffic labels.
- Save topics and compare recorded manual refreshes in the same market.
- Export the filtered feed as CSV or a plain-text brief with available news links.
- Share market/filter URLs; only public filters are shared, not local data.
- Import dated CSV values, compare up to five series, calculate seasonality and export.

## Check after deployment
1. Open scopeflux.io without a hash: real RSS discovery is the default.
2. Select Slovakia and Czechia. Confirm feeds or a clear source-unavailable message.
3. Save a topic, refresh later and select an earlier refresh to compare.
4. Filter topics, download CSV and brief, and open the shared view in a new browser tab.
5. Import a CSV, inspect the summary/units, compare and export it.
6. Check on mobile: navigation, labels, topic cards and chart scrolling.

Everything is free. No advertising, ad blocker restriction, historical keyword API,
account system, background refresh, notification or forecast is active.
RSS is attributed to Google's public source. Feed coverage varies.
Your imported values, saved topics and past refreshes stay in the current browser.
They do not synchronize between devices. Keep CSV exports as your own backups.

Automated checks pass; rendered browser/mobile QA remains to be completed.
