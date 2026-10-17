import {historicalDate} from '../lib/public-history';
import type {DomainRecord} from '../lib/domains';
import type {FeedInfo} from '../lib/catalog';

type CoverageProps = {records: DomainRecord[]; feeds: FeedInfo[]; tlds: string[]; recent: boolean; period: string};

function day(value: string): string {
  return new Date(value.length === 10 ? value + 'T12:00:00' : value).toLocaleDateString('en-GB', {day: 'numeric', month: 'short'});
}
function updated(value: string): string {
  const at = new Date(value);
  return at.toDateString() === new Date().toDateString()
    ? at.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'})
    : at.toLocaleDateString('en-GB', {day: 'numeric', month: 'short'});
}

// One short line per chosen extension, plus a quiet note when a source failed.
// Without a chosen extension the list is a preview of every extension, so only
// the failure note can appear (counts and date ranges of a preview mislead).
export default function CatalogueCoverage({records, feeds, tlds, recent}: CoverageProps) {
  const affected = feeds.filter(feed => (!tlds.length || tlds.includes(feed.tld)) && (feed.error || feed.refreshError));
  const missing = recent ? tlds.filter(tld => !records.some(record => record.tld === tld)) : [];
  if (!tlds.length && !affected.length) return null;
  return (
    <div className="catalogue-coverage" aria-label="Loaded data coverage">
      {tlds.length > 0 && <ul className="coverage-lines">{tlds.map(tld => {
        const rows = records.filter(record => record.tld === tld);
        const dates = rows.map(record => recent ? historicalDate(record) : record.drop).filter((value): value is string => Boolean(value)).sort();
        const feed = feeds.find(item => item.tld === tld);
        const span = dates.length ? (recent ? 'since ' + day(dates[0]) : 'until ' + day(dates[dates.length - 1])) : '';
        return <li key={tld}><strong>.{tld}</strong>: {rows.length.toLocaleString('en-GB')} {recent ? 'archived' : rows.length === 1 ? 'listing' : 'listings'}{span && ' · ' + span}{feed?.checkedAt && ' · updated ' + updated(feed.checkedAt)}</li>;
      })}</ul>}
      {missing.length > 0 && <p>No saved past release observations for {missing.map(tld => '.' + tld).join(', ')} yet. This does not mean those domains are available.</p>}
      {affected.length > 0 && <details className="source-warnings">
        <summary>{affected.some(feed => feed.error && !feed.refreshError) ? 'Some lists could not be loaded right now.' : 'Some lists could not be refreshed right now; the last saved listings are shown.'}</summary>
        {affected.map(feed => <p key={feed.tld}>.{feed.tld}: {feed.refreshError ? `Showing the last successful snapshot from ${new Date(feed.checkedAt).toLocaleString('en-GB')}. ` : ''}{feed.refreshError || feed.error}</p>)}
      </details>}
    </div>
  );
}
