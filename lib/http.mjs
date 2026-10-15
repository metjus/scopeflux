// One careful way to call an external service: timeout, size limit, our
// User-Agent, no redirects, and a typed error the UI can explain.
import { USER_AGENT, REQUEST_TIMEOUT_MS } from './config.mjs';

// error.code is one of: TIMEOUT, RATE_LIMITED, HTTP_ERROR, TOO_LARGE,
// BAD_RESPONSE, NO_MATCH, NOT_ENOUGH_DATA. error.source names the service.
export class SourceError extends Error {
  constructor(source, code, message) {
    super(message);
    this.name = 'SourceError';
    this.source = source;
    this.code = code;
  }
}

// Plain-English text for each code, for API responses.
export function friendlyMessage(error, sourceName) {
  const name = sourceName || error?.source || 'The source';
  switch (error?.code) {
    case 'TIMEOUT':
      return name + ' did not answer in time.';
    case 'RATE_LIMITED':
      return name + ' is limiting requests right now. Try again later.';
    case 'NO_MATCH':
      return error.message;
    case 'NOT_ENOUGH_DATA':
      return error.message;
    default:
      return name + ' could not be reached.';
  }
}

async function readBounded(response, maxBytes, source) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0,
    text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) throw new SourceError(source, 'TOO_LARGE', source + ' response is too large');
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
}

// Returns { status, text, contentType }. 404 is returned, not thrown, because
// "nothing found" is a normal answer for some services.
export async function fetchText(
  url,
  {
    source,
    fetcher = fetch,
    accept = 'application/json',
    maxBytes = 1_000_000,
    timeoutMs = REQUEST_TIMEOUT_MS,
  } = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      headers: { Accept: accept, 'User-Agent': USER_AGENT },
      signal: controller.signal,
      // Cloudflare Workers do not support redirect: 'error'.
      redirect: 'manual',
    });
    if (response.status === 429) throw new SourceError(source, 'RATE_LIMITED', source + ' HTTP 429');
    if (response.status >= 300 && response.status < 400)
      throw new SourceError(source, 'HTTP_ERROR', source + ' redirected: HTTP ' + response.status);
    if (!response.ok && response.status !== 404)
      throw new SourceError(source, 'HTTP_ERROR', source + ' HTTP ' + response.status);
    return {
      status: response.status,
      contentType: response.headers.get('Content-Type') ?? '',
      text: response.status === 404 ? '' : await readBounded(response, maxBytes, source),
    };
  } catch (error) {
    if (error instanceof SourceError) throw error;
    if (controller.signal.aborted || error?.name === 'AbortError')
      throw new SourceError(source, 'TIMEOUT', source + ' request timed out');
    throw new SourceError(source, 'HTTP_ERROR', source + ': ' + (error?.message || 'network error'));
  } finally {
    clearTimeout(timer);
  }
}

// Same as fetchText, then JSON.parse. Returns null for 404.
export async function fetchJson(url, options) {
  const { status, text } = await fetchText(url, options);
  if (status === 404) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new SourceError(options.source, 'BAD_RESPONSE', options.source + ' returned invalid JSON');
  }
}
