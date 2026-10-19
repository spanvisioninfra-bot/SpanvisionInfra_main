import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { JSDOM } from '../vision-bim-validator/viewer/node_modules/jsdom/lib/api.js';
import visitorLocation, { locationFromHeaders } from './visitor-location.mjs';

const script = fs.readFileSync(new URL('../branding/map-location.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 20));

function environment({ permission = 'prompt', fetcher, position = [12.97, 77.59], denied = false } = {}) {
  const dom = new JSDOM('<div id="map"></div>', { url: 'https://spanvision-geo.vercel.app', runScripts: 'outside-only' });
  const win = dom.window;
  let gpsCalls = 0, fetchCalls = 0;
  Object.defineProperty(win, 'isSecureContext', { value: true });
  Object.defineProperty(win.navigator, 'permissions', { value: { query: async () => ({ state: permission }) } });
  Object.defineProperty(win.navigator, 'geolocation', { value: { getCurrentPosition(success, failure) {
    gpsCalls++; denied ? failure({ code: 1 }) : success({ coords: { latitude: position[0], longitude: position[1], accuracy: 20 } });
  } } });
  win.AbortSignal = globalThis.AbortSignal;
  win.fetch = async (...args) => { fetchCalls++; return fetcher ? fetcher(...args) : Response.json({ available: false }); };
  win.eval(script);
  const listeners = new Map();
  const map = {
    center: { lat: 0, lng: 0 }, zoom: 2,
    getContainer: () => win.document.getElementById('map'),
    getCenter() { return this.center; },
    setView([lat, lng], zoom) { this.center = { lat, lng }; this.zoom = zoom; listeners.get('moveend')?.(); },
    on(name, callback) { listeners.set(name, callback); }, off(name) { listeners.delete(name); },
  };
  return { win, map, gpsCalls: () => gpsCalls, fetchCalls: () => fetchCalls, close() { win.SpanvisionLocation.cancelMap(map); dom.window.close(); } };
}

test('visitor metadata produces English country names without returning IP addresses', () => {
  for (const [code, name] of [['IN', 'India'], ['US', 'United States'], ['GB', 'United Kingdom']]) {
    const data = locationFromHeaders({ 'x-vercel-ip-country': code, 'x-vercel-ip-city': 'New%20York', 'x-vercel-ip-latitude': '40.71', 'x-vercel-ip-longitude': '-74.00', 'x-real-ip': 'private-ip' });
    assert.equal(data.country, name); assert.equal(data.city, 'New York'); assert.equal(data.source, 'approximate');
    assert.equal(JSON.stringify(data).includes('private-ip'), false);
  }
  assert.equal(locationFromHeaders({}).available, false);
  assert.equal(locationFromHeaders({ 'x-vercel-ip-latitude': '', 'x-vercel-ip-longitude': '181' }).longitude, null);
});

test('location endpoint restricts origins, methods and caching', () => {
  function request(origin, method = 'GET') {
    const response = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(body) { this.body = body; } };
    visitorLocation({ method, headers: { origin, 'x-vercel-ip-country': 'IN' } }, response);
    return response;
  }
  for (const origin of ['https://www.spanvisioninfra.com', 'https://geo.spanvisioninfra.com', 'https://spanvision-stl.onrender.com']) {
    const response = request(origin); assert.equal(response.statusCode, 200);
    assert.equal(response.headers['Access-Control-Allow-Origin'], origin);
    assert.equal(response.headers['Cache-Control'], 'private, no-store');
    assert.equal(response.headers['Access-Control-Allow-Credentials'], undefined);
  }
  assert.equal(request('https://spanvisioninfra.com.evil.example').statusCode, 403);
  assert.equal(request('https://www.spanvisioninfra.com', 'POST').statusCode, 405);
  assert.equal(request('https://www.spanvisioninfra.com', 'OPTIONS').statusCode, 204);
});

test('new maps use visitor areas in India, US and UK without prompting for precise location', async () => {
  for (const [country, latitude, longitude] of [['India', 12.97, 77.59], ['United States', 40.71, -74], ['United Kingdom', 51.51, -0.12]]) {
    const env = environment({ fetcher: async (_url, options) => {
      assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'no-store');
      return Response.json({ available: true, country, latitude, longitude });
    } });
    try {
      env.win.SpanvisionLocation.attachMap(env.map); await tick();
      assert.deepEqual(env.map.center, { lat: latitude, lng: longitude });
      assert.equal(env.gpsCalls(), 0);
      assert.match(env.map.getContainer().textContent, new RegExp('Approximate area: ' + country));
    } finally { env.close(); }
  }
});

test('saved/project maps and manual choices are preserved when metadata arrives late', async () => {
  const saved = environment();
  try {
    saved.map.setView([51.5, -0.1], 16);
    saved.win.SpanvisionLocation.attachMap(saved.map, { autoLocate: false }); await tick();
    assert.equal(saved.fetchCalls(), 0); assert.equal(saved.gpsCalls(), 0);
    assert.equal(saved.map.center.lat, 51.5);
  } finally { saved.close(); }
  let reply;
  const manual = environment({ fetcher: () => new Promise(resolve => { reply = resolve; }) });
  try {
    manual.win.SpanvisionLocation.attachMap(manual.map); await tick();
    manual.map.getContainer().dispatchEvent(new manual.win.Event('pointerdown', { bubbles: true }));
    manual.map.setView([40.7, -74], 14);
    reply(Response.json({ available: true, country: 'India', latitude: 12.97, longitude: 77.59 })); await tick();
    assert.equal(manual.map.center.lat, 40.7);
  } finally { manual.close(); }
});

test('precise geolocation uses existing consent or a button and handles denial in English', async () => {
  const granted = environment({ permission: 'granted' });
  try {
    granted.win.SpanvisionLocation.attachMap(granted.map); await tick();
    assert.equal(granted.gpsCalls(), 1); assert.equal(granted.fetchCalls(), 0);
    assert.equal(granted.map.getContainer().dataset.locationSource, 'precise');
  } finally { granted.close(); }
  const denied = environment({ denied: true });
  try {
    denied.win.SpanvisionLocation.attachMap(denied.map); await tick();
    assert.equal(denied.gpsCalls(), 0);
    denied.map.getContainer().querySelector('button').click(); await tick();
    assert.match(denied.map.getContainer().textContent, /Location permission denied/);
    assert.equal(denied.map.getContainer().querySelector('button').disabled, false);
  } finally { denied.close(); }
});
