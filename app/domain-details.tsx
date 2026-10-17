'use client';

import {Bookmark, ExternalLink, Info, RefreshCw, X} from 'lucide-react';
import type {DomainRecord} from '../lib/domains';
import type {assessPremium} from '../lib/premium';
import {statusInfo} from '../lib/status';
import {calendarDaysFromToday} from '../lib/release-time';

type DomainDetailsProps = {
  record: DomainRecord;
  premium: ReturnType<typeof assessPremium>;
  saved: boolean;
  busy: boolean;
  checking: boolean;
  archived: boolean;
  releaseCountdown: string;
  onClose: () => void;
  onSave: () => void;
};

function formatDate(value?: string | null): string {
  if (!value) return '—';
  return new Date(value.length === 10 ? value + 'T12:00:00' : value).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export default function DomainDetails({record, premium, saved, busy, checking, archived, releaseCountdown, onClose, onSave}: DomainDetailsProps) {
  const conditional = !record.drop && record.conditionalRelease;
  const release = record.drop || conditional;
  const expirationDays = calendarDaysFromToday(record.expiration);
  const releaseDisplay = !release ? 'Not confirmed' : release.length === 10
    ? formatDate(release)
    : new Date(release).toLocaleString('en-GB', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});

  return (
    <div className="detail">
      <button className="close icon-button" aria-label="Close detail" onClick={onClose}><X size={22}/></button>
      <span className="eyebrow">DOMAIN DETAILS</span>
      <h2 id="domain-detail-title">{record.domain}</h2>
      <span className="status"><i/>{record.status}</span>
      {checking && <p role="status" className="detail-status-help"><RefreshCw size={14} className="spin"/> Checking current registration…</p>}
      {record.checkError && <div className="feed-notice" role="status"><strong>Current registration check unavailable.</strong> {record.checkError} {record.drop ? 'The saved release estimate is still shown.' : 'Use the registry link below for a manual check.'}</div>}
      <p className="detail-status-help">{statusInfo(record.status).description}</p>
      <section className="premium-detail" aria-label="Name quality assessment">
        <strong>{premium.candidate ? 'Premium potential' : 'Name quality'}</strong>
        <p>{premium.reason}</p>
        <small>Estimated by name rules. Registry premium pricing and resale value are not verified.</small>
      </section>
      <div className="detail-grid">
        <div>
          <span>Expiration</span>
          <strong>{formatDate(record.expiration)}</strong>
          {expirationDays !== null && <small>{expirationDays > 0 ? `${expirationDays} days until expiration` : expirationDays === 0 ? 'Expiration date is today' : 'Reported expiration date has passed'}</small>}
        </div>
        <div>
          <span>Expected availability</span>
          <strong>{releaseDisplay}</strong>
          {conditional && <small>If not renewed · lifecycle estimate</small>}
          {record.drop && <small>{record.drop.length === 10 ? 'Source estimate · hour not published' : 'Source estimate · local time'}</small>}
        </div>
        {record.listedDate && <div><span>{archived ? 'Archived release estimate' : 'Listed date'}</span><strong>{formatDate(record.listedDate)}</strong></div>}
        <div><span>{record.checkError&&!record.drop?'Last check attempt':'Last retrieval'}</span><strong>{new Date(record.checkedAt).toLocaleString('en-GB')}</strong></div>
        {record.sourceCheckedDate && <div><span>Source record verified on</span><strong>{formatDate(record.sourceCheckedDate)}</strong></div>}
      </div>
      {record.checkAttemptedAt && record.drop && <p className="detail-status-help">Last registration attempt: {new Date(record.checkAttemptedAt).toLocaleString('en-GB')}</p>}
      {record.reportedDrop && <section className="release-proof" aria-label="Historical deletion report">
        <strong>Source-reported deletion: {new Date(record.reportedDrop.at).toLocaleString('en-GB')}</strong>
        <p>Historical report; current availability is not confirmed.</p>
        <small>Source label: {record.reportedDrop.label} (UTC). Retrieved {new Date(record.reportedDrop.checkedAt).toLocaleString('en-GB')}.</small>
        <a href={record.reportedDrop.url} target="_blank" rel="noreferrer">{record.reportedDrop.source} public preview <ExternalLink size={13}/></a>
      </section>}
      <div className="detail-note"><Info size={19}/><p>{record.note}</p></div>
      {record.drop && <div className="release-proof">
        <strong>{releaseCountdown}</strong>
        {record.availabilityCheckedAt && <small>Release estimate retrieved {new Date(record.availabilityCheckedAt).toLocaleString('en-GB')}</small>}
        <a href={record.availabilityUrl || record.sourceUrl} target="_blank" rel="noreferrer">Release estimate: {record.availabilitySource || record.source} <ExternalLink size={13}/></a>
      </div>}
      {conditional && <div className="release-proof">
        <strong>Conditional estimate: {formatDate(conditional)}</strong>
        <p>Expiration + 40 protected days + the following deletion day. Renewal or restoration changes this estimate. The release hour is unknown.</p>
        <a href={record.lifecycleUrl} target="_blank" rel="noreferrer">SK-NIC lifecycle rules · 4.5.2–4.5.3 <ExternalLink size={13}/></a>
      </div>}
      <a className="source-link" href={record.sourceUrl} target="_blank" rel="noreferrer">{record.source} <ExternalLink size={15}/></a>
      <button className="primary" disabled={busy} onClick={onSave}>
        {checking ? <RefreshCw size={16} className="spin"/> : <Bookmark size={17}/>}
        {saved ? 'Update watchlist' : 'Add to watchlist'}
      </button>
    </div>
  );
}
