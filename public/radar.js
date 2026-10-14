import { COUNTRIES, csvCell } from './model.js';

const countries = new Set(COUNTRIES);
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
export const MAX_CHECKS_PER_MARKET = 12;
export const MAX_CHECKS = 60;
export const topicKey = (country, title) =>
  country + '|' + title.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
export const exploreTopicUrl = (country, title) =>
  'https://trends.google.com/trends/explore?geo=' +
  encodeURIComponent(country) +
  '&q=' +
  encodeURIComponent(title);

export function observation(feed) {
  if (
    !feed ||
    feed.provider !== 'google-trending-rss' ||
    !countries.has(feed.country) ||
    !validTime(feed.fetchedAt) ||
    !Array.isArray(feed.items) ||
    feed.items.length > 30
  )
    throw new Error('Invalid Radar observation.');
  const seen = new Set();
  const items = feed.items.flatMap(item => {
    if (
      !item ||
      typeof item.title !== 'string' ||
      !item.title.trim() ||
      item.title.length > 1000 ||
      !(
        item.trafficBucket === null ||
        (typeof item.trafficBucket === 'string' &&
          /^[\d,.]+\s*[KMB]?\+?$/i.test(item.trafficBucket))
      ) ||
      !(item.publishedAt === null || validTime(item.publishedAt))
    )
      throw new Error('Invalid Radar topic.');
    const key = topicKey(feed.country, item.title);
    if (seen.has(key)) return [];
    seen.add(key);
    return [
      {
        title: item.title.trim(),
        trafficBucket: item.trafficBucket,
        publishedAt: item.publishedAt === null ? null : new Date(item.publishedAt).toISOString(),
      },
    ];
  });
  return {
    provider: feed.provider,
    country: feed.country,
    fetchedAt: new Date(feed.fetchedAt).toISOString(),
    items,
  };
}

function retain(checks) {
  const counts = new Map();
  return [...checks]
    .sort((a, b) => Date.parse(b.fetchedAt) - Date.parse(a.fetchedAt))
    .filter(check => {
      const count = counts.get(check.country) ?? 0;
      counts.set(check.country, count + 1);
      return count < MAX_CHECKS_PER_MARKET;
    })
    .slice(0, MAX_CHECKS)
    .reverse();
}

export function restoreChecks(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set(),
    checks = [];
  for (const value of raw.slice(-MAX_CHECKS)) {
    try {
      const check = observation(value),
        key = check.country + '|' + check.fetchedAt;
      if (!seen.has(key)) {
        seen.add(key);
        checks.push(check);
      }
    } catch {
      /* Discard corrupt local observations without losing other work. */
    }
  }
  return retain(checks);
}

export function recordCheck(checks, feed) {
  const current = observation(feed);
  const latest = checks.filter(check => check.country === current.country).at(-1);
  if (latest && Date.parse(latest.fetchedAt) >= Date.parse(current.fetchedAt)) return checks;
  return retain([...checks, current]);
}

export function feedChanges(checks, feed, compareAt = null) {
  const current = observation(feed);
  const earlier = checks.filter(
    check =>
      check.country === current.country &&
      Date.parse(check.fetchedAt) < Date.parse(current.fetchedAt),
  );
  const previous = compareAt
    ? earlier.find(check => check.fetchedAt === compareAt)
    : (earlier.at(-1) ?? null);
  if (compareAt && !previous)
    throw new Error('The selected comparison check is unavailable for this market.');
  const prior = new Map(
    (previous?.items ?? []).map(item => [topicKey(current.country, item.title), item]),
  );
  const known = new Set(
    earlier
      .filter(check => !previous || Date.parse(check.fetchedAt) <= Date.parse(previous.fetchedAt))
      .flatMap(check => check.items.map(item => topicKey(check.country, item.title))),
  );
  const present = new Set(current.items.map(item => topicKey(current.country, item.title)));
  const items = current.items.map(item => {
    const key = topicKey(current.country, item.title),
      before = prior.get(key);
    return {
      ...item,
      status: !previous ? 'baseline' : before ? 'continuing' : known.has(key) ? 'returning' : 'new',
      previousBucket: before?.trafficBucket ?? null,
      bucketChanged: Boolean(
        before &&
          before.trafficBucket !== null &&
          item.trafficBucket !== null &&
          before.trafficBucket !== item.trafficBucket,
      ),
    };
  });
  const missing = (previous?.items ?? [])
    .filter(item => !present.has(topicKey(current.country, item.title)))
    .map(item => ({
      ...item,
      status: 'not-listed',
      previousBucket: item.trafficBucket,
      bucketChanged: false,
    }));
  return {
    previous,
    current,
    items,
    missing,
    counts: {
      new: items.filter(item => item.status === 'new').length,
      returning: items.filter(item => item.status === 'returning').length,
      continuing: items.filter(item => item.status === 'continuing').length,
      missing: missing.length,
    },
  };
}

export function restoreTopics(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw.slice(0, 50).flatMap(item => {
    if (
      !item ||
      !countries.has(item.country) ||
      typeof item.title !== 'string' ||
      !item.title.trim() ||
      item.title.length > 1000 ||
      !validTime(item.savedAt)
    )
      return [];
    const key = topicKey(item.country, item.title);
    if (seen.has(key)) return [];
    seen.add(key);
    return [
      {
        country: item.country,
        title: item.title.trim(),
        savedAt: new Date(item.savedAt).toISOString(),
      },
    ];
  });
}

export function topicObservations(topic, checks) {
  const key = topicKey(topic.country, topic.title);
  const trail = checks
    .filter(check => check.country === topic.country)
    .map(check => {
      const item = check.items.find(item => topicKey(check.country, item.title) === key);
      return {
        checkedAt: check.fetchedAt,
        present: Boolean(item),
        trafficBucket: item?.trafficBucket ?? null,
      };
    });
  const seen = trail.filter(check => check.present);
  const latest = trail.at(-1) ?? null,
    previous = trail.at(-2) ?? null;
  const status = !latest
    ? 'unobserved'
    : !latest.present
      ? 'not-listed'
      : !previous
        ? 'baseline'
        : previous.present
          ? 'continuing'
          : seen.length > 1
            ? 'returning'
            : 'new';
  const bucketChanged = Boolean(
    latest?.present &&
      previous?.present &&
      latest.trafficBucket !== null &&
      previous.trafficBucket !== null &&
      latest.trafficBucket !== previous.trafficBucket,
  );
  return {
    trail,
    status,
    previous,
    bucketChanged,
    firstSeen: seen[0]?.checkedAt ?? null,
    lastSeen: seen.at(-1)?.checkedAt ?? null,
    appearances: seen.length,
    totalChecks: trail.length,
    latest: trail.at(-1) ?? null,
    lastBucket: seen.at(-1)?.trafficBucket ?? null,
  };
}

export function exportChecks(checks) {
  const rows = [
    [
      'country',
      'retrieved_at',
      'topic',
      'traffic_bucket',
      'feed_published_at',
      'data_source',
      'record_type',
    ],
  ];
  for (const check of checks) {
    if (!check.items.length)
      rows.push([
        check.country,
        check.fetchedAt,
        '',
        '',
        '',
        check.provider,
        'EMPTY_FEED_OBSERVATION',
      ]);
    for (const item of check.items)
      rows.push([
        check.country,
        check.fetchedAt,
        item.title,
        item.trafficBucket ?? '',
        item.publishedAt ?? '',
        check.provider,
        'TOPIC_LISTED_IN_FEED',
      ]);
  }
  return '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}

export function filterRadar(changes, { view = 'all', query = '', sort = 'feed', saved = [] } = {}) {
  const savedKeys = new Set(saved.map(topic => topicKey(topic.country, topic.title)));
  const term = query.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
  const rows =
    view === 'not-listed'
      ? changes.missing
      : changes.items.filter(
          item =>
            view === 'all' ||
            (view === 'saved' && savedKeys.has(topicKey(changes.current.country, item.title))) ||
            (view === 'bucket-changed' && item.bucketChanged) ||
            item.status === view,
        );
  const result = rows.filter(item =>
    item.title.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase().includes(term),
  );
  if (sort === 'recent')
    result.sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0));
  if (sort === 'name') result.sort((a, b) => a.title.localeCompare(b.title));
  return result;
}

export function exportRadarView(
  changes,
  items,
  { view = 'all', query = '', sort = 'feed', archived = false } = {},
) {
  const rows = [
    [
      'country',
      'snapshot_at',
      'comparison_at',
      'topic',
      'status',
      'traffic_bucket',
      'previous_bucket',
      'bucket_changed',
      'bucket_observed_at',
      'feed_published_at',
      'data_source',
      'record_type',
      'view',
      'search_filter',
      'sort',
    ],
    ...items.map(item => [
      changes.current.country,
      changes.current.fetchedAt,
      changes.previous?.fetchedAt ?? '',
      item.title,
      item.status,
      item.trafficBucket ?? '',
      item.previousBucket ?? '',
      item.bucketChanged,
      item.status === 'not-listed'
        ? (changes.previous?.fetchedAt ?? '')
        : changes.current.fetchedAt,
      item.publishedAt ?? '',
      changes.current.provider,
      archived ? 'LOCAL_RECORDED_CHECK' : 'LIVE_RSS_RETRIEVAL',
      view,
      query,
      sort,
    ]),
  ];
  return '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}
