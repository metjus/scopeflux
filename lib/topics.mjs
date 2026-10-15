// A topic's identity is its Wikipedia article: 'en:Godot_(game_engine)'.
// Topics without an article (yet) use 'rss:<lower-case title>'.

// 'en:Godot_(game_engine)' -> { lang: 'en', article: 'Godot_(game_engine)' }
export function parseTopicKey(key) {
  if (typeof key !== 'string' || key.length > 320 || /[\u0000-\u001f]/.test(key)) return null;
  const match = /^([a-z]{2,3}|rss):(.+)$/.exec(key);
  if (!match) return null;
  return match[1] === 'rss'
    ? { lang: null, article: null, rssTitle: match[2] }
    : { lang: match[1], article: match[2] };
}

export const articleKey = (lang, article) => lang + ':' + article;
export const rssKey = title => 'rss:' + title.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

// Readable title: underscores to spaces.
export const articleTitle = article => article.replaceAll('_', ' ');

// Text used to search Hacker News and Google News: the title without a
// disambiguation like " (game engine)".
export const searchTextFor = title => title.replace(/\s*\([^)]*\)\s*$/, '').trim();
