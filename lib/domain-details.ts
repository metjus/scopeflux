import type {DomainRecord} from './domains';

export function withReleaseEstimate(record: DomainRecord, schedule: DomainRecord | null): DomainRecord {
  if (!schedule || record.drop) return record;
  return {...record, drop: schedule.drop, availabilitySource: schedule.availabilitySource || schedule.source,
    availabilityUrl: schedule.availabilityUrl || schedule.sourceUrl, availabilityCheckedAt: schedule.checkedAt};
}

export function mergeDomainDetails(current: DomainRecord, listed: DomainRecord): DomainRecord {
  const record = withReleaseEstimate(current, listed.reportedDrop || listed.status === 'Release estimate passed' ? null : listed);
  return {...record, reportedDrop: listed.reportedDrop,
    listedDate: listed.status === 'Release estimate passed' ? listed.drop : listed.listedDate,
    note: (listed.reportedDrop ? 'A public source reports a historical deletion; this is separate from the current registration check. ' : listed.status === 'Release estimate passed' ? 'Archived source release estimate: ' + listed.drop + '. ' : '') + (record.note || '')};
}
