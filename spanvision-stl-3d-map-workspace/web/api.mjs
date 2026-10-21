/** All workspace operations use the Render app's own origin and private session. */
export async function api(path, options = {}) {
  const response = await fetch(path, { ...options, cache: 'no-store', credentials: 'same-origin' });
  let data;
  try { data = await response.json(); }
  catch { throw new Error(`The workspace did not return data (HTTP ${response.status}). Please try again.`); }
  if (!response.ok) throw new Error(data.detail || `The workspace returned HTTP ${response.status}. Please try again.`);
  return data;
}
