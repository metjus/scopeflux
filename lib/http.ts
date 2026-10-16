// Shared rules for requests to outside sources: a descriptive User-Agent that
// names the site, and a cap on how much of an answer is read.
export const USER_AGENT = 'ScopeFlux/1.0 (+https://scopeflux.io)';

export class ResponseTooLargeError extends Error {}

// Reads a response body as text, stopping with an error past `maxBytes`.
export async function limitedText(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get('Content-Length'));
  if (declared > maxBytes) throw new ResponseTooLargeError('The source answer is too large.');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new ResponseTooLargeError('The source answer is too large.');
    }
    text += decoder.decode(value, {stream: true});
  }
  return text + decoder.decode();
}
