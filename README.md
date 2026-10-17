# DomainRadar — Cloudflare export

Samostatná anglická stránka na sledovanie domén pred očakávaným uvoľnením, historických pozorovaní a ľubovoľnej konkrétnej domény. Tento balík je pripravený pre **Cloudflare Workers + D1**. Cloudflare Workers sa nasadzuje cez Wrangler alebo Git; súbory sa nenahrávajú cez FTP ani iba cez Pages „Upload assets“.

## Čo balík obsahuje

- Zdrojový kód a zostavený Worker v `dist/server`, statické súbory v `dist/client`.
- TLD filtre `.sk`, `.com`, `.net`, `.org`, `.io`, `.app`, 7/30 dní, vyhľadávanie, name-quality filtre a CSV.
- Kontrolu ľubovoľnej platnej domény cez dostupné registre; bez časového limitu na budúcu expiráciu.
- Uložené verejné zdrojové náhľady: **8 512 upcoming** a **1 352 historických pozorovaní** pri exporte 15. 10. 2026. Presné časy získania sú v `data/manifest.json`, nie sú prepísané časom exportu.
- Prázdnu osobnú watchlist databázu. Údaje účtov ani prihlasovacie údaje z pôvodnej stránky sa neexportujú.
- Prihlásenie cez Google (voliteľné), watchlist v prehliadači aj v účte, vlastný chránený updater a dva vypnuté bloky Google AdSense.

Katalóg nie je úplný zoznam všetkých domén na internete. Niektoré zdroje poskytujú iba verejný náhľad. Expirácia, plánované uvoľnenie a potvrdená registrácia sú odlišné údaje. Dátum uvoľnenia nie je zárukou dostupnosti. Presná hodina sa nezobrazuje, ak ju zdroj nepublikuje.

## Nasadenie na scopeflux.io (aktuálne nastavenie)

Repozitár `metjus/scopeflux` je napojený na Cloudflare Worker **scopeflux** (Workers Builds). Každá zmena v `main` sa nasadí sama.

- Cloudflare → Workers & Pages → scopeflux → Settings → Build:
  - **Build command:** `npx -y pnpm@11.25.0 install --frozen-lockfile && npx -y pnpm@11.25.0 run build`
  - **Deploy command:** `npx wrangler deploy` (build zanechá `.wrangler/deploy/config.json`, takže Wrangler nasadí zostavený `dist/server`)
- Databáza: existujúca D1 `scopeflux` (binding `DB`). Tabuľky sa vytvoria samy pri prvej požiadavke (`lib/schema.ts`), migrácie netreba spúšťať ručne.
- Počiatočné dáta (`data/catalog-seed.sql`) sa nenahrávajú automaticky. Katalóg sa plní zo zdrojov pri návštevách a cronom (`*/15 * * * *`); „Recently expired“ sa plní z vlastného archívu, keď dátum uvoľnenia uplynie.
- `dist/` je výstup buildu a nie je v gite.

Nasledujúce kapitoly popisujú pôvodný ručný postup (vlastný Worker, vlastná D1).

## SEO a súbory pre vyhľadávače

- Stránky s vlastnou adresou: `/`, `/check-domain`, `/sources`, `/about`, `/privacy`, `/contact`. Titulky a popisy sú v `lib/seo.ts`, adresy v `lib/navigation.ts` (`PAGE_PATHS`).
- Spoločné meta tagy, Open Graph, Twitter karta a štruktúrované dáta (JSON-LD) sú v `app/layout.tsx`.
- `public/`: `robots.txt`, `sitemap.xml` (pri novej stránke ju doplň), `llms.txt` (zhrnutie pre AI asistentov), `site.webmanifest`, ikony, `og-image.png` (náhľad pri zdieľaní) a `.well-known/security.txt`.
- Súkromná stavová stránka: `/status` len na adrese `*.workers.dev`, s heslom v secrete `STATUS_PASSWORD`.

## 1. Príprava

Nainštaluj Node.js **24 LTS** a rozbaľ celý priečinok. V termináli v tomto priečinku spusti:

```sh
npx pnpm@11.25.0 install --frozen-lockfile
npx pnpm@11.25.0 exec wrangler login
npx pnpm@11.25.0 run db:create
```

Z výstupu vytvorenia databázy skopíruj skutočné `database_id` do `wrangler.json` namiesto `00000000-0000-4000-8000-000000000000`. Zachovaj binding **DB**. Názov Workeru môžeš zmeniť cez `name`.

Pre pravidelné načítavanie všetkých zdrojov odporúčame Workers Paid; SSR, väčší katalóg a cron môžu prekročiť CPU alebo počet databázových dotazov bezplatného plánu. Aktuálne limity: [Workers](https://developers.cloudflare.com/workers/platform/limits/), [D1](https://developers.cloudflare.com/d1/platform/limits/). Balík používa malé časti JSON, aby veľký `.sk` feed neprekročil limit D1 na riadok, a SQL príkazy pod 100 KB.

## 2. Databáza a prvé dáta

```sh
npx pnpm@11.25.0 run db:migrate
npx pnpm@11.25.0 run db:seed
```

Migrácie vytvoria tabuľky. Seed importuje verejné pozorovania, zachová zdrojové dátumy a nevkladá watchlisty. Pred opätovným importom do používanej databázy urob zálohu; seed je určený na počiatočné naplnenie.

## 3. Nasadenie

Najjednoduchšie je znovu zostaviť so svojou konfiguráciou:

```sh
npx pnpm@11.25.0 run check
npx pnpm@11.25.0 run test
npx pnpm@11.25.0 run build
npx pnpm@11.25.0 run deploy:ready
```

`deploy:ready` prevezme tvoje D1 ID a premenné z koreňového `wrangler.json`, doplní ich do zostavenej konfigurácie a spustí Wrangler. Môže použiť aj priložený overený `dist` bez buildu, pokiaľ nemeníš zdrojový kód alebo AdSense konfiguráciu. Pri zmene kódu je nový build povinný.

Overenie bez nasadenia:

```sh
npx pnpm@11.25.0 run deploy:ready -- --dry-run
```

Wrangler zobrazí URL tvojho Workeru. V Cloudflare Workers → Settings → Domains & Routes môžeš pridať vlastnú doménu. Tento export nebol nasadený do tvojho Cloudflare účtu.

**Viditeľnosť:** samostatný Worker je po nasadení štandardne verejný. Ak má zostať iba pre teba, pred jeho sprístupnením chráň celý hostname cez Cloudflare Access a vypni alebo rovnako chráň alternatívny `workers.dev` endpoint. Pôvodná ChatGPT stránka týmto exportom nemení svoju viditeľnosť.

## 4. Prihlásenie a watchlist

Katalóg a kontrola domény fungujú bez účtu. Watchlist funguje aj bez účtu: domény sa uložia len v prehliadači. Po prihlásení cez Google sa presunú do účtu a sú dostupné na všetkých zariadeniach.

Nastavenie prihlásenia cez Google (jednorazovo):

1. [Google Cloud Console](https://console.cloud.google.com/) → nový projekt (napr. ScopeFlux) → **APIs & Services → OAuth consent screen**: typ **External**, názov ScopeFlux, support email, logo voliteľné, publikovať (**Publish app**).
2. **APIs & Services → Credentials → Create credentials → OAuth client ID** → typ **Web application**.
   - Authorized JavaScript origins: `https://scopeflux.io`
   - Authorized redirect URIs: `https://scopeflux.io/account/callback` (pre test aj `https://scopeflux.<účet>.workers.dev/account/callback`)
3. Cloudflare → Workers → scopeflux → **Settings → Variables and Secrets** → pridaj dve položky typu **Secret**: `GOOGLE_CLIENT_ID` a `GOOGLE_CLIENT_SECRET`. (Typ Secret, aby ich ďalšie nasadenie nezmazalo.)

Prihlásenie: `/account/login` → Google → `/account/callback`. Worker overí `state` a `nonce`, vymení kód za ID token priamo u Google, skontroluje issuer, audience, platnosť a overený email a nastaví podpísané HttpOnly cookie `sf_session` na 30 dní. Kľúč na podpis sa odvodzuje z `GOOGLE_CLIENT_SECRET`. Heslá sa neukladajú. Identita sa nikdy neberie z hlavičiek poslaných prehliadačom. Účet a watchlist sa dajú zmazať v menu účtu (`DELETE /api/account`). Bez týchto dvoch hodnôt je prihlásenie vypnuté a zvyšok stránky funguje.

Email upozornenia: šablóna je v `lib/alert-email.ts`; odosielanie sa pridá neskôr.

## 5. Automatické aktualizácie

Cloudflare cron (`*/15 * * * *`, UTC) načítava verejné zoznamy Backorder.sk (.sk), CZ.NIC (.cz) a Dynadot (.com, .net, .org, .io, .app, .info, .co, .me, .xyz, .biz, .us, .pro, .cc, .tv); naraz obnoví najviac 5 najstarších zoznamov (limit D1 na free pláne) a archivuje pozorovania; z archívu vzniká „Recently expired“.

`.ai` a `.eu` boli z katalógu odstránené (október 2026): ich jediný zdroj (Backorder.com) blokuje požiadavky z Cloudflare a pôvodný externý updater (GitHub Actions + ExpiredDomains.net) sťahoval stránky, ktoré to v podmienkach zakazujú. Jednotlivé `.ai`/`.eu` domény sa dajú stále overiť cez „Check domain“ (RDAP).

## 6. Google AdSense

Dva responzívne bloky sú pripravené nad výsledkami a pod nimi, označené **Advertisement**. Sú vypnuté, preto nevytvárajú prázdne miesto ani neposielajú požiadavky Google. Pri blokovaní reklamy sa katalóg používa ďalej.

1. Pridaj vlastný nasadený hostname do svojho AdSense účtu a dokonči overenie/schválenie podľa AdSense.
2. Vytvor dve responzívne display jednotky. V `lib/ads-config.ts` vyplň vlastné `publisherId` (`ca-pub-` + 16 číslic) a `slots.top`, `slots.bottom`. Nastav `enabled: true`. `preview: true` slúži iba na lokálny náhľad rozloženia bez reklám; pred ostrým nasadením ho vypni.
3. Priprav publikované zásady ochrany súkromia a nastavenie súhlasu s reklamami. Pre personalizované reklamy v EHP, Spojenom kráľovstve a Švajčiarsku Google vyžaduje certifikovanú CMP integrovanú s TCF. Samotný JavaScript flag nižšie CMP nenahrádza.
4. Integrácia zvolenej CMP po platnom súhlase nastaví `window.domainradarAdConsent = true` a odošle `window.dispatchEvent(new Event('domainradar:ad-consent'))`. Až potom sa načíta AdSense skript. Pri odvolaní nastaví flag `false`, odošle tú istú udalosť a obnoví stránku, aby zastavila už načítaný reklamný skript. Udalosť sa nemá spúšťať automaticky pri návšteve.
5. Skopíruj presný `ads.txt` z tvojho AdSense účtu do `public/ads.txt`. Balík nevkladá cudzie ani vymyslené publisher ID. Po nasadení over `https://tvoja-domena/ads.txt`.
6. Spusti nový build a `deploy:ready`. Over displej na mobile a v nastavení AdSense; reklamy sa môžu zobraziť až po schválení a naplnení jednotky.

V súčasnom balíku **nie je aktívna reklamná jednotka ani konkrétna CMP**. Chýbajú tvoje AdSense ID a výber CMP. Nepredpokladá sa schválenie webu Google.

Oficiálne návody: [AdSense kód](https://support.google.com/adsense/answer/9274019), [display jednotky](https://support.google.com/adsense/answer/9274025), [ads.txt](https://support.google.com/adsense/answer/12171612), [CMP požiadavky](https://support.google.com/adsense/answer/13554116).

## Vývoj a overenie

```sh
npx pnpm@11.25.0 run dev
```

Lokálne migrácie môžeš aplikovať pomocou `npx pnpm@11.25.0 exec wrangler d1 migrations apply DB --local --config wrangler.json`. `db:migrate` a `db:seed` v skriptoch cielia na **remote** databázu.

Testy pokrývajú filtre všetkých TLD, 30 dní, históriu, parsery, databázu, watchlist izoláciu, prihlásenie cez Google, ochranu updatera a import veľkého feedu. Skutočné reklamné požiadavky sa v testoch neposielajú. Overenie v reálnom prehliadači a v tvojom Cloudflare/AdSense účte je potrebné po nasadení.

Zdrojová štruktúra: `app/` UI a API, `lib/` registre/katalóg/filtre/autentifikácia, `worker.ts` vstup Workeru a cron, `migrations/` D1 schéma, `data/` počiatočné verejné snapshoty, `scripts/` updater a nasadenie.
