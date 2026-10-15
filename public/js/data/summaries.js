// Plain-English sentences and text exports built from stored data.
import { summarize } from './statistics.js';

export function describeSeries(dataset) {
  const stats = summarize(dataset.records);
  const percent = value => Math.abs(value).toLocaleString('en', { maximumFractionDigits: 1 });
  const unit = dataset.unit || 'units';
  const latest = stats.latest.toLocaleString('en', { maximumFractionDigits: 2 });
  const change =
    stats.change === null
      ? 'A percentage change cannot be calculated because the previous average is zero.'
      : stats.change === 0
        ? 'The latest group of observations has the same average as the previous group.'
        : 'The latest ' +
          stats.window +
          ' observations average ' +
          percent(stats.change) +
          '% ' +
          (stats.change > 0 ? 'higher' : 'lower') +
          ' than the previous ' +
          stats.window +
          '.';
  return (
    'Latest value: ' +
    latest +
    ' ' +
    unit +
    '. ' +
    change +
    ' This describes the supplied data; it is not a prediction.'
  );
}

export function radarComparisonMessage(changes, market) {
  if (!changes.previous)
    return (
      'This is your first recorded check for ' +
      market +
      '. Save topics now and refresh later to compare. A dash means there is no earlier check yet.'
    );
  const counts = changes.counts;
  const changed = counts.new + counts.returning + counts.missing;
  const from = new Date(changes.previous.fetchedAt).toLocaleString('en');
  const to = new Date(changes.current.fetchedAt).toLocaleString('en');
  return (
    'Compared ' +
    from +
    ' with ' +
    to +
    ': ' +
    (changed === 0
      ? 'the topic list has not changed. Zeros mean no topics entered or left the list.'
      : counts.new +
        ' new, ' +
        counts.returning +
        ' returned and ' +
        counts.missing +
        ' missing topics.') +
    ' Missing means absent from this feed, not that the trend has ended.'
  );
}

const text = value =>
  String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
export function exportTopicBrief(changes, items, feed, market) {
  const lines = [
    'ScopeFlux — RSS topic brief',
    'Market: ' + text(market),
    'Retrieved: ' + changes.current.fetchedAt,
    'Compared with: ' + (changes.previous?.fetchedAt || 'No previous refresh'),
    'Source: Google public RSS',
    'View contains ' +
      items.length +
      ' topics. Traffic labels are source buckets, not exact counts.',
    'Feed presence is not an interest curve or a forecast.',
    '',
  ];
  for (const item of items) {
    lines.push(
      text(item.title),
      'Status: ' + text(item.status),
      'Source traffic label: ' + text(item.trafficBucket || 'Not supplied'),
    );
    const original = feed.items.find(
      topic => topic.title.toLowerCase() === item.title.toLowerCase(),
    );
    for (const article of original?.news || []) {
      try {
        const url = new URL(article.url);
        if (url.protocol !== 'https:' || url.username || url.password) continue;
        lines.push(
          '- ' + text(article.title) + ' (' + text(article.publisher) + ')',
          '  ' + url.href,
        );
      } catch {
        /* Invalid source links are omitted. */
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}
