/** Private BIM data must always come from the current browser's server session. */
export function backendFetch(input: RequestInfo | URL, options: RequestInit = {}): Promise<Response> {
  return fetch(input, { ...options, cache: 'no-store', credentials: 'same-origin' });
}
