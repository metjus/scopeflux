# Standalone catalogue updates

## Ownership and security

This package uses an independent Cloudflare Worker and D1 database. It contains no ChatGPT Sites credentials or personal watchlists. Never reuse a Sites service credential for this deployment.

Both GET and POST `/api/catalog-cache` require `Authorization: Bearer <CATALOG_REFRESH_TOKEN>`. Without the configured Worker secret, the writer remains closed. Use a unique random token of at least 32 characters; do not put it in source files, Wrangler vars, shell history, logs or this archive.

After first deployment, generate a token in your password manager. Set it using Wrangler's hidden interactive prompt:

```sh
npx pnpm@11.25.0 exec wrangler secret put CATALOG_REFRESH_TOKEN --name scopeflux
```

If you renamed the Worker, use that name. Store the same token in your private GitHub repository's Actions secret `DOMAINRADAR_REFRESH_TOKEN`, and the HTTPS origin in `DOMAINRADAR_URL`. If Access protects the complete hostname, create an Access service token and a Service Auth policy for the updater; add `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` as private Actions secrets. The supplied updater sends these headers only to your own hostname, never to catalogue sources. Alternatively restrict Access to account paths while keeping the writer protected by its bearer token. Do not embed browser login cookies or turn off writer authentication.

## Verified updater

`scripts/refresh-catalog.mjs` retains the public-source parsers and save/readback validation used by the original catalogue. The export changes the writer authentication to its own bearer token and supports environment variables for CI.

The supplied `.github/workflows/refresh-catalog.yml` runs hourly and manually. Put the **contents of this folder at the repository root** so the workflow can find `scripts/`. It runs on Node 24 without dependency installation; all updater imports are local TypeScript modules with erased types. Enable the workflow after setting the secrets. Nothing is automatically activated by unpacking this ZIP.

- Upcoming `.ai`, `.eu`: only `https://backorder.com/en/pending-delete/ai` and `/eu`, public previews, at most 100 records each.
- Historical `.com`, `.net`, `.org`, `.ai`, `.eu`, `.io`, `.app`: only the public ten-row example table at `https://www.expireddomains.net/tld/<tld>/`.
- Never follow `/goto`, member-list, registrar, sign-in or backorder actions. Do not buy or backorder domains.
- Preserve source release dates exactly. Date-only estimates remain date-only. Historical relative labels use the source HTTP Date and explicit UTC indication, retaining original provenance.
- Set retrieval timestamps only when a response is actually retrieved. Do not make stale snapshots appear fresh.
- Source failure/empty/invalid response: keep the previous listing and timestamp. Never write an empty successful replacement after failure.

The Worker cron separately refreshes public Backorder.sk and Dynadot catalogues through `upcomingCatalog`. Its `10 * * * *` cron is UTC. It archives prior observations and prunes history older than the supported window. Change/remove `triggers.crons` if desired, then redeploy. No domain release hour is inferred from cron timing.

## Readback

The updater checks `/api/catalog-cache` for each submitted source's exact timestamp and count. Afterwards check:

- `/api/domains?cached=1` and each `&tlds=ai` / `&tlds=eu` snapshot.
- `/api/domains` main catalogue (may refresh other public sources).
- `/api/domains?view=recent` and `&tlds=ai` / `&tlds=eu` for historical observations.

An empty filter result is valid if the public preview has no matching release date. It must not be described as complete coverage. Registry lookups and source listings are separate observations; a failed RDAP request must not turn a domain into available status.

The bundled snapshots are an initial seed, not a live promise. Source blocking, throttling and provider changes can delay updates. The source panel exposes preserved timestamps and overdue previews. Keep monitoring workflow failures; do not overwrite previous data to hide failures.
