import {lookup, normalizeDomain} from './domains.ts';
import type {DomainRecord} from './domains';
import {scheduledRelease} from './catalog.ts';

import {withReleaseEstimate} from './domain-details.ts';

// A failed registration check must not hide a known source-listed release.
// Failed checks stay explicit; none of these fallbacks assert availability.
export async function checkDomain(input: string, db?: D1Database): Promise<DomainRecord> {
  const domain = normalizeDomain(input), attemptedAt = new Date().toISOString();
  const [current, saved] = await Promise.allSettled([lookup(domain), scheduledRelease(domain, db)]);
  const schedule = saved.status === 'fulfilled' ? saved.value : null;
  if (current.status === 'fulfilled') return withReleaseEstimate(current.value, schedule);
  const reason = current.reason instanceof Error ? current.reason.message : 'The registration source is currently unavailable.';
  if (schedule) return {...schedule, status: 'Unverified', checkError: reason, checkAttemptedAt: attemptedAt,
    availabilitySource: schedule.source, availabilityUrl: schedule.sourceUrl, availabilityCheckedAt: schedule.checkedAt,
    note: 'The current registration check failed. The saved source release estimate is still shown with its original retrieval time. This does not confirm availability.'};
  const tld = domain.split('.').at(-1)!;
  return {domain, tld, status: 'Unverified', expiration: null, drop: null, checkedAt: attemptedAt,
    checkError: reason, checkAttemptedAt: attemptedAt, source: 'Registry reference', sourceUrl: 'https://www.iana.org/domains/root/db/' + tld + '.html',
    note: 'The current registration source could not be reached. Use the registry reference for a manual check. No expiration or release date has been inferred.'};
}

