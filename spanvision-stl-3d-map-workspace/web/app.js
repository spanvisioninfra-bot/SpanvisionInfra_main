/* STL-3D map workspace - browser side.
 * The browser owns the project object; the server is stateless. */
import { api } from './api.mjs';

// Printable bodies, in print order. Colours mirror config.py DEFAULT_BANDS.
const BODY_DEFS = [
  { key: 'base', label: 'Water / base plate', color: '#2f6f9f', slot: 1 },
  { key: 'roads', label: 'Roads', color: '#e8e4d9', slot: 3 },
  { key: 'land', label: 'Land / ground', color: '#7d9a6a', slot: 2 },
  { key: 'shrubs', label: 'Shrubs / vegetation', color: '#6f9a52', slot: 2 },
  { key: 'trees', label: 'Trees / woodland', color: '#3f6a2e', slot: 2 },
  { key: 'buildings', label: 'Buildings', color: '#b7643c', slot: 4 },
  { key: 'design', label: 'Imported design', color: '#d9b310', slot: 4 },
];

const DEFAULT_PROJECT = () => ({
  id: 'kaart',
  name: 'Map',
  bbox_wgs84: null,
  settings: {
    max_size_mm: 200, layer_height: 0.2, first_layer_height: 0.2,
    base_top: 1.2, road_top: 1.8, land_top: 2.0,
    height_exaggeration: 1.5, min_building_height_mm: 0.6, max_building_height_mm: 30,
    min_road_width_mm: 0.9, min_feature_area_mm2: 0.8, simplify_mm: 0.06,
    shrub_height_mm: 1.0, tree_height_mm: 3.0, tree_radius_mm: 0.9,
    road_style: 'recessed', detailed_buildings: false,
    include_water: true, include_roads: true, include_buildings: true,
    include_shrubs: false, include_trees: false,
    slots: {},
  },
  hidden_building_ids: [],
  design: {
    filename: '', anchor_lonlat: null, rotation_deg: 0,
    relative_scale: 1.0, z_offset_mm: 0, slot: 4, enabled: true,
  },
});

// Merge stored project over defaults so projects saved by an older version pick
// up new settings (vegetation, slots, detail) instead of arriving undefined.
function withDefaults(stored) {
  const base = DEFAULT_PROJECT();
  if (!stored) return base;
  return {
    ...base, ...stored,
    settings: { ...base.settings, ...(stored.settings || {}),
                slots: { ...(stored.settings && stored.settings.slots || {}) } },
    design: { ...base.design, ...(stored.design || {}) },
  };
}

let project = withDefaults(load());
let buildingLayer = null, contextLayer = null, areaRect = null, designMarker = null;
let pendingAreaFit = false;
let mode = null;            // null | 'area' | 'box'
let hideMode = 'click';     // 'click' | 'box'

const $ = (id) => document.getElementById(id);
function escapeHTML(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

// --------------------------------------------------------------------------- map
const map = L.map('map', { preferCanvas: true, zoomControl: true }).setView([0, 0], 2);
map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">Leaflet</a>');

const baseLayers = {
  'Map': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map),
  'Regional topography (NL)': L.tileLayer('https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png', { maxZoom: 19, bounds: [[50.5,3],[54,7.5]], attribution: '&copy; PDOK / Kadaster' }),
  'Grayscale': L.tileLayer(
    'https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:3857/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution: '&copy; PDOK / Kadaster' }),
  'Satellite': L.tileLayer(
    'https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg',
    { maxZoom: 19, attribution: '&copy; PDOK Luchtfoto' }),
};
// Keep the world map visible beneath regional imagery outside its coverage.
map.createPane('worldMap').style.zIndex='190';
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{pane:'worldMap',maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
for(const [name,layer]of Object.entries(baseLayers))if(name!=='Map')layer.options.bounds=L.latLngBounds([[50.5,3],[54,7.5]]);
L.control.layers(baseLayers, {}, { position: 'topright' }).addTo(map);

// --------------------------------------------------------------------------- helpers
function busy(on, text) {
  $('busy').classList.toggle('hidden', !on);
  $('work').inert=on;$('topbar').inert=on;document.querySelector('.mobile-tabs').inert=on;document.body.setAttribute('aria-busy',String(on));
  if (text) $('busy-text').textContent = text;
}

function status(text, cls) {
  const el = $('status');
  el.textContent = text;
  el.className = cls || '';
}

function post(path, body) {
  return api(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function save() { localStorage.setItem('3dmaps.project', JSON.stringify(project)); }
function load() {
  try { return JSON.parse(localStorage.getItem('3dmaps.project')); } catch { return null; }
}

// --------------------------------------------------------------------------- search
let searchTimer = null;
$('search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (q.length < 2) { searchRequest?.abort(); searchResults=[];closeSearch(); return; }
  searchTimer = setTimeout(() => runSearch(q), 300);
});

let searchRequest, searchResults=[], selectedResult=-1;
function closeSearch(){ $('search-results').classList.add('hidden');$('search').setAttribute('aria-expanded','false');$('search').removeAttribute('aria-activedescendant'); }
function selectSearch(index){const r=searchResults[index];if(!r)return;map.setView([r.lat,r.lon],16);$('search').value=r.label;closeSearch();showView('map');}
async function runSearch(q) {
 searchRequest?.abort();const controller=new AbortController();searchRequest=controller;
 try {
  const pair=q.trim().split(/[,;/\s]+/).map(Number);
  const isCoordinates=pair.length===2&&pair.every(Number.isFinite)&&Math.abs(pair[0])<=90&&Math.abs(pair[1])<=180;
  const {results}=isCoordinates?{results:[{lat:pair[0],lon:pair[1],label:`${pair[0]}, ${pair[1]}`,type:'Coordinates'}]}:await api('/api/search?q='+encodeURIComponent(q),{signal:controller.signal});
  if(controller!==searchRequest)return;searchResults=results;selectedResult=-1;
  const ul=$('search-results');ul.replaceChildren();
  results.forEach((r,index)=>{const li=document.createElement('li');li.id='location-'+index;li.role='option';li.setAttribute('aria-selected','false');li.append(document.createTextNode(r.label));const small=document.createElement('small');small.textContent=({gemeente:'Municipality',woonplaats:'Town',weg:'Street',adres:'Address',wijk:'District',buurt:'Neighborhood'})[r.type]||r.type;li.append(small);li.onclick=()=>selectSearch(index);ul.append(li);});
  ul.classList.toggle('hidden',!results.length);$('search').setAttribute('aria-expanded',String(!!results.length));
  if(!results.length)status('No matching Netherlands address found. Enter latitude, longitude to locate any place worldwide.');
 } catch(err){if(err.name!=='AbortError')status('Search failed: '+err.message,'err');}
}
$('search').addEventListener('keydown',event=>{
 if(event.key==='Escape'){closeSearch();return;}
 if(event.key==='Enter'&&selectedResult>=0){event.preventDefault();selectSearch(selectedResult);return;}
 if(!['ArrowDown','ArrowUp'].includes(event.key)||!searchResults.length||$('search-results').classList.contains('hidden'))return;
 event.preventDefault();selectedResult=selectedResult<0?(event.key==='ArrowDown'?0:searchResults.length-1):(selectedResult+(event.key==='ArrowDown'?1:-1)+searchResults.length)%searchResults.length;
 [...$('search-results').children].forEach((el,i)=>el.setAttribute('aria-selected',String(i===selectedResult)));
 $('search').setAttribute('aria-activedescendant','location-'+selectedResult);$('location-'+selectedResult).scrollIntoView({block:'nearest'});
});

// --------------------------------------------------------------------------- area selection
function setMode(next) {
  mode = next;
  map.getContainer().classList.toggle('drawing', next !== null);
  if (next) { map.dragging.disable(); } else { map.dragging.enable(); }
  $('btn-draw').classList.toggle('active', next === 'area');
  $('btn-draw').setAttribute('aria-pressed',String(next==='area'));if(next)showView('map');
}

let dragStart = null, dragRect = null;

map.on('mousedown', (e) => {
  if (!mode) return;
  dragStart = e.latlng;
  const style = mode === 'area'
    ? { color: '#4f9be0', weight: 2, fillOpacity: 0.08 }
    : { color: '#d9604a', weight: 1, dashArray: '4 3', fillOpacity: 0.12 };
  dragRect = L.rectangle(L.latLngBounds(dragStart, dragStart), style).addTo(map);
});

map.on('mousemove', (e) => {
  if (!dragStart || !dragRect) return;
  dragRect.setBounds(L.latLngBounds(dragStart, e.latlng));
});

map.on('mouseup', (e) => {
  if (!dragStart || !dragRect) return;
  const bounds = L.latLngBounds(dragStart, e.latlng);
  const wasMode = mode;
  map.removeLayer(dragRect);
  dragStart = null; dragRect = null;

  if (bounds.getNorth() - bounds.getSouth() < 1e-5) { setMode(null); return; }

  if (wasMode === 'area') {
    applyBbox([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]);
    setMode(null);
  } else if (wasMode === 'box') {
    hideInBounds(bounds, !e.originalEvent.shiftKey);
  }
});

function applyBbox(bbox) {
  project.bbox_wgs84 = bbox;
  save();
  drawAreaRect();
  status('Area selected. Click "Load map data".');
}

function drawAreaRect() {
  if (areaRect) { map.removeLayer(areaRect); areaRect = null; }
  if (!project.bbox_wgs84) return;
  $('map-guidance').classList.add('hidden');
  const [w, s, e, n] = project.bbox_wgs84;
  areaRect = L.rectangle([[s, w], [n, e]], {
    color: '#4f9be0', weight: 2, fill: false, dashArray: '6 4',
  }).addTo(map);
}

$('btn-draw').onclick = () => setMode(mode === 'area' ? null : 'area');

function fitAreaBounds() {
  if (!areaRect) return;
  if (!$('map').getClientRects().length) { pendingAreaFit = true; return; }
  if (map._animatingZoom) {
    pendingAreaFit = true;
    map.once('zoomend', () => { if (pendingAreaFit) fitAreaBounds(); });
    return;
  }
  pendingAreaFit = false;
  map.invalidateSize({ pan: false });
  map.fitBounds(areaRect.getBounds(), { padding: [40, 40] });
}

function resizeVisibleMap() {
  if (!$('map').getClientRects().length) return;
  const size=map.getSize(),container=map.getContainer();
  if(size.x!==container.clientWidth||size.y!==container.clientHeight){
    const center=map.getCenter();
    map.invalidateSize({ pan: false, animate: false });
    map.setView(center,map.getZoom(),{reset:true,animate:false});
  }
  if (pendingAreaFit) fitAreaBounds();
}

$('btn-center-area').onclick = () => {
  const c = map.getCenter();
  const w = Math.max(50, Number($('area-w').value) || 1000);
  const h = Math.max(50, Number($('area-h').value) || 1000);
  const dLat = (h / 2) / 111320;
  const dLon = (w / 2) / (111320 * Math.cos(c.lat * Math.PI / 180));
  applyBbox([c.lng - dLon, c.lat - dLat, c.lng + dLon, c.lat + dLat]);
  fitAreaBounds();
};

// --------------------------------------------------------------------------- load area
$('btn-load').onclick = async () => {
  if (!project.bbox_wgs84) { status('Select an area first.', 'err'); return; }
  const [west, south, east, north] = project.bbox_wgs84;
  if(west<3||east>7.5||south<50.5||north>54){status('The map works worldwide; 3D BAG model data covers the Netherlands. Select an area within its coverage.', 'err');return;}
  readSettings();
  busy(true, 'Retrieving buildings (3DBAG) and OSM data…');
  try {
    const data = await post('/api/area', { project, refresh: true });
    renderArea(data);
    if (data.stats.surfaces_error) {
      status('Buildings loaded; water and roads unavailable (OSM offline).', 'err');
    } else {
      status('Area loaded.', 'ok');
    }
  } catch (err) {
    status(err.message, 'err');
  } finally {
    busy(false);
  }
};

function renderArea(data) {
  if (buildingLayer) map.removeLayer(buildingLayer);
  if (contextLayer) map.removeLayer(contextLayer);

  const features = data.geojson.features;
  const context = features.filter((f) => f.properties.kind !== 'building');
  const buildings = features.filter((f) => f.properties.kind === 'building');

  const CONTEXT_STYLE = {
    water: { fillColor: '#2f6f9f', fillOpacity: 0.55 },
    shrubs: { fillColor: '#6f9a52', fillOpacity: 0.40 },
    woods: { fillColor: '#3f6a2e', fillOpacity: 0.45 },
    roads: { fillColor: '#cfc9ba', fillOpacity: 0.45 },
  };
  contextLayer = L.geoJSON({ type: 'FeatureCollection', features: context }, {
    style: (f) => ({ weight: 0, color: '#000', ...(CONTEXT_STYLE[f.properties.kind] || CONTEXT_STYLE.roads) }),
    pointToLayer: (f, latlng) => L.circleMarker(latlng, {
      radius: 2.5, color: '#2f5225', weight: 0, fillColor: '#3f6a2e', fillOpacity: 0.9,
    }),
    interactive: false,
  }).addTo(map);

  const hidden = new Set(project.hidden_building_ids);
  buildingLayer = L.geoJSON({ type: 'FeatureCollection', features: buildings }, {
    style: (f) => buildingStyle(hidden.has(f.properties.id)),
    onEachFeature: (f, layer) => {
      layer.on('click', () => {
        if (hideMode !== 'click') return;
        toggleHidden(f.properties.id);
      });
      const p = f.properties;
      layer.bindTooltip(
        `${p.height_m} m high${p.floors ? ` &middot; ${p.floors} floors` : ''}` +
        `${p.year ? ` &middot; ${p.year}` : ''}`,
        { sticky: true },
      );
    },
  }).addTo(map);

  renderAreaStats(data.stats);
  $('sec-buildings').classList.remove('disabled');$('sec-buildings').inert=false;
  $('sec-design').classList.remove('disabled');$('sec-design').inert=false;
  renderBuildingList();showView('map');
  updateHiddenCount();
}

function buildingStyle(isHidden) {
  return isHidden
    ? { color: '#d9604a', weight: 1, fillColor: '#d9604a', fillOpacity: 0.12, dashArray: '3 2' }
    : { color: '#7a4327', weight: 0.6, fillColor: '#b7643c', fillOpacity: 0.75 };
}

function renderAreaStats(s) {
  $('area-stats').classList.remove('hidden');
  $('area-stats').innerHTML = `
    <dl>
      <dt>Area</dt><dd>${s.width_m} &times; ${s.height_m} m</dd>
      <dt>Plate</dt><dd>${s.plate_mm[0]} &times; ${s.plate_mm[1]} mm</dd>
      <dt>Scale</dt><dd>${s.scale_ratio}</dd>
      <dt>Buildings</dt><dd>${s.buildings}</dd>
      <dt>Roads</dt><dd>${s.roads}</dd>
      <dt>Trees</dt><dd>${s.trees}</dd>
    </dl>
    ${s.warn_large ? '<span class="warn">Large area: retrieval and generation may take a while.</span>' : ''}
    ${s.surfaces_error ? `<span class="warn">${escapeHTML(s.surfaces_error)} Buildings are available. Click "Load map data" again to retry water and roads.</span>` : ''}`;
}

// --------------------------------------------------------------------------- hiding buildings
function toggleHidden(id) {
  const idx = project.hidden_building_ids.indexOf(id);
  const nowHidden = idx === -1;
  if (nowHidden) project.hidden_building_ids.push(id);
  else project.hidden_building_ids.splice(idx, 1);
  // A pand split into parts arrives as several features sharing one BAG id,
  // so restyle every layer with that id, not just the one that was clicked.
  restyle(new Set([id]), nowHidden);
  save();
  updateHiddenCount();
  ensureDesignMarker();
}

function restyle(ids, isHidden) {
  if (!buildingLayer) return;
  buildingLayer.eachLayer((l) => {
    if (ids.has(l.feature.properties.id)) l.setStyle(buildingStyle(isHidden));
  });
}

function hideInBounds(bounds, hide) {
  if (!buildingLayer) return;
  const touched = new Set();
  buildingLayer.eachLayer((layer) => {
    if (bounds.intersects(layer.getBounds())) touched.add(layer.feature.properties.id);
  });
  if (!touched.size) return;

  const set = new Set(project.hidden_building_ids);
  touched.forEach((id) => (hide ? set.add(id) : set.delete(id)));
  project.hidden_building_ids = [...set];
  restyle(touched, hide);
  save();
  updateHiddenCount();
  ensureDesignMarker();
}

function updateHiddenCount() {
  const n = project.hidden_building_ids.length;
  document.querySelectorAll('#building-list input').forEach(input=>input.checked=project.hidden_building_ids.includes(input.dataset.building));
  $('hidden-count').innerHTML = `<dl><dt>Hidden</dt><dd>${n} building${n === 1 ? '' : 's'}</dd></dl>`;
}

$('btn-mode-click').onclick = () => {
  hideMode = 'click'; setMode(null);
  $('btn-mode-click').classList.add('active');
  $('btn-mode-box').classList.remove('active');
  $('btn-mode-click').setAttribute('aria-pressed','true');$('btn-mode-box').setAttribute('aria-pressed','false');
};
$('btn-mode-box').onclick = () => {
  hideMode = 'box'; setMode('box');
  $('btn-mode-box').classList.add('active');
  $('btn-mode-click').classList.remove('active');
  $('btn-mode-click').setAttribute('aria-pressed','false');$('btn-mode-box').setAttribute('aria-pressed','true');
  status('Drag a box to hide buildings. Shift + drag restores them.');
};
$('btn-clear-hidden').onclick = () => {
  project.hidden_building_ids = [];
  save();
  if (buildingLayer) buildingLayer.eachLayer((l) => l.setStyle(buildingStyle(false)));
  updateHiddenCount();
};

// --------------------------------------------------------------------------- own design
$('design-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const form = new FormData();
  form.append('project_id', project.id);
  form.append('file', file);

  busy(true, 'Reading design…');
  try {
    const info = await api('/api/design/upload', { method: 'POST', body: form });
    project.design.filename = info.filename;
    project.design.enabled = true;
    if (!project.design.anchor_lonlat) project.design.anchor_lonlat = defaultAnchor();
    save();
    $('design-info').classList.remove('hidden');
    $('design-info').innerHTML = `<dl>
      <dt>File</dt><dd>${escapeHTML(info.name)}</dd>
      <dt>Dimensions</dt><dd>${info.size_m[0]} &times; ${info.size_m[1]} &times; ${info.size_m[2]} m</dd>
      <dt>Triangles</dt><dd>${info.triangles.toLocaleString('en-GB')}</dd>
    </dl>`;
    $('design-controls').classList.remove('hidden');
    fillSlotSelect($('design-slot'), project.design.slot);
    ensureDesignMarker();
    renderSlots();
    status('Design loaded.', 'ok');
  } catch (err) {
    status(err.message, 'err');
  } finally {
    busy(false);
  }
});

function defaultAnchor() {
  if (buildingLayer && project.hidden_building_ids.length) {
    const hidden = new Set(project.hidden_building_ids);
    let bounds = null;
    buildingLayer.eachLayer((l) => {
      if (!hidden.has(l.feature.properties.id)) return;
      bounds = bounds ? bounds.extend(l.getBounds()) : L.latLngBounds(l.getBounds().getSouthWest(), l.getBounds().getNorthEast());
    });
    if (bounds) return [bounds.getCenter().lng, bounds.getCenter().lat];
  }
  if (project.bbox_wgs84) {
    const [w, s, e, n] = project.bbox_wgs84;
    return [(w + e) / 2, (s + n) / 2];
  }
  const c = map.getCenter();
  return [c.lng, c.lat];
}

function ensureDesignMarker() {
  if (!project.design.filename) return;
  if (!project.design.anchor_lonlat) project.design.anchor_lonlat = defaultAnchor();
  const [lon, lat] = project.design.anchor_lonlat;
  $('design-lon').value=lon.toFixed(6);$('design-lat').value=lat.toFixed(6);

  if (!designMarker) {
    designMarker = L.circleMarker([lat, lon], {
      radius: 9, color: '#7a6300', weight: 2, fillColor: '#d9b310', fillOpacity: 0.95,
    }).addTo(map).bindTooltip('Imported design - drag to move');

    // circleMarker has no dragging, so move it by hand.
    designMarker.on('mousedown', () => {
      map.dragging.disable();
      const move = (ev) => designMarker.setLatLng(ev.latlng);
      const up = (ev) => {
        map.off('mousemove', move); map.off('mouseup', up);
        map.dragging.enable();
        project.design.anchor_lonlat = [ev.latlng.lng, ev.latlng.lat];
        save();
      };
      map.on('mousemove', move); map.on('mouseup', up);
    });
  } else {
    designMarker.setLatLng([lat, lon]);
  }
}

['design-rot', 'design-scale', 'design-z', 'design-slot'].forEach((id) => {
  $(id).addEventListener('change', () => {
    project.design.rotation_deg = Number($('design-rot').value) || 0;
    project.design.relative_scale = Number($('design-scale').value) || 1;
    project.design.z_offset_mm = Number($('design-z').value) || 0;
    project.design.slot = Number($('design-slot').value) || 4;
    project.settings.slots.design = project.design.slot;
    save();
    renderSlots();
  });
});

$('btn-design-remove').onclick = async () => {
  if (project.design.filename) {
    await api(`/api/design?project_id=${encodeURIComponent(project.id)}&filename=${encodeURIComponent(project.design.filename)}`,
      { method: 'DELETE' }).catch(() => {});
  }
  project.design = DEFAULT_PROJECT().design;
  save();
  if (designMarker) { map.removeLayer(designMarker); designMarker = null; }
  $('design-info').classList.add('hidden');
  $('design-controls').classList.add('hidden');
  $('design-file').value = '';
  renderSlots();
};

// --------------------------------------------------------------------------- settings
function readSettings() {
  const s = project.settings;
  s.max_size_mm = Number($('set-size').value) || 200;
  s.layer_height = Number($('set-layer').value) || 0.2;
  s.first_layer_height = s.layer_height;
  s.base_top = Number($('set-base').value) || 1.2;
  s.road_top = Number($('set-road').value) || 1.8;
  s.land_top = Number($('set-land').value) || 2.0;
  s.height_exaggeration = Number($('set-exag').value) || 1;
  s.min_road_width_mm = Number($('set-roadw').value) || 0.9;
  s.road_style = $('set-roadstyle').value;
  s.include_water = $('set-water').checked;
  s.include_roads = $('set-roads').checked;
  s.include_buildings = $('set-buildings').checked;
  s.include_shrubs = $('set-shrubs').checked;
  s.include_trees = $('set-trees').checked;
  s.detailed_buildings = $('set-detailed').checked;
  save();
  renderSlots();
}

function writeSettings() {
  const s = project.settings;
  $('set-size').value = s.max_size_mm;
  $('set-layer').value = s.layer_height;
  $('set-base').value = s.base_top;
  $('set-road').value = s.road_top;
  $('set-land').value = s.land_top;
  $('set-exag').value = s.height_exaggeration;
  $('set-roadw').value = s.min_road_width_mm;
  $('set-roadstyle').value = s.road_style;
  $('set-water').checked = s.include_water;
  $('set-roads').checked = s.include_roads;
  $('set-buildings').checked = s.include_buildings;
  $('set-shrubs').checked = s.include_shrubs;
  $('set-trees').checked = s.include_trees;
  $('set-detailed').checked = s.detailed_buildings;
  $('design-rot').value = project.design.rotation_deg;
  $('design-scale').value = project.design.relative_scale;
  $('design-z').value = project.design.z_offset_mm;
  fillSlotSelect($('design-slot'), project.design.slot);
  renderSlots();
}

document.querySelectorAll('#panel input, #panel select').forEach((el) => {
  if (el.id.startsWith('set-')) el.addEventListener('change', readSettings);
});

// --------------------------------------------------------------------------- CFS slots
const MAX_SLOTS = 8;

function fillSlotSelect(sel, value) {
  sel.innerHTML = '';
  for (let i = 1; i <= MAX_SLOTS; i++) {
    const o = document.createElement('option');
    o.value = i; o.textContent = i;
    sel.appendChild(o);
  }
  sel.value = value || 1;
}

// Which bodies are actually in play, so the >4 warning only counts real ones.
function activeBodyKeys() {
  const s = project.settings;
  const keys = [];
  if (s.include_water) keys.push('base');
  if (s.include_roads) keys.push('roads');
  keys.push('land');
  if (s.include_shrubs) keys.push('shrubs');
  if (s.include_trees) keys.push('trees');
  if (s.include_buildings) keys.push('buildings');
  if (project.design.filename && project.design.enabled) keys.push('design');
  return keys;
}

function slotFor(key) {
  const def = BODY_DEFS.find((b) => b.key === key);
  const override = project.settings.slots[key];
  return override || (def ? def.slot : 4);
}

function renderSlots() {
  const active = new Set(activeBodyKeys());
  const rows = BODY_DEFS.filter((b) => active.has(b.key)).map((b) => {
    const slot = slotFor(b.key);
    const opts = Array.from({ length: MAX_SLOTS }, (_, i) =>
      `<option value="${i + 1}" ${slot === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('');
    return `<div class="slotrow">
      <span class="swatch" style="background:${b.color}"></span>
      <span class="name">${escapeHTML(b.label)}</span>
      <select aria-label="${escapeHTML(b.label)} filament slot" data-key="${b.key}">${opts}</select>
    </div>`;
  }).join('');
  $('slots').innerHTML = rows;

  $('slots').querySelectorAll('select').forEach((sel) => {
    sel.onchange = () => {
      const key = sel.dataset.key;
      project.settings.slots[key] = Number(sel.value);
      if (key === 'design') project.design.slot = Number(sel.value);
      save();
      updateSlotWarning();
    };
  });
  updateSlotWarning();
}

function updateSlotWarning() {
  const active = activeBodyKeys();
  const used = new Set(active.map(slotFor));
  const warn = $('slot-warn');
  if (used.size > 4) {
    warn.textContent = `You are using ${used.size} slots; CFS-C supports 4. `
      + `Use a manual filament change, or assign layers to the same slot.`;
    warn.classList.add('show');
  } else {
    warn.classList.remove('show');
  }
}

// --------------------------------------------------------------------------- export folder
async function refreshExportDir() {
  try {
    const { path } = await api('/api/export-dir');
    $('export-dir').value = appInfo?.cloud ? 'Browser download' : path;
  } catch { /* server not ready yet */ }
}

$('btn-pick-dir').onclick = async () => {
  busy(true, 'Waiting for folder selection…');
  try {
    const res = await api('/api/export-dir/pick', { method: 'POST' });
    $('export-dir').value = res.path;
    if (res.changed) status('Export folder set.', 'ok');
  } catch (err) {
    status(err.message, 'err');
  } finally {
    busy(false);
  }
};

$('btn-reveal').onclick = () => api('/api/reveal', { method: 'POST' }).catch(() => {});

// --------------------------------------------------------------------------- build
async function build(chooseDir) {
  if (!project.bbox_wgs84) { status('Select an area first.', 'err'); return; }
  readSettings();
  busy(true, chooseDir ? 'Waiting for folder selection…' : 'Generating model… this may take a while.');
  try {
    const res = await post('/api/build', { project, choose_dir: chooseDir });
    renderBuild(res);
    $('export-dir').value = appInfo?.cloud ? 'Browser download' : res.output_dir.replace(/[\\/][^\\/]+$/, '');
    if (!appInfo?.cloud) $('btn-reveal').classList.remove('hidden');
    status(appInfo?.cloud ? 'Ready. Download your model from the results below.' : 'Ready. Saved in ' + res.output_dir, 'ok');
  } catch (err) {
    // 409 is the user cancelling the folder dialog, which is not an error.
    if (err.message === 'Cancelled.') status('Save cancelled.');
    else status(err.message, 'err');
  } finally {
    busy(false);
  }
}

$('btn-build').onclick = () => build(false);
$('btn-build-as').onclick = () => build(true);

function renderBuild(res) {
  const el = $('build-result');
  el.classList.remove('hidden');
  const bands = res.bands.map((b) => `
    <div class="band">
      <span class="swatch" style="background:${b.color}"></span>
      <span>${escapeHTML(b.label)}</span>
      <span class="z">slot ${b.slot} &middot; ${b.z0.toFixed(1)}&ndash;${b.z1 === null ? 'top' : b.z1.toFixed(1)} mm</span>
    </div>`).join('');

  const files = res.files.map((f) => `
    <li><a href="/api/download/${res.project_id}/${encodeURIComponent(f.name)}" download>
      <span>${escapeHTML(f.name)}</span><span>${f.size_kb} kB</span></a></li>`).join('');

  el.innerHTML = `
    <div class="card"><dl>
      <dt>Plate</dt><dd>${res.stats.plate_mm[0]} &times; ${res.stats.plate_mm[1]} mm</dd>
      <dt>Height</dt><dd>${res.stats.total_height_mm} mm</dd>
      <dt>Scale</dt><dd>${res.stats.scale_ratio}</dd>
      <dt>Triangles</dt><dd>${res.stats.triangles.toLocaleString('en-GB')}</dd>
      <dt>Filament changes</dt><dd>${res.stats.filament_changes}</dd>
    </dl></div>
    <div class="bands">${bands}</div>
    <ul class="files">${files}</ul>`;
}

// --------------------------------------------------------------------------- topbar
function applyTheme(theme){if(theme)document.documentElement.dataset.theme=theme;else document.documentElement.removeAttribute('data-theme');try{localStorage.setItem('oststl.theme',theme);}catch{}$('theme-select').value=theme;}
$('theme-select').onchange=event=>applyTheme(event.target.value);
$('theme-select').value=document.documentElement.getAttribute('data-theme')||'';

let appInfo = null;
async function loadAppInfo() {
  try {
    appInfo = await api('/api/appinfo');
    if (appInfo.cloud) {
      $('btn-pick-dir').classList.add('hidden');
      $('btn-build-as').classList.add('hidden');
      $('btn-reveal').classList.add('hidden');
      $('export-dir').value = 'Browser download';
      const label = document.querySelector('label[for="export-dir"]');
      if (label) label.textContent = 'Download location';
    }
    $('app-version').textContent = 'v' + appInfo.version;
    if(appInfo.services.feedbackEnabled&&appInfo.feedback_url){$('btn-feedback').classList.remove('hidden');$('btn-feedback').onclick=()=>window.open(appInfo.feedback_url,'_blank','noopener,noreferrer');}
    if(appInfo.services.updaterEnabled)checkUpdate();
  } catch (error) { status('Unable to connect to the workspace. ' + error.message, 'err'); }
}

async function checkUpdate() {
  try {
    const u = await api('/api/update-check');
    if (u.update_available) {
      const pill = $('update-pill');
      pill.href = u.url;
      pill.textContent = `⬆ Update ${u.latest}`;
      pill.classList.add('show');
    }
  } catch { /* offline or no releases */ }
}

// --------------------------------------------------------------------------- boot
writeSettings();
updateHiddenCount();
renderSlots();
refreshExportDir();
loadAppInfo();
checkUpdate();
if (project.bbox_wgs84) {
  drawAreaRect();
  fitAreaBounds();
}

// Accessible equivalents retain the existing map/project operations.
function showView(view){$('work').dataset.view=view;$('tab-map').setAttribute('aria-pressed',String(view==='map'));$('tab-settings').setAttribute('aria-pressed',String(view==='settings'));requestAnimationFrame(resizeVisibleMap);}
$('tab-map').onclick=()=>showView('map');$('tab-settings').onclick=()=>showView('settings');
window.addEventListener('resize',resizeVisibleMap);
function renderBuildingList(){const list=$('building-list');list.replaceChildren();buildingLayer?.eachLayer(layer=>{const p=layer.feature.properties;const label=document.createElement('label');const input=document.createElement('input');input.type='checkbox';input.dataset.building=p.id;input.checked=project.hidden_building_ids.includes(p.id);input.onchange=()=>toggleHidden(p.id);label.append(input,document.createTextNode('Hide building '+p.id));list.append(label);});}
function moveDesign(){const lon=Number($('design-lon').value),lat=Number($('design-lat').value);if(!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lon)>180||Math.abs(lat)>90){status('Enter valid longitude and latitude.','err');return;}project.design.anchor_lonlat=[lon,lat];ensureDesignMarker();save();status('Design position updated.','ok');}
$('design-lon').onchange=moveDesign;$('design-lat').onchange=moveDesign;$('btn-design-center').onclick=()=>{const center=map.getCenter();project.design.anchor_lonlat=[center.lng,center.lat];ensureDesignMarker();save();status('Design placed at map center.','ok');};
let hasSavedMapView = false;
try{const stored=JSON.parse(localStorage.getItem('oststl.map')||'null');if(stored?.center?.length===2&&stored.center.every(Number.isFinite)&&Number.isFinite(stored.zoom)){map.setView(stored.center,stored.zoom);hasSavedMapView=true;}const layerName=stored?.layer==='Netherlands'?'Regional topography (NL)':stored?.layer;if(layerName&&baseLayers[layerName]){Object.values(baseLayers).forEach(layer=>map.removeLayer(layer));baseLayers[layerName].addTo(map);}}catch{}
// Restore an existing workspace; locate new maps without a selected project area.
window.addEventListener('spanvision:map-location', event => {
  if(event.detail.map!==map.getContainer())return;
  const place=[event.detail.city,event.detail.country].filter(Boolean).join(', ');
  $('map-region-label').textContent=place ? 'YOUR AREA: '+place : 'YOUR LOCATION';
});
window.SpanvisionLocation.attachMap(map,{autoLocate:!project.bbox_wgs84&&!hasSavedMapView});
// Keep location actions outside the canvas so they cannot cover map guidance.
$('map-location-toolbar').append(map.getContainer().querySelector('.sv-map-location'));
function saveMapView(layerName){let previous={};try{previous=JSON.parse(localStorage.getItem('oststl.map')||'{}');const center=map.getCenter();localStorage.setItem('oststl.map',JSON.stringify({center:[center.lat,center.lng],zoom:map.getZoom(),layer:layerName||previous.layer||'Map'}));}catch{}}
map.on('moveend',()=>saveMapView());map.on('baselayerchange',event=>saveMapView(event.name));
if(project.design.filename){$('design-controls').classList.remove('hidden');$('design-info').classList.remove('hidden');$('design-info').textContent='Saved design: '+project.design.filename;ensureDesignMarker();}
// Leaflet mouse events retain the desktop workflow; these provide touch drawing.
const mapElement=$('map');
new ResizeObserver(resizeVisibleMap).observe(mapElement);
mapElement.addEventListener('touchstart',event=>{if(!mode||event.touches.length!==1)return;event.preventDefault();dragStart=map.mouseEventToLatLng(event.touches[0]);dragRect=L.rectangle(L.latLngBounds(dragStart,dragStart),{color:mode==='area'?'#4f9be0':'#d9604a',weight:2,fillOpacity:.08}).addTo(map);},{passive:false});
mapElement.addEventListener('touchmove',event=>{if(!dragStart||!dragRect)return;event.preventDefault();dragRect.setBounds(L.latLngBounds(dragStart,map.mouseEventToLatLng(event.touches[0])));},{passive:false});
mapElement.addEventListener('touchend',event=>{if(!dragStart||!dragRect)return;event.preventDefault();const bounds=dragRect.getBounds(),wasMode=mode;map.removeLayer(dragRect);dragStart=null;dragRect=null;if(bounds.getNorth()-bounds.getSouth()<1e-5){setMode(null);return;}if(wasMode==='area'){applyBbox([bounds.getWest(),bounds.getSouth(),bounds.getEast(),bounds.getNorth()]);setMode(null);}else hideInBounds(bounds,true);},{passive:false});

// Spanvision appearance bridge
window.addEventListener('spanvision:mode-change',()=>applyTheme(document.documentElement.dataset.svMode === 'light' ? 'light' : 'spanvision-mono'));
