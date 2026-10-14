export const PLANS = {
  free: { limit: 10, visible: 8, period: 'daily' },
  pro: { limit: 500, visible: 24, period: 'monthly' },
};
export const COUNTRIES =
  'AF AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW'.split(
    ' ',
  );
export function periodKey(plan, now = new Date()) {
  return now.toISOString().slice(0, plan === 'pro' ? 7 : 10);
}
export function hash(value) {
  let h = 2166136261;
  for (const ch of value) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function series(query, country = '', period = '90', source = 'google') {
  const seed = hash(query.toLowerCase() + '|' + country + '|' + period + '|' + source);
  const base = 18 + (seed % 31),
    trend = ((seed >>> 8) % 45) - 8;
  return Array.from({ length: 24 }, (_, i) =>
    Math.max(
      5,
      Math.min(
        100,
        Math.round(
          base +
            (i / 23) * trend +
            Math.sin(i * 0.83 + (seed % 9)) * 7 +
            ((hash(seed + ':' + i) % 11) - 5),
        ),
      ),
    ),
  );
}
export function growth(values) {
  const half = Math.floor(values.length / 2);
  const a = values.slice(0, half),
    b = values.slice(half);
  return Math.round(
    (b.reduce((s, v) => s + v, 0) / b.length / (a.reduce((s, v) => s + v, 0) / a.length) - 1) * 100,
  );
}
export function analysis(query, country = '', period = '90', source = 'google') {
  const points = series(query, country, period, source);
  return {
    query,
    country,
    period,
    source,
    points,
    interest: points.at(-1),
    growth: growth(points),
  };
}
const expansions = [
  ['best %', 'commercial'],
  ['% for beginners', 'informational'],
  ['how does % work', 'question'],
  ['% cost', 'commercial'],
  ['% at home', 'informational'],
  ['% ideas', 'informational'],
  ['what is %', 'question'],
  ['% software', 'commercial'],
  ['% guide', 'informational'],
  ['% tools', 'commercial'],
  ['how to start %', 'question'],
  ['% business', 'commercial'],
  ['% examples', 'informational'],
  ['% alternatives', 'commercial'],
  ['is % worth it', 'question'],
  ['% benefits', 'informational'],
  ['% tutorial', 'informational'],
  ['% vs traditional methods', 'informational'],
  ['where to buy %', 'question'],
  ['% services', 'commercial'],
  ['% trends', 'informational'],
  ['% reviews', 'commercial'],
  ['why use %', 'question'],
  ['% projects', 'informational'],
];
export function keywords(result) {
  return expansions.map(([template, intent]) => {
    const keyword = template.replace('%', result.query),
      data = analysis(keyword, result.country, result.period, result.source);
    return { keyword, intent, ...data };
  });
}
export function creditState(plan, record, now = new Date()) {
  const key = periodKey(plan, now);
  return record && record.key === key && Number.isInteger(record.used) && record.used >= 0
    ? { key, used: Math.min(record.used, PLANS[plan].limit) }
    : { key, used: 0 };
}
export function consumeCredit(plan, record, now = new Date()) {
  const credit = creditState(plan, record, now);
  if (credit.used >= PLANS[plan].limit) return null;
  return { ...credit, used: credit.used + 1 };
}
export function csvCell(value) {
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) str = "'" + str;
  return '"' + str.replaceAll('"', '""') + '"';
}
export function exportCsv(rows, result, countryName) {
  const data = [
    [
      'keyword',
      'intent',
      'sample_interest_index',
      'sample_change_percent',
      'market',
      'period_days',
      'example_source',
      'data_status',
    ],
    ...rows.map(r => [
      r.keyword,
      r.intent,
      r.interest,
      r.growth,
      countryName,
      result.period,
      result.source,
      'SYNTHETIC_DEMO_NOT_LIVE',
    ]),
  ];
  return '\ufeff' + data.map(row => row.map(csvCell).join(',')).join('\r\n');
}
