import type {DomainRecord} from './domains';
import type {FeedInfo} from './catalog';
import {apiRequest} from './api-client.ts';

export type Catalogue = {records: DomainRecord[]; feeds: FeedInfo[]};
type LiveResult = {kind: 'live'; data: Catalogue} | {kind: 'error'; error: unknown};
type SavedResult = {kind: 'saved'; data: Catalogue} | {kind: 'missing'};

export async function refreshCatalogue(tlds: string[], onSaved: (catalogue: Catalogue) => void): Promise<Catalogue> {
  // No extension chosen: one cheap request for the preview of every extension.
  if (!tlds.length) return apiRequest<Catalogue>('/api/domains');
  const query = 'tlds=' + tlds.join(',');
  // Either response may arrive first. A slow saved read must never delay a live
  // success, or replace newer data after that live response has been displayed.
  const live = apiRequest<Catalogue>('/api/domains?' + query).then<LiveResult, LiveResult>(data => ({kind: 'live', data}), error => ({kind: 'error', error}));
  const saved = apiRequest<Catalogue>('/api/domains?cached=1&' + query, {signal: AbortSignal.timeout(15000)})
    .then<SavedResult, SavedResult>(data => ({kind: 'saved', data}), () => ({kind: 'missing'}));
  const first = await Promise.race([live, saved]);
  if (first.kind === 'live') return first.data;
  const snapshot = first.kind === 'error' ? await saved : first;
  if (snapshot.kind === 'saved' && snapshot.data.records.length) onSaved(snapshot.data);
  const current = first.kind === 'error' ? first : await live;
  if (current.kind === 'error') throw current.error;
  return current.data;
}
