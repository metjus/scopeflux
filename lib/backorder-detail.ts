import type {DomainRecord} from './domains';

const LIFECYCLE_URL = 'https://sk-nic.sk/wp-content/uploads/dokumenty/Pravidla_2024_01_01.pdf';

function text(html: string): string {
  return html.replace(/<[^>]*>/g, ' ')
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, code: string) => {
      const value = code.toLowerCase().startsWith('x') ? parseInt(code.slice(1), 16) : Number(code);
      return value <= 0x10ffff ? String.fromCodePoint(value) : '';
    })
    .replace(/&nbsp;/gi, ' ')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\s+/g, ' ').trim();
}

function dateOnly(value: string): string | null {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const local = value.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  const date = iso ? value : local ? `${local[3]}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}` : null;
  if (!date) return null;
  const parsed = new Date(date + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}

/** A conditional calendar date, never a source-published drop or a release hour. */
function conditionalRelease(expiration: string, today: string): string | null {
  // SK-NIC 4.5.2–4.5.3: 40 protected days after expiry; deletion the following day.
  const release = new Date(expiration + 'T00:00:00Z');
  release.setUTCDate(release.getUTCDate() + 41);
  const date = release.toISOString().slice(0, 10);
  return date >= today ? date : null;
}

export function parseBackorderDetail(html: string, domain: string, checkedAt: string): DomainRecord {
  const heading = text(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '').toLowerCase();
  if (heading !== domain) throw new Error('The source did not return a matching domain page. Please try again later.');

  // Read only the current record. History and neighbouring domains contain unrelated dates/statuses.
  const current = [...html.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/gi)]
    .map(match => match[0]).find(section => /<h2\b[^>]*>\s*Aktuálny záznam/i.test(section)) ?? '';
  const fields = new Map<string, string>();
  for (const row of current.matchAll(/<div\b[^>]*class="rec-row"[^>]*>([\s\S]*?)<\/div>/gi)) {
    const cells = [...row[1].matchAll(/<span\b[^>]*class="rec-(?:key|val)"[^>]*>([\s\S]*?)<\/span>/gi)];
    if (cells.length === 2) fields.set(text(cells[0][1]), text(cells[1][1]));
  }
  if (fields.has('Doména') && fields.get('Doména')?.toLowerCase() !== domain) {
    throw new Error('The source current record does not match the requested domain.');
  }

  const title = text(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
  const rawStatus = fields.get('Stav') ?? '';
  const active = /^(?:OK|DOM_OK)$/i.test(rawStatus);
  const held = !active && (/zadržaná|čaká na výmaz/i.test(title) || /redemption|pending.?delete|zadržaná|ochrann/i.test(rawStatus));
  const releaseMatch = held ? title.match(/výmaz\s+(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/i) : null;
  const drop = releaseMatch ? dateOnly(releaseMatch[1]) : null;
  const expiration = dateOnly(fields.get('Platná do') ?? '');
  const today = new Date(checkedAt).toLocaleDateString('en-CA', {timeZone: 'Europe/Bratislava'});
  const status = held ? 'Recovery period' : active ? (expiration && expiration < today ? 'Expired' : 'Registered') : 'Unverified';
  const estimate = !drop && expiration && status !== 'Unverified' ? conditionalRelease(expiration, today) : null;
  const verified = text(current).match(/overený\s+(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/i);

  if (!held && (!current || !fields.size)) throw new Error('The source did not return a readable current record. Please try again later.');
  return {
    domain, tld: 'sk', status, expiration, drop,
    source: 'Backorder.sk', sourceUrl: 'https://www.backorder.sk/domena/' + domain, checkedAt,
    sourceCheckedDate: verified ? dateOnly(verified[1]) : null,
    conditionalRelease: estimate,
    ...(estimate ? {lifecycleUrl: LIFECYCLE_URL} : {}),
    note: estimate
      ? 'Third-party registration data. Expiration is not availability. The conditional release estimate adds the SK-NIC 40-day protection period and the following deletion day to the reported expiration. It applies only if the holder does not renew or restore the domain. It is not a scheduled release; no release hour is known.'
      : drop
        ? 'Third-party data. The release date is published by Backorder.sk. The holder may still restore the domain. Availability and the exact registration time are not guaranteed.'
        : 'Third-party registration data. No release date has been confirmed. Expiration does not mean the domain will become available.',
  };
}
