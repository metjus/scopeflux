# Overenie exportu — 15. 10. 2026

- TypeScript kontrola: úspešná.
- Automatické testy: 57/57 úspešných.
- Vinext produkčný build: úspešný.
- Cloudflare Wrangler deploy --dry-run: úspešný, bez nasadenia.
- Import celého SQL seedu do SQLite a opakovaný import: úspešný.
- D1 maximálne veľkosti riadkov a SQL príkazov: overené testom veľkého slovenského feedu.
- Filtre 7/30 dní, všetkých 8 TLD, história, ľubovoľná doména a watchlist: testované v aplikačných/API testoch.
- Access JWT podpis, expirácia, issuer, audience, podvrhnuté ID a ochrana updatera: testované.
- Externý updater: overený v izolovanom procese s kontrolovanými odpoveďami vrátane výpadku zdroja a API readbacku.

Limity: v tomto exporte neprebehlo nasadenie do vášho Cloudflare účtu ani vizuálne testovanie v prehliadači. AdSense je vypnutý; neboli posielané živé reklamné požiadavky. Nastavenie vašej D1, Access, CMP a AdSense účtu treba overiť po konfigurácii podľa README.md.

Export obsahuje verejné pozorovania s pôvodnými časmi získania. Neobsahuje účty ani osobné watchlisty. .ai/.eu verejný zdroj pri exporte blokoval nové získanie; zachované sú posledné úspešné snapshoty z 15. 10. 2026 11:12 UTC.
