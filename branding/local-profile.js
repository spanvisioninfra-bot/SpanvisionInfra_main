const STORAGE_KEY = 'spanvision.local-profile.v1';

export function readLocalProfile(storage) {
  try {
    storage ??= globalThis.localStorage;
    const profile = JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
    return profile?.version === 1 && typeof profile.name === 'string'
      ? { name: normalizeName(profile.name) } : { name: '' };
  } catch { return { name: '' }; }
}

function normalizeName(value) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ').slice(0, 80);
}

export function saveLocalProfile(value, storage) {
  const name = normalizeName(value);
  if (!name) throw new Error('Enter your display name.');
  try { (storage ?? globalThis.localStorage).setItem(STORAGE_KEY, JSON.stringify({ version: 1, name })); }
  catch { throw new Error('Your browser could not save this profile. Allow local storage and try again.'); }
  return { name };
}
