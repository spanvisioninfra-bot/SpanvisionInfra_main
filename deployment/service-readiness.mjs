export function serviceIsReady(id, data) {
  if (id === 'bim') return data?.status === 'healthy';
  if (id === 'stl') return data?.app === 'spanvision-stl-3d-map-workspace';
  if (id === 'fem') return data?.status === 'ok';
  return false;
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, ms);
    if (signal.aborted) cancel();
    else signal.addEventListener('abort', cancel, { once: true });
  });
}

// Only GET health checks are retried. Uploads and calculations are never replayed.
export async function waitForBackend(id, url, {
  signal, timeoutMs = 180000, onWaiting = () => {}, fetcher = fetch,
  sleep = delay, intervalMs = 1500, attemptMs = 45000,
} = {}) {
  const deadline = AbortSignal.timeout(timeoutMs);
  const bounded = signal ? AbortSignal.any([signal, deadline]) : deadline;
  try {
    while (!bounded.aborted) {
      try {
        const response = await fetcher(url, {
          method: 'GET', cache: 'no-store', credentials: 'omit',
          signal: AbortSignal.any([bounded, AbortSignal.timeout(attemptMs)]),
        });
        const data = response.ok ? await response.json() : null;
        bounded.throwIfAborted();
        if (response.ok && serviceIsReady(id, data)) return;
      } catch { /* Render may still be waking up. */ }
      bounded.throwIfAborted();
      onWaiting();
      await sleep(intervalMs, bounded);
    }
    bounded.throwIfAborted();
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (deadline.aborted) throw new Error('The workspace is taking longer to start. Please try again shortly.');
    throw error;
  }
}
