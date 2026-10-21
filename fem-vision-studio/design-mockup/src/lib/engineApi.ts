import { waitForBackend } from '../../../../deployment/service-readiness.mjs';

let readyAt = 0;
let pending: Promise<unknown> = Promise.resolve();

/** Use the website's proxy so no database secret or cross-site cookie is needed. */
export function engineRequest<T>(
  endpoint: 'toetsing' | 'doorsnede', body: unknown, signal?: AbortSignal,
): Promise<T> {
  // The small Render instance runs one Rust process at a time. Queue checks
  // from all editors rather than failing simultaneous requests with HTTP 503.
  const payload = JSON.stringify(body);
  const next = pending.then(() => calculate<T>(endpoint, payload, signal));
  pending = next.catch(() => {});
  return next;
}

async function calculate<T>(
  endpoint: 'toetsing' | 'doorsnede', payload: string | undefined, signal?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted();
  if (Date.now() - readyAt > 15000) {
    await waitForBackend('fem', '/api/engine-health', { signal });
    readyAt = Date.now();
  }
  const timeout = AbortSignal.timeout(40000);
  let response: Response;
  try {
    response = await fetch(`/api/${endpoint}`, {
      method: 'POST', cache: 'no-store', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: payload,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    readyAt = 0;
    if (signal?.aborted) throw error;
    throw new Error('The calculation service could not be reached or timed out. Please try again.');
  }
  let data: unknown;
  try { data = await response.json(); }
  catch {
    readyAt = 0;
    throw new Error(`The calculation service did not return JSON (HTTP ${response.status}). Please try again.`);
  }
  if (!response.ok || data === null || (typeof data === 'object' && 'fout' in data)) {
    readyAt = 0;
    const error = data as { fout?: string; detail?: string } | null;
    throw new Error(error?.fout ?? error?.detail ?? `The calculation service returned HTTP ${response.status}. Please try again.`);
  }
  return data as T;
}
