// Public service addresses only. Database URLs and credentials stay on Render.
export const backendServices = Object.freeze({
  bim: { origin: 'https://spanvision-bim.onrender.com', health: '/health' },
  stl: { origin: 'https://spanvision-stl.onrender.com', health: '/api/ping' },
  fem: { origin: 'https://spanvision-fem-engine.onrender.com', health: '/health' },
});

export function backendRoutes(id) {
  if (id === 'hub') return Object.entries(backendServices).map(([tool, service]) => ({
    src: `/__suite/ready/${tool}`, dest: service.origin + service.health,
    headers: { 'Cache-Control': 'no-store' },
  }));
  if (id === 'fem') return [
    { src: '/api/engine-health', dest: backendServices.fem.origin + backendServices.fem.health, headers: { 'Cache-Control': 'no-store' } },
    { src: '/api/(toetsing|doorsnede)', dest: backendServices.fem.origin + '/api/$1', headers: { 'Cache-Control': 'no-store' } },
  ];
  return [];
}
