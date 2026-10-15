export async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  try {
    const response = await fetch(url, {...options, signal: options?.signal ?? AbortSignal.timeout(45000)});
    let data: T & {error?: string};
    try {data = await response.json();}
    catch {throw new Error(response.ok ? 'The server returned an unreadable response. Please try again.' : `The request failed (${response.status}). Please try again.`);}
    if (!data || typeof data !== 'object') throw new Error('The server returned an unreadable response. Please try again.');
    if (!response.ok) throw new Error(data.error || `The request failed (${response.status}). Please try again.`);
    return data;
  } catch (error) {
    if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) throw new Error('The check took too long. Previous data was preserved; please try again.');
    throw error;
  }
}
