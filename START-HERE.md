# ScopeFlux na Cloudflare Free

Balík obsahuje aktuálny web, CSV import/export a serverové RSS načítanie.
Nasadenie ešte nebolo vykonané. Oficiálne Google a Bing API nie sú pripojené.
Voliteľný DataForSEO adaptér ostáva vypnutý.

## Nasadenie cez terminál
1. Nainštaluj Node.js 22 alebo novší z https://nodejs.org/.
2. Rozbaľ ZIP. Otvor terminál v priečinku, kde je package.json.
3. Spusti postupne:

```sh
npm install
npx wrangler login
npm run deploy
```

Prihlásenie sa otvorí v prehliadači. Vyber svoj Cloudflare účet.
Použi Workers Free; balík nepotrebuje platený plán, databázu ani R2.
Po deploy sa zobrazí dočasná adresa na workers.dev.

## Pripojenie domény
Cloudflare → Workers & Pages → scopeflux → Settings → Domains & Routes
→ Add → Custom Domain → scopeflux.io → Add Custom Domain.
Cloudflare vytvorí DNS a HTTPS certifikát. Doména musí mať aktívnu Cloudflare zónu.
Rovnakým postupom môžeš pridať www.scopeflux.io; je to samostatný názov.
Ak Cloudflare hlási konflikt existujúceho CNAME, skontroluj DNS tejto domény.
Nevytváraj A záznam s náhodnou IP adresou.

## Alternatíva: GitHub
Nahraj rozbalené súbory do vlastného GitHub repozitára.
V Cloudflare Workers & Pages vytvor Worker pripojením tohto repozitára.
Build command nechaj prázdny; deploy command: npx wrangler deploy.
Root directory: koreň repozitára, kde je wrangler.json.
Potom pridaj Custom Domain podľa postupu vyššie.

## Kontrola po nasadení
- Navigácia a mobilné menu; zmena témy v Exploreri.
- Radar: Slovensko a USA, obnovenie feedu a detail témy.
- CSV import, analýza a export so zachovanými hodnotami.
- /api/keyword vracia JSON s ready:false. Chýbajúce API nenahrádza dáta demom.

Staré údaje uložené v prehliadači sa na novú doménu automaticky neprenesú.
CSV môžeš znova importovať. Nie sú implementované účty ani cloudové používateľské úložisko.
Cloudflare verzia bude po nasadení verejná; nemá súkromné prihlásenie ChatGPT Sites.

## Free limity
Statické súbory: bezplatné neobmedzené požiadavky.
Worker/API: 100 000 požiadaviek denne a 10 ms CPU na požiadavku.
Čakanie na RSS nie je CPU čas. Skutočné využitie overíme po nasadení.
Externé platené API nie sú zahrnuté v bezplatnom hostingu.

https://developers.cloudflare.com/workers/platform/pricing/
https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
