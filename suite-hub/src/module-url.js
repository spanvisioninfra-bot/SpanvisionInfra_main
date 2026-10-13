export function isLocalPreview(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function moduleUrl(module, state, mode, hostname) {
  const target = state?.url || (isLocalPreview(hostname) ? `http://127.0.0.1:${module.port}${module.path}` : null);
  if (!target) return null;
  let url;
  try { url = new URL(target); } catch { return null; }
  if (!isLocalPreview(hostname) && (url.protocol !== 'https:' || isLocalPreview(url.hostname))) return null;
  if (module.id === 'bim' && url.pathname === '/home') url.pathname = '/viewer';
  if (module.id === 'speech' && (!url.hash || url.hash === '#landing')) url.hash = 'workspace';
  url.searchParams.set('appearance', mode === 'light' ? 'light' : 'dark');
  if (module.id) url.searchParams.set('launch', 'workspace');
  return url.href;
}

export function toolLaunchUrl(module, state, mode, location) {
  if (!moduleUrl(module, state, mode, location.hostname)) return null;
  const url = new URL('/launch.html', location.origin);
  url.searchParams.set('tool', module.id);
  url.searchParams.set('appearance', mode === 'light' ? 'light' : 'dark');
  return url.href;
}
