// Approximate location comes from Vercel's request metadata. No IP address,
// account details, or location history is returned or stored.
const toolHosts = new Set(['spanvision-infra', 'spanvision-cad', 'spanvision-cad2d', 'spanvision-bim', 'spanvision-pdf', 'spanvision-ifc', 'spanvision-calc', 'spanvision-planner', 'spanvision-fem', 'spanvision-frame', 'spanvision-calculation', 'spanvision-geo', 'spanvision-speech', 'spanvision-stl', 'spanvision-field', 'spanvision-pointcloud', 'spanvision-pile']);

function allowedOrigin(origin) {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.port || url.origin !== origin) return false;
    if (url.hostname === 'spanvisioninfra.com' || url.hostname.endsWith('.spanvisioninfra.com')) return true;
    return ['vercel.app', 'onrender.com'].some(domain => toolHosts.has(url.hostname.replace('.' + domain, '')) && url.hostname.endsWith('.' + domain));
  } catch { return false; }
}

function coordinate(value, limit) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}

export function locationFromHeaders(headers) {
  const code = typeof headers['x-vercel-ip-country'] === 'string' ? headers['x-vercel-ip-country'].toUpperCase() : '';
  const countryCode = /^[A-Z]{2}$/.test(code) && !['XX', 'ZZ'].includes(code) ? code : null;
  let country = null, city = null;
  try { if (countryCode) country = new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode); } catch { /* Unknown region. */ }
  try {
    const raw = headers['x-vercel-ip-city'];
    if (typeof raw === 'string') city = decodeURIComponent(raw).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 100) || null;
  } catch { /* Malformed optional city metadata. */ }
  const latitude = coordinate(headers['x-vercel-ip-latitude'], 90);
  const longitude = coordinate(headers['x-vercel-ip-longitude'], 180);
  return { source: 'approximate', countryCode, country, city, latitude, longitude, available: !!countryCode || latitude !== null && longitude !== null };
}

export default function visitorLocation(request, response) {
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('Vary', 'Origin');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  const origin = request.headers.origin;
  if (origin && !allowedOrigin(origin)) {
    response.statusCode = 403; response.end(JSON.stringify({ message: 'This origin is not allowed.' })); return;
  }
  if (origin) response.setHeader('Access-Control-Allow-Origin', origin);
  if (request.method === 'OPTIONS') {
    response.setHeader('Access-Control-Allow-Methods', 'GET'); response.statusCode = 204; response.end(); return;
  }
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET, OPTIONS'); response.statusCode = 405; response.end(JSON.stringify({ message: 'Use GET.' })); return;
  }
  response.statusCode = 200;
  response.end(JSON.stringify(locationFromHeaders(request.headers)));
}
