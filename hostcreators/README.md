# HostCreators Basic migration — phase 1 (NOT a deployable replacement)

This directory is a **staging skeleton**, not a complete rewrite of ScopeFlux.
Do not point scopeflux.io to it or disable Cloudflare yet.

## Hosting prerequisites to confirm
- PHP 8.1+ with PDO MySQL, JSON, OpenSSL, cURL
- MySQL or MariaDB database access
- Apache mod_rewrite or equivalent routing
- Cron task execution via CLI PHP
- Outbound HTTPS requests to domain-list providers
- Ability to keep config.php outside the public document root

## Initial staging setup
1. Create a separate subdomain, e.g. staging.scopeflux.io, and point its document root to `hostcreators/public/`.
2. Upload this directory to hosting (not the full Next.js source).
3. Open `/health` on staging to verify PHP routing.
4. Create a MySQL database and run `sql/001_initial.sql` on an **empty staging DB**.
5. Copy `config.example.php` to private `config.php` outside public/, supply credentials there, and exclude it from backups shared publicly.

## Still to implement before migration
- PHP equivalents of all public Next.js pages and metadata, matching CSS/assets/layout
- Domain check and RDAP APIs, catalog feed imports, archive/history, statuses
- Google OAuth (state, nonce, session signature, expiry), account deletion and watchlist APIs
- D1-to-MySQL **data migration** with row-count and integrity verification
- Cron jobs and safe import limits, actual third-party feed access tests
- Complete authentication, regression and SEO tests
- Final staging verification, then planned DNS switch and rollback strategy

## Safeguards
- Never commit Google secrets or database passwords.
- No import of user data until an authenticated secure backend is complete.
- The staging route returns HTTP 503 and noindex on all routes except /health.
- Existing Cloudflare production remains the sole source of truth until cutover.

## Phase 2 progress — read-only catalogue API
- `lib/catalog-api.php` provides PDO MariaDB access and reads imported snapshots.
- `public/index.php` now handles `/health`, `/api/domains`, `/api/domains?tlds=com`, and `/api/domains?view=recent`.
- Only stored data is served; this phase **does not fetch external feeds**.
- `scripts/import-json.php` is CLI-only, transactional, and intended for an empty MariaDB staging database. It accepts one private JSON file keyed by D1 table names. Do not upload that export to `public/`, and do not share it in chat or commits.
- D1 data extraction/export and parity verification have **not** been done yet.
- PHP CI lint is checked by `Verify HostCreators PHP migration`.

Do not publish this to the live domain yet: routing, sign-in, watchlists, individual domain lookup, and frontend are not complete.

## Phase 3 staging additions
- `/radar-preview`: styled, mobile-responsive, noindex catalogue viewer with search, filters and pagination. This is a **preview**, not the full original Next.js experience.
- `scripts/refresh-cz.php`: scheduled CLI adapter for CZ.NIC auction data. Run at most every 15 minutes after testing.
- `scripts/prune-history.php`: daily removal of history older than 31 days.
- Missing: verified Backorder.sk adapter, global domains feeds and full historical archive ingestion, Google OAuth/account/watchlist routes, domain lookup and full parity with original frontend.
- Do NOT publish the PHP staging root on the live domain; the existing maintenance page must remain until hosting tests pass.
- No MariaDB credentials have been set or accessed by this migration code.
