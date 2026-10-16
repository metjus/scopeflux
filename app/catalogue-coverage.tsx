import {historicalDate} from '../lib/public-history';
import {Info} from 'lucide-react';
import type {DomainRecord} from '../lib/domains';
import type {FeedInfo} from '../lib/catalog';

type CoverageProps = {records: DomainRecord[]; feeds: FeedInfo[]; tlds: string[]; recent: boolean; period: string};

function date(value: string): string {
  return new Date(value.length === 10 ? value + 'T12:00:00' : value).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'});
}

export default function CatalogueCoverage({records, feeds, tlds, recent, period}: CoverageProps) {
  const selected = tlds.length ? tlds : [...new Set(records.map(record => record.tld))];
  const dates = records.filter(record => !tlds.length || tlds.includes(record.tld)).map(record => recent ? historicalDate(record) : record.drop).filter((value): value is string => Boolean(value)).sort();
  const affected = feeds.filter(feed => (!tlds.length || tlds.includes(feed.tld)) && (feed.error || feed.refreshError));
  return (
    <div className="catalogue-coverage" aria-label="Loaded data coverage">
      <p><Info size={15}/><span>{recent ? 'Saved history' : 'Loaded release dates'}: {dates.length ? `${date(dates[0])} – ${date(dates[dates.length - 1])}` : 'No dates loaded for this selection.'}</span></p>
      {recent ? <p>The archive retains up to 30 days of observations. Public deletion previews show at most 10 names per extension per refresh; older observations accumulate over time. This is not a complete deletion list.</p>
        : <p>{period === '30' ? 'Within 30 days includes today and the following 30 calendar days. ' : ''}Filters apply to loaded listings. Public previews may cover fewer days; load more source listings where offered.</p>}
      <div className="coverage-counts">{selected.map(tld => {
        const count = records.filter(record => record.tld === tld).length;
        return <span key={tld}>.{tld} · {count.toLocaleString('en-GB')} {recent ? 'archived' : 'loaded'}</span>;
      })}</div>
      {recent && selected.some(tld => !records.some(record => record.tld === tld)) && <p>No saved past release observations for {selected.filter(tld => !records.some(record => record.tld === tld)).map(tld => '.' + tld).join(', ')} yet. This does not mean those domains are available.</p>}
      {affected.length > 0 && <details className="source-warnings">
        <summary>{affected.some(feed => feed.error && !feed.refreshError) ? 'Some lists could not be loaded right now.' : 'Some lists could not be refreshed; saved listings are shown.'} Details</summary>
        {affected.map(feed => <p key={feed.tld}>.{feed.tld}: {feed.refreshError ? `Showing the last successful snapshot from ${new Date(feed.checkedAt).toLocaleString('en-GB')}. ` : ''}{feed.refreshError || feed.error}</p>)}
      </details>}
    </div>
  );
}
