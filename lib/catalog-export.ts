import type {DomainRecord} from './domains';
import {assessPremium} from './premium.ts';

export function catalogueCsv(records: DomainRecord[]): string {
  const fields = ['Domain', 'TLD', 'Status', 'Expiration', 'Expected availability', 'Conditional release if not renewed', 'Listed date', 'Reported deletion', 'Deletion source', 'Deletion retrieval', 'Source', 'Checked', 'Release source', 'Release retrieval', 'Registration check error', 'Last check attempt', 'Premium potential', 'Name-quality reason'];
  const rows = records.map(record => {
    const quality = assessPremium(record.domain);
    return [record.domain, record.tld, record.status, record.expiration || '', record.drop || '', record.conditionalRelease || '', record.listedDate || '', record.reportedDrop?.at || '', record.reportedDrop?.url || '', record.reportedDrop?.checkedAt || '', record.source, record.checkedAt, record.availabilitySource || '', record.availabilityCheckedAt || '', record.checkError || '', record.checkAttemptedAt || '', quality.candidate ? 'Candidate' : 'No match', quality.reason];
  });
  return '\uFEFF' + [fields, ...rows].map(row => row.map(value => '"' + String(value).replace(/"/g, '""') + '"').join(';')).join('\r\n');
}
