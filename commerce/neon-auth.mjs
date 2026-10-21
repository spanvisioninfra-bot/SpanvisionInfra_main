// Provider credentials remain inside the encrypted, HttpOnly application cookie.
export function neonAuthUrl(env) {
  const value = env.NEON_AUTH_BASE_URL || env.VITE_NEON_AUTH_URL;
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.neon.tech') || !url.hostname.includes('.neonauth.')
      || url.username || url.password || url.search || url.hash || !/^\/[a-zA-Z0-9_-]+\/auth\/?$/.test(url.pathname)) return null;
    return url.href.replace(/\/$/, '');
  } catch { return null; }
}

export function neonSelected(env) { return !!(env.NEON_AUTH_BASE_URL || env.VITE_NEON_AUTH_URL); }

export function neonUser(record) {
  if (!record || typeof record.id !== 'string') return null;
  return {
    id: record.id, email: record.email, is_anonymous: record.isAnonymous === true,
    email_confirmed_at: record.emailVerified === true ? (record.updatedAt || new Date().toISOString()) : null,
    user_metadata: { full_name: typeof record.name === 'string' ? record.name : '' },
    created_at: record.createdAt || null,
  };
}

function credential(response, data, previous) {
  let saved = {};
  try { saved = JSON.parse(previous || '{}'); } catch { /* Ignore malformed credentials. */ }
  const cookies = response.headers.getSetCookie?.() || [];
  const sessionCookie = cookies.map(cookie => cookie.split(';')[0])
    .find(cookie => /^(?:__Secure-)?[a-zA-Z0-9_.-]+\.session_token=/.test(cookie));
  const token = data?.token || data?.session?.token || saved.token;
  const cookie = sessionCookie || saved.cookie;
  if ((!cookie && !token) || (cookie && /[\r\n]/.test(cookie)) || (token && /[\r\n]/.test(token))) return null;
  const encoded = JSON.stringify({ ...(cookie ? { cookie } : {}), ...(token ? { token } : {}) });
  return encoded.length <= 1800 ? encoded : null;
}

export async function neonRequest(env, endpoint, body, fetcher, origin, access) {
  const base = neonAuthUrl(env);
  if (!base) throw new Error('Neon Auth URL is not configured correctly.');
  const headers = { 'Content-Type': 'application/json', Origin: origin };
  if (access) {
    const saved = JSON.parse(access);
    if (saved.cookie) headers.Cookie = saved.cookie;
    if (saved.token) headers.Authorization = `Bearer ${saved.token}`;
  }
  const response = await fetcher(`${base}/${endpoint}`, {
    method: body === undefined ? 'GET' : 'POST', headers, redirect: 'error',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(12000),
  });
  const data = response.status === 204 ? null : await response.json();
  return { response, data, credential: response.ok ? credential(response, data, access) : null };
}

// Keep the existing website forms and Supabase deployment path while selecting Neon explicitly.
export async function neonAuth(env, endpoint, body, fetcher, origin, access) {
  let route, payload;
  if (endpoint === 'token?grant_type=password') {
    route = 'sign-in/email'; payload = { email: body.email, password: body.password, rememberMe: true };
  } else if (endpoint === 'signup') {
    route = 'sign-up/email'; payload = { email: body.email, password: body.password, name: body.data.full_name };
  } else if (endpoint === 'user') route = 'get-session?disableCookieCache=true';
  else if (endpoint === 'verify' && body.type === 'signup') {
    route = 'email-otp/verify-email'; payload = { email: body.email, otp: body.token };
  } else if (endpoint === 'recover') {
    route = 'email-otp/request-password-reset'; payload = { email: body.email };
  } else if (endpoint === 'logout?scope=local') { route = 'sign-out'; payload = {}; }
  else throw new Error('Unsupported Neon authentication operation.');
  const result = await neonRequest(env, route, payload, fetcher, origin, access);
  if (!result.response.ok) return result;
  if (endpoint === 'user') {
    result.data = result.data?.session ? neonUser(result.data.user) : null;
  } else if (['token?grant_type=password', 'signup', 'verify'].includes(endpoint)) {
    const user = neonUser(result.data?.user);
    // Verification is required even if the dashboard accidentally permits unverified sessions.
    result.data = { user, access_token: user?.email_confirmed_at && result.credential ? result.credential : null,
      refresh_token: 'neon-managed-session' };
  }
  return result;
}
