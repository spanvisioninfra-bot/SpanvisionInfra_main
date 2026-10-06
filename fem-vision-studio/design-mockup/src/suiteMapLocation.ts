// Generated into each map tool by branding/appearance.mjs.
import type { Map, TileLayerOptions } from 'leaflet';

export const WORLD_CENTER: [number, number] = [0, 0];
export const WORLD_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const WORLD_TILE_OPTIONS: TileLayerOptions = {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 24, maxNativeZoom: 19,
};
export const NETHERLANDS_BOUNDS: [[number, number], [number, number]] = [[50.5, 3], [54, 7.5]];
interface MapLocationOptions { autoLocate?: boolean; zoom?: number }
interface LocationController { locate(): Promise<void>; cancel(): void; destroy(): void }
interface LocationService {
  attachMap(map: Map, options?: MapLocationOptions): LocationController;
  cancelMap(map: Map): void;
}
function service(): LocationService {
  return (window as unknown as { SpanvisionLocation: LocationService }).SpanvisionLocation;
}
export function attachMapLocation(map: Map, options?: MapLocationOptions) { return service().attachMap(map, options); }
export function cancelMapLocation(map: Map) { service().cancelMap(map); }
