/**
 * BAG3D Panel — Interactive map for downloading 3D buildings from 3dbag.nl
 *
 * Uses Leaflet for map display and rectangle selection.
 * Downloads CityJSON data and adds buildings to the 3D viewer.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { attachMapLocation, WORLD_CENTER, WORLD_TILES, WORLD_TILE_OPTIONS, NETHERLANDS_BOUNDS } from '../../suiteMapLocation';
import { useModal } from '../useModal';
import { X, Download, MapPin } from 'lucide-react';
import { fetchBuildings, type RDBBox, type FetchProgress } from '../../engine/bag3d/BAG3DClient';
import { wgs84ToRD, parseCityJSON } from '../../engine/bag3d/CityJSONParser';

interface BAG3DPanelProps {
  onClose: () => void;
  onBuildingsLoaded: (geometry: THREE.BufferGeometry, buildingCount: number) => void;
}

type LoD = '1.2' | '1.3' | '2.2';

export function BAG3DPanel({ onClose, onBuildingsLoaded }: BAG3DPanelProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useModal(dialogRef, onClose);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const rectangleRef = useRef<L.Rectangle | null>(null);
  const [bbox, setBbox] = useState<{ sw: L.LatLng; ne: L.LatLng } | null>(null);
  const [lod, setLod] = useState<LoD>('1.2');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<FetchProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locationLabel, setLocationLabel] = useState('Worldwide map');
  const [drawingMode, setDrawingMode] = useState(false);
  const drawStartRef = useRef<L.LatLng | null>(null);

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: WORLD_CENTER,
      zoom: 2,
      zoomControl: true,
    });

    L.tileLayer(WORLD_TILES, WORLD_TILE_OPTIONS).addTo(map);

    mapInstanceRef.current = map;
    const onLocation = (event: Event) => {
      const detail = (event as CustomEvent<{ map: HTMLElement; city?: string; country?: string }>).detail;
      if (detail.map !== map.getContainer()) return;
      const place = [detail.city, detail.country].filter(Boolean).join(', ');
      setLocationLabel(place ? `Your area: ${place}` : 'Your location');
    };
    window.addEventListener('spanvision:map-location', onLocation);
    attachMapLocation(map);

    return () => {
      window.removeEventListener('spanvision:map-location', onLocation);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Handle draw mode
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!drawingMode) {
      map.dragging.enable();
      map.getContainer().style.cursor = '';
      return;
    }

    map.dragging.disable();
    map.getContainer().style.cursor = 'crosshair';

    const onMouseDown = (e: L.LeafletMouseEvent) => {
      drawStartRef.current = e.latlng;
    };

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      if (!drawStartRef.current) return;

      if (rectangleRef.current) {
        map.removeLayer(rectangleRef.current);
      }

      const bounds = L.latLngBounds(drawStartRef.current, e.latlng);
      rectangleRef.current = L.rectangle(bounds, {
        color: getComputedStyle(document.documentElement).getPropertyValue('--theme-text').trim(),
        weight: 2,
        fillOpacity: 0.15,
      }).addTo(map);
    };

    const onMouseUp = (e: L.LeafletMouseEvent) => {
      if (!drawStartRef.current) return;

      const sw = L.latLng(
        Math.min(drawStartRef.current.lat, e.latlng.lat),
        Math.min(drawStartRef.current.lng, e.latlng.lng)
      );
      const ne = L.latLng(
        Math.max(drawStartRef.current.lat, e.latlng.lat),
        Math.max(drawStartRef.current.lng, e.latlng.lng)
      );

      setBbox({ sw, ne });
      drawStartRef.current = null;
      setDrawingMode(false);
    };

    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);

    return () => {
      map.off('mousedown', onMouseDown);
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
    };
  }, [drawingMode]);

  const handleDownload = useCallback(async () => {
    if (!bbox) return;
    if (!L.latLngBounds(NETHERLANDS_BOUNDS).contains(L.latLngBounds(bbox.sw, bbox.ne))) {
      setError('3D BAG building data covers the Netherlands. Select an area within its coverage.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Convert WGS84 bbox to RD New
      const [rdMinX, rdMinY] = wgs84ToRD(bbox.sw.lng, bbox.sw.lat);
      const [rdMaxX, rdMaxY] = wgs84ToRD(bbox.ne.lng, bbox.ne.lat);

      const rdBbox: RDBBox = {
        minX: rdMinX,
        minY: rdMinY,
        maxX: rdMaxX,
        maxY: rdMaxY,
      };

      const result = await fetchBuildings(rdBbox, lod, setProgress);

      if (result.features.length === 0) {
        setError('No buildings found in this area');
        return;
      }

      const { geometry, buildingCount } = parseCityJSON(result.features, result.transform, lod);
      onBuildingsLoaded(geometry, buildingCount);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [bbox, lod, onBuildingsLoaded, onClose]);

  return (
    <dialog ref={dialogRef} className="bag3d-panel workspace-dialog" aria-labelledby="bag3d-title">
        {/* Header */}
        <div className="bag3d-panel-header">
          <div className="bag3d-panel-title">
            <MapPin size={16} />
            <span id="bag3d-title">3D BAG - Download Buildings</span>
          </div>
          <button className="bag3d-close-btn" aria-label="Close building download" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Map */}
        <div className="bag3d-map-container" ref={mapRef} />

        {/* Controls */}
        <div className="bag3d-controls">
          <div className="bag3d-bbox-info" title="3DBAG building data currently covers the Netherlands">{locationLabel} · Building source: 3DBAG (regional)</div>
          <div className="bag3d-control-row">
            <button
              className={`bag3d-draw-btn ${drawingMode ? 'active' : ''}`}
              onClick={() => setDrawingMode(!drawingMode)}
              disabled={loading}
            >
              {drawingMode ? 'Drawing...' : 'Draw Area'}
            </button>

            <div className="bag3d-lod-select">
              <label>LoD:</label>
              <select value={lod} onChange={(e) => setLod(e.target.value as LoD)}>
                <option value="1.2">1.2 (Simple)</option>
                <option value="1.3">1.3 (Medium)</option>
                <option value="2.2">2.2 (Detailed)</option>
              </select>
            </div>

            <button
              className="bag3d-download-btn"
              onClick={handleDownload}
              disabled={!bbox || loading}
            >
              <Download size={14} />
              {loading ? 'Downloading...' : 'Download'}
            </button>
          </div>

          {bbox && (
            <div className="bag3d-bbox-info">
              Area: {bbox.sw.lat.toFixed(4)}, {bbox.sw.lng.toFixed(4)} &rarr;{' '}
              {bbox.ne.lat.toFixed(4)}, {bbox.ne.lng.toFixed(4)}
            </div>
          )}

          {progress && loading && (
            <div className="bag3d-progress">
              {progress.status} ({progress.loaded} features)
            </div>
          )}

          {error && <div role="alert" className="bag3d-error">{error}</div>}
        </div>
    </dialog>
  );
}
