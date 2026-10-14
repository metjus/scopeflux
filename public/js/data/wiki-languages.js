// Market -> Wikipedia language edition. Shared by the Worker (lib/wikipedia.mjs)
// and the browser, so both always agree on which markets are supported.
// Deliberately small and explicit: better to say "unsupported market" than to
// silently guess a wrong language. '' means Worldwide and uses English.
export const WIKI_LANGUAGES = {
  '': 'en',
  US: 'en',
  GB: 'en',
  AU: 'en',
  CA: 'en',
  IE: 'en',
  NZ: 'en',
  IN: 'en',
  ZA: 'en',
  SK: 'sk',
  CZ: 'cs',
  DE: 'de',
  AT: 'de',
  CH: 'de',
  FR: 'fr',
  BE: 'fr',
  ES: 'es',
  MX: 'es',
  AR: 'es',
  PT: 'pt',
  BR: 'pt',
  IT: 'it',
  NL: 'nl',
  PL: 'pl',
  JP: 'ja',
  KR: 'ko',
  CN: 'zh',
  TW: 'zh',
  RU: 'ru',
  UA: 'uk',
  TR: 'tr',
  SE: 'sv',
  NO: 'no',
  DK: 'da',
  FI: 'fi',
  GR: 'el',
  RO: 'ro',
  HU: 'hu',
  BG: 'bg',
  HR: 'hr',
  RS: 'sr',
};

// The markets offered in the v1 interface (see docs/v1-spec.md).
export const V1_MARKETS = ['', 'US', 'GB', 'DE', 'SK', 'CZ', 'FR', 'JP'];

const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });

// "English Wikipedia", "Slovak Wikipedia", ...
export function editionName(lang) {
  try {
    return languageNames.of(lang) + ' Wikipedia';
  } catch {
    return lang + '.wikipedia.org';
  }
}
