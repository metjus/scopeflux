# DomainRadar — Cloudflare export

Samostatná anglická stránka na sledovanie domén pred očakávaným uvoľnením, historických pozorovaní a ľubovoľnej konkrétnej domény. Tento balík je pripravený pre **Cloudflare Workers + D1**. Cloudflare Workers sa nasadzuje cez Wrangler alebo Git; súbory sa nenahrávajú cez FTP ani iba cez Pages „Upload assets“.

## Čo balík obsahuje

- Zdrojový kód a zostavený Worker v `dist/server`, statické súbory v `dist/client`.
- TLD filtre `.sk`, `.com`, `.net`, `.org`, `.io`, `.app`, `.ai`, `.eu`, 7/30 dní, vyhľadávanie, name-quality filtre a CSV.
- Kontrolu ľubovoľnej platnej domény cez dostupné registre; bez časového limitu na budúcu expiráciu.
- Uložené verejné zdrojové náhľady: **8 512 upcoming** a **1 352 historických pozorovaní** pri exporte 15. 10. 2026. Presné časy získania sú v `data/manifest.json`, nie sú prepísané časom exportu.
- Prázdnu osobnú watchlist databázu. Údaje účtov ani prihlasovacie údaje z pôvodnej stránky sa neexportujú.
- Voliteľné Cloudflare Access prihlásenie, vlastný chránený updater a dva vypnuté bloky Google AdSense.

Katalóg nie je úplný zoznam všetkých domén na internete. Niektoré zdroje poskytujú iba verejný náhľad. Expirácia, plánované uvoľnenie a potvrdená registrácia sú odlišné údaje. Dátum uvoľnenia nie je zárukou dostupnosti. Presná hodina sa nezobrazuje, ak ju zdroj nepublikuje.

## Nasadenie na scopeflux.io (aktuálne nastavenie)

Repozitár `metjus/scopeflux` je napojený na Cloudflare Worker **scopeflux** (Workers Builds). Každá zmena v `main` sa nasadí sama.

- Cloudflare → Workers & Pages → scopeflux → Settings → Build:
  - **Build command:** `npx -y pnpm@11.25.0 install --frozen-lockfile && npx -y pnpm@11.25.0 run build`
  - **Deploy command:** `npx wrangler deploy` (build zanechá `.wrangler/deploy/config.json`, takže Wrangler nasadí zostavený `dist/server`)
- Databáza: existujúca D1 `scopeflux` (binding `DB`). Tabuľky sa vytvoria samy pri prvej požiadavke (`lib/schema.ts`), migrácie netreba spúšťať ručne.
- Počiatočné dáta (`data/catalog-seed.sql`) sa nenahrávajú automaticky. Katalóg sa plní zo zdrojov pri návštevách a cronom (`10 * * * *`); .ai/.eu a história potrebujú updater z kapitoly 5.
- `dist/` je výstup buildu a nie je v gite.

Nasledujúce kapitoly popisujú pôvodný ručný postup (vlastný Worker, vlastná D1).

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

Katalóg a kontrola domény fungujú bez účtu. Watchlist potrebuje Cloudflare Access; samostatný balík nepoužíva ChatGPT prihlásenie.

1. V Cloudflare Zero Trust vytvor **Access → Applications → Self-hosted** aplikáciu pre `tvoj-hostname/account/*` a nastav pravidlo, kto sa smie prihlásiť. Pre súkromnú celú stránku chráň celý hostname namiesto samotnej cesty.
2. Skopíruj Application Audience (AUD). Do `wrangler.json` → `vars` vlož `ACCESS_TEAM_DOMAIN` v tvare `https://tvoj-team.cloudflareaccess.com` a `ACCESS_AUD`.
3. Znovu zostav/nasaď. Odkaz **Sign in** prejde cez `/account/login` a po overení sa vráti do katalógu. Odhlásenie je `/account/logout`.
4. Skontroluj, že aplikácia Access zahŕňa nasadený hostname aj každú alternatívnu adresu, ktorú používaš.

Worker kontroluje podpis RS256, issuer, audience a platnosť Access JWT. Identitu nepreberá z používateľom poslaného ID ani e-mailového headera. Watchlist je oddelený podľa overeného `sub`. Bez Access konfigurácie sa používateľ neprihlási; ostatné časti stránky fungujú.

Dokumentácia: [Access JWT](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

## 5. Automatické aktualizácie

Prečítaj **CATALOG_UPDATES.md**. Sú potrebné dve cesty:

- Cloudflare cron v `wrangler.json` načítava verejný Backorder.sk a Dynadot a archivuje pozorovania.
- Priložený GitHub Actions workflow aktualizuje verejné `.ai`/`.eu` náhľady a historické príklady ExpiredDomains.net z prostredia mimo Workeru. Poskytovatelia môžu Worker požiadavky blokovať.

Nový hostname nepreberá updater pôvodnej ChatGPT stránky. Bez nastavenia updatera budú exportované údaje postupne starnúť. `.ai` a `.eu` snapshoty v tomto exporte pochádzajú z **15. 10. 2026, 11:12 UTC**; pri exporte poskytovateľ ich ďalšie načítanie odmietal. Predchádzajúce dáta sú zachované a stránka ukazuje vek zdroja.

Pri verejnom nasadení nastav podľa očakávanej návštevnosti Cloudflare rate limiting pre `/api/domains?domain=...` a watchlist refresh, aby požiadavky návštevníkov zbytočne nezaťažovali registre.

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

Testy pokrývajú filtre všetkých TLD, 30 dní, históriu, parsery, databázu, watchlist izoláciu, Access JWT, ochranu updatera a import veľkého feedu. Skutočné reklamné požiadavky sa v testoch neposielajú. Overenie v reálnom prehliadači a v tvojom Cloudflare/AdSense účte je potrebné po nasadení.

Zdrojová štruktúra: `app/` UI a API, `lib/` registre/katalóg/filtre/autentifikácia, `worker.ts` vstup Workeru a cron, `migrations/` D1 schéma, `data/` počiatočné verejné snapshoty, `scripts/` updater a nasadenie.
