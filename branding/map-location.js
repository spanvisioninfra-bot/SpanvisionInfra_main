/* Shared location controls for geographic maps. Coordinates stay in memory. */
(() => {
  let cached;
  let pending;
  let approximate;
  let approximatePending;
  const controllers = new WeakMap();
  const valid = p => Number.isFinite(p?.latitude) && Number.isFinite(p?.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;
  async function approximateLocation() {
    if (approximate && Date.now() - approximate.time < 300000) return approximate;
    if (approximatePending) return approximatePending;
    approximatePending = (async () => {
      try {
        const response = await fetch('https://www.spanvisioninfra.com/__suite/location', { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(6000) });
        if (!response.ok) return null;
        const data = await response.json();
        if (!data.available) return null;
        approximate = { ...data, time: Date.now() };
        return approximate;
      } catch { return null; }
    })().finally(() => { approximatePending = undefined; });
    return approximatePending;
  }
  function currentPosition() {
    if (!window.isSecureContext) return Promise.reject(new Error('Location needs HTTPS or localhost. Search or pan to a location.'));
    if (!navigator.geolocation) return Promise.reject(new Error('Location is unavailable in this browser. Search or pan to a location.'));
    if (cached && Date.now() - cached.time < 60000) return Promise.resolve(cached);
    if (pending) return pending;
    pending = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Location timed out. Retry, search or pan to a location.')), 12000);
      navigator.geolocation.getCurrentPosition(position => {
        clearTimeout(timer);
        if (!valid(position.coords)) { reject(new Error('Your location is unavailable. Search or pan to a location.')); return; }
        cached = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, time: Date.now() };
        resolve(cached);
      }, error => {
        clearTimeout(timer);
        reject(new Error(error.code === 1 ? 'Location permission denied. Allow location in your browser, or search or pan manually.' : error.code === 3 ? 'Location timed out. Retry, search or pan to a location.' : 'Your location is unavailable. Retry, search or pan to a location.'));
      }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
    }).finally(() => { pending = undefined; });
    return pending;
  }
  function attachMap(map, { autoLocate = true, zoom = 14 } = {}) {
    controllers.get(map)?.destroy();
    const container = map.getContainer();
    const bar = document.createElement('div');
    bar.className = 'sv-map-location';
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = 'Use my location';
    const status = document.createElement('span');
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    bar.append(button, status); container.append(bar);
    let alive = true, request = 0, locating = false;
    function publish(kind, position) {
      container.dataset.locationSource = kind;
      container.dataset.mapCountry = position.country || '';
      container.dataset.mapCountryCode = position.countryCode || '';
      window.dispatchEvent(new CustomEvent('spanvision:map-location', { detail: { map: container, source: kind, ...position } }));
    }
    function report(state, message) { bar.dataset.locationState = state; status.textContent = message; button.disabled = state === 'locating'; }
    function cancel() {
      request++;
      if (locating) { locating = false; report('manual', 'Map position kept. Use my location to recenter.'); }
    }
    function onInteraction(event) { if (!bar.contains(event.target) && (event.type !== 'keydown' || ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', '+', '-'].includes(event.key))) cancel(); }
    function trackCenter() { const center = map.getCenter(); container.dataset.mapLatitude = String(center.lat); container.dataset.mapLongitude = String(center.lng); }
    async function locate() {
      const id = ++request, start = map.getCenter();
      locating = true; report('locating', 'Finding your location…');
      try {
        const position = await currentPosition();
        if (!alive || id !== request) return;
        const center = map.getCenter();
        if (Math.abs(start.lat - center.lat) > 0.0001 || Math.abs(start.lng - center.lng) > 0.0001) { cancel(); return; }
        locating = false;
        map.setView([position.latitude, position.longitude], zoom, { animate: false });
        publish('precise', { latitude: position.latitude, longitude: position.longitude });
        report('located', `Your location: ${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}`);
      } catch (error) { if (alive && id === request) { locating = false; report('unavailable', error.message); } }
    }
    button.addEventListener('click', event => { event.stopPropagation(); void locate(); });
    // Prevent map drawing, dragging and wheel zoom when using the control.
    for (const type of ['pointerdown', 'mousedown', 'touchstart', 'dblclick', 'wheel']) bar.addEventListener(type, event => event.stopPropagation());
    for (const type of ['pointerdown', 'wheel', 'keydown']) container.addEventListener(type, onInteraction, true);
    const onSearch = () => cancel();
    window.addEventListener('ogs:map-fly-to', onSearch);
    map.on('moveend', trackCenter); trackCenter();
    const controller = { locate, cancel, destroy() {
      alive = false; request++;
      for (const type of ['pointerdown', 'wheel', 'keydown']) container.removeEventListener(type, onInteraction, true);
      window.removeEventListener('ogs:map-fly-to', onSearch);
      map.off('moveend', trackCenter); map.off('unload', controller.destroy); bar.remove(); controllers.delete(map);
    } };
    controllers.set(map, controller); map.on('unload', controller.destroy);
    report('ready', autoLocate ? 'Use my location, search or pan to choose an area.' : 'Saved or project location kept.');
    async function locateAutomatically() {
      const id = request, start = map.getCenter();
      try {
        if (navigator.permissions && (await navigator.permissions.query({ name: 'geolocation' })).state === 'granted') { if (alive && id === request) await locate(); return; }
      } catch { /* Use approximate metadata without opening a permission prompt. */ }
      const position = await approximateLocation();
      if (!alive || id !== request || !position) return;
      const center = map.getCenter();
      if (Math.abs(start.lat - center.lat) > 0.0001 || Math.abs(start.lng - center.lng) > 0.0001) return;
      const label = [position.city, position.country].filter(Boolean).join(', ') || 'your region';
      if (valid(position)) map.setView([position.latitude, position.longitude], 10, { animate: false });
      publish('approximate', position);
      report('approximate', `Approximate area: ${label}. Use my location for a precise position.`);
    }
    if (autoLocate) void locateAutomatically();
    return controller;
  }
  window.SpanvisionLocation = { currentPosition, attachMap, cancelMap: map => controllers.get(map)?.cancel() };
})();
