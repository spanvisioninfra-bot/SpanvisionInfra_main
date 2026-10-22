import { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { TabletCanvas } from './TabletCanvas';
import { InfoBar } from './InfoBar';
import { TabletToolbar } from './TabletToolbar';
import { LayerPanel } from './LayerPanel';
import { DrawingPicker } from './DrawingPicker';
import { MeasureTool } from './MeasureTool';
import { ZoomControls } from './ZoomControls';
import { GestureHints } from './GestureHints';
import { DrawingTabs } from './DrawingTabs';
import { ShapeActionBar } from './ShapeActionBar';
import { PropertyInspector } from './PropertyInspector';
import { SearchPanel } from './SearchPanel';
import { RadialMenu } from './RadialMenu';
import { MiniMap } from './MiniMap';
import { MarkupToolbar } from './MarkupToolbar';
import { MarkupCanvas } from './MarkupCanvas';
import type { MarkupToolType } from './MarkupToolbar';
import type { ThemeMode } from './ThemeToggle';
import { useFileOperations } from '../../hooks/file/useFileOperations';
import { useReviewStore } from '../../state/reviewStore';
import { exportReviewPNG } from '../../services/web/reviewExport';
import { notifyWeb, requestWebDialog } from '../../services/web/dialogService';
import type { MarkupStroke } from '../../services/web/draftStorage';
import { Download } from 'lucide-react';
import { useAppStore } from '../../state/appStore';
import { isPointNearShape } from '../../engine/geometry/GeometryUtils';
import { findNearestSnapPoint } from '../../engine/geometry/SnapUtils';

interface MeasurePoint {
  worldX: number;
  worldY: number;
}

function resolveTheme(mode: ThemeMode): 'dark' | 'light' | 'spanvision-mono' {
  if (mode === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode;
}

const EMPTY_STROKES: MarkupStroke[] = [];

export default function TabletApp() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Panel states
  const [layerPanelOpen, setLayerPanelOpen] = useState(false);
  const [drawingPickerOpen, setDrawingPickerOpen] = useState(false);
  const [measureActive, setMeasureActive] = useState(false);
  const [showInfoBar, setShowInfoBar] = useState(false);

  // Phase 2 states
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const sharedMode = document.documentElement.dataset.svMode;
    if (sharedMode === 'light') return 'light';
    if (sharedMode === 'dark') return 'spanvision-mono';
    try { return (localStorage.getItem('tablet-theme') as ThemeMode) || 'spanvision-mono'; } catch { return 'spanvision-mono'; }
  });
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [shapeActionScreen, setShapeActionScreen] = useState<{ x: number; y: number } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [markupActive, setMarkupActive] = useState(false);
  const [gestureHintsSeen, setGestureHintsSeen] = useState(() => {
    try { return localStorage.getItem('tablet-gesture-hints-seen') === 'true'; } catch { return false; }
  });
  const [radialMenu, setRadialMenu] = useState<{ x: number; y: number } | null>(null);
  const [miniMapVisible, setMiniMapVisible] = useState(false);
  const [propertyInspectorOpen, setPropertyInspectorOpen] = useState(false);
  const [tabletGridVisible, setTabletGridVisible] = useState(false);

  // Measure tool state
  const [measureA, setMeasureA] = useState<MeasurePoint | null>(null);
  const [measureB, setMeasureB] = useState<MeasurePoint | null>(null);
  const [measureAreaMode, setMeasureAreaMode] = useState(false);
  const [measureAreaPoints, setMeasureAreaPoints] = useState<MeasurePoint[]>([]);

  // Markup state
  const [markupTool, setMarkupTool] = useState<MarkupToolType>('pen');
  const [markupColor, setMarkupColor] = useState('#ffffff');
  const [markupWidth, setMarkupWidth] = useState(2);
  const documentId = useAppStore(s => s.activeDocumentId);
  const drawingId = useAppStore(s => s.activeDrawingId);
  const storedStrokes = useReviewStore(s => s.byDocument[documentId]?.[drawingId]);
  const markupStrokes = storedStrokes || EMPTY_STROKES;
  const setMarkupStrokes = useCallback((strokes: MarkupStroke[]) => {
    useReviewStore.getState().setStrokes(documentId, drawingId, strokes);
  }, [documentId, drawingId]);
  const { handleOpen: openProject } = useFileOperations();
  const [exporting, setExporting] = useState(false);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Theme resolution
  const resolvedTheme = useMemo(() => resolveTheme(theme), [theme, systemDark]);
  const isLight = resolvedTheme === 'light';

  // The phone viewer and the website use one appearance choice. Retain the
  // native Auto setting when its resolved mode already matches the website.
  useEffect(() => {
    const sync = () => {
      const light = document.documentElement.dataset.svMode === 'light';
      setTheme(current => (resolveTheme(current) === 'light') === light ? current : light ? 'light' : 'spanvision-mono');
    };
    window.addEventListener('spanvision:mode-change', sync);
    window.addEventListener('spanvision:mode-observed', sync);
    return () => {
      window.removeEventListener('spanvision:mode-change', sync);
      window.removeEventListener('spanvision:mode-observed', sync);
    };
  }, []);
  useEffect(() => {
    const appearance = (window as Window & { SpanvisionAppearance?: { getMode: () => string; setMode: (mode: string) => void } }).SpanvisionAppearance;
    const mode = isLight ? 'light' : 'dark';
    if (appearance && appearance.getMode() !== mode) appearance.setMode(mode);
  }, [isLight]);

  // Listen for system theme changes when in auto mode
  useEffect(() => {
    if (theme !== 'auto') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      // Force re-render
      setSystemDark(mq.matches);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  // Persist theme
  useEffect(() => {
    try { localStorage.setItem('tablet-theme', theme); } catch { notifyWeb('Theme preference could not be retained.', true); }
  }, [theme]);

  // Auto-hide info bar timer
  const infoBarTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const hasProject = useAppStore(s => s.shapes.length > 0 || s.drawings.length > 0);

  // Show info bar when a project is loaded, auto-hide after 3s
  const showInfoBarBriefly = useCallback(() => {
    setShowInfoBar(true);
    clearTimeout(infoBarTimerRef.current);
    infoBarTimerRef.current = setTimeout(() => setShowInfoBar(false), 3000);
  }, []);

  // Toggle info bar on canvas area tap (when not measuring)
  const toggleInfoBar = useCallback(() => {
    setShowInfoBar(prev => {
      if (prev) {
        clearTimeout(infoBarTimerRef.current);
        return false;
      }
      infoBarTimerRef.current = setTimeout(() => setShowInfoBar(false), 3000);
      return true;
    });
  }, []);

  const handleOpen = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      if (await openProject()) {
        setTimeout(() => useAppStore.getState().zoomToFit(), 100);
        showInfoBarBriefly();
      }
    } catch { setError('Could not open this file.'); }
    finally { setLoading(false); }
  }, [openProject, showInfoBarBriefly]);

  // Clear timer on unmount
  useEffect(() => {
    return () => clearTimeout(infoBarTimerRef.current);
  }, []);

  // Close all panels helper
  const closeAllPanels = useCallback(() => {
    setLayerPanelOpen(false);
    setDrawingPickerOpen(false);
    setSearchOpen(false);
    setPropertyInspectorOpen(false);
    setShapeActionScreen(null);
    setSelectedShapeId(null);
    setRadialMenu(null);
  }, []);

  // Handle measure toggle
  const handleMeasureToggle = useCallback(() => {
    setMeasureActive(prev => {
      if (prev) {
        setMeasureA(null);
        setMeasureB(null);
        setMeasureAreaPoints([]);
        useAppStore.getState().setCurrentSnapPoint(null);
        return false;
      }
      closeAllPanels();
      setMarkupActive(false);
      return true;
    });
  }, [closeAllPanels]);

  // Handle markup toggle
  const handleMarkupToggle = useCallback(() => {
    setMarkupActive(prev => {
      if (!prev) {
        closeAllPanels();
        setMeasureActive(false);
        setMeasureA(null);
        setMeasureB(null);
      }
      return !prev;
    });
  }, [closeAllPanels]);

  // Track measure state in refs for stable callback
  const measureARef = useRef(measureA);
  const measureBRef = useRef(measureB);
  const measureAreaModeRef = useRef(measureAreaMode);
  measureARef.current = measureA;
  measureBRef.current = measureB;
  measureAreaModeRef.current = measureAreaMode;

  // Handle canvas tap
  const handleCanvasTap = useCallback((worldX: number, worldY: number, screenX: number, screenY: number) => {
    // Dismiss radial menu on any tap
    setRadialMenu(null);

    // Dismiss shape action bar on any tap
    setShapeActionScreen(null);

    if (measureActive) {
      // Snap to geometry
      const s = useAppStore.getState();
      const visibleShapes = s.shapes.filter(sh => sh.drawingId === s.activeDrawingId);
      const snap = findNearestSnapPoint(
        { x: worldX, y: worldY },
        visibleShapes,
        s.activeSnaps,
        15 / s.viewport.zoom,
        s.gridSize
      );
      const finalX = snap ? snap.point.x : worldX;
      const finalY = snap ? snap.point.y : worldY;

      if (snap) {
        s.setCurrentSnapPoint(snap);
      } else {
        s.setCurrentSnapPoint(null);
      }

      const point = { worldX: finalX, worldY: finalY };

      if (measureAreaModeRef.current) {
        // Area mode: add vertex, close on tap near first point
        setMeasureAreaPoints(prev => {
          if (prev.length >= 3) {
            const firstDx = finalX - prev[0].worldX;
            const firstDy = finalY - prev[0].worldY;
            const distToFirst = Math.sqrt(firstDx * firstDx + firstDy * firstDy);
            if (distToFirst < 20 / s.viewport.zoom) {
              // Close polygon
              return prev;
            }
          }
          return [...prev, point];
        });
      } else {
        // Distance mode
        if (!measureARef.current || measureBRef.current) {
          setMeasureA(point);
          setMeasureB(null);
        } else {
          setMeasureB(point);
        }
      }
      return;
    }

    if (markupActive) {
      return; // MarkupCanvas handles its own events
    }

    // Shape selection tap
    const s = useAppStore.getState();
    const visibleShapes = s.shapes.filter(sh => sh.drawingId === s.activeDrawingId);
    const tolerance = 10 / s.viewport.zoom;

    // Find the tapped shape
    for (let i = visibleShapes.length - 1; i >= 0; i--) {
      const shape = visibleShapes[i];
      if (isPointNearShape({ x: worldX, y: worldY }, shape, tolerance)) {
        setSelectedShapeId(shape.id);
        s.selectShape(shape.id);
        setShapeActionScreen({ x: screenX, y: screenY });
        return;
      }
    }

    // Tapped empty space
    s.deselectAll();
    setSelectedShapeId(null);
    if (hasProject) toggleInfoBar();
  }, [measureActive, markupActive, hasProject, toggleInfoBar]);

  // Handle long-press
  const handleLongPress = useCallback((screenX: number, screenY: number) => {
    if (measureActive || markupActive) return;
    setRadialMenu({ x: screenX, y: screenY });
  }, [measureActive, markupActive]);

  // Handle layers toggle
  const handleLayersToggle = useCallback(() => {
    setLayerPanelOpen(prev => !prev);
    setDrawingPickerOpen(false);
    setPropertyInspectorOpen(false);
    setSearchOpen(false);
  }, []);

  // Handle drawings toggle
  const handleDrawingsToggle = useCallback(() => {
    setDrawingPickerOpen(prev => !prev);
    setLayerPanelOpen(false);
    setPropertyInspectorOpen(false);
    setSearchOpen(false);
  }, []);

  // Handle search toggle
  const handleSearchToggle = useCallback(() => {
    setSearchOpen(prev => !prev);
    setLayerPanelOpen(false);
    setDrawingPickerOpen(false);
    setPropertyInspectorOpen(false);
  }, []);

  // Handle grid toggle
  const handleGridToggle = useCallback(() => {
    setTabletGridVisible(prev => !prev);
  }, []);

  // Theme cycling
  const handleThemeCycle = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'spanvision-mono' ? 'dark' : prev === 'dark' ? 'light' : prev === 'light' ? 'auto' : 'spanvision-mono';
      return next;
    });
  }, []);

  // Shape action bar handlers
  const handleShapeInfo = useCallback(() => {
    setPropertyInspectorOpen(true);
    setShapeActionScreen(null);
    setLayerPanelOpen(false);
    setDrawingPickerOpen(false);
  }, []);

  const handleShapeZoomTo = useCallback(() => {
    const s = useAppStore.getState();
    if (selectedShapeId) {
      s.selectShape(selectedShapeId);
      // Simple zoom: just zoom in a bit toward the shape center
      // The selectShape will handle highlighting
    }
    setShapeActionScreen(null);
  }, [selectedShapeId]);

  const handleCopyXY = useCallback(() => {
    if (!selectedShapeId) return;
    const s = useAppStore.getState();
    const shape = s.shapes.find(sh => sh.id === selectedShapeId);
    if (!shape) return;
    let x = 0, y = 0;
    const anyShape = shape as unknown as Record<string, unknown>;
    if ('position' in anyShape && typeof anyShape.position === 'object' && anyShape.position) {
      const pos = anyShape.position as { x: number; y: number };
      x = pos.x; y = pos.y;
    } else if ('center' in anyShape && typeof anyShape.center === 'object' && anyShape.center) {
      const c = anyShape.center as { x: number; y: number };
      x = c.x; y = c.y;
    } else if ('start' in anyShape && typeof anyShape.start === 'object' && anyShape.start) {
      const s = anyShape.start as { x: number; y: number };
      x = s.x; y = s.y;
    }
    navigator.clipboard?.writeText(`${x.toFixed(2)}, ${y.toFixed(2)}`).catch(() => {});
    setShapeActionScreen(null);
  }, [selectedShapeId]);

  // Markup handlers
  const handleMarkupUndo = useCallback(() => {
    setMarkupStrokes(markupStrokes.slice(0, -1));
  }, [markupStrokes, setMarkupStrokes]);

  const handleMarkupClear = useCallback(async () => {
    if (!markupStrokes.length) return;
    const result = await requestWebDialog({ title: 'Clear markup?', message: 'Remove review strokes from this drawing. Drawing geometry stays intact.', actions: [{ value: 'cancel', label: 'Cancel' }, { value: 'clear', label: 'Clear markup', primary: true }] });
    if (result?.action === 'clear') setMarkupStrokes([]);
  }, [markupStrokes, setMarkupStrokes]);

  // Measure mode toggle
  const handleMeasureModeToggle = useCallback(() => {
    setMeasureAreaMode(prev => !prev);
    setMeasureA(null);
    setMeasureB(null);
    setMeasureAreaPoints([]);
    useAppStore.getState().setCurrentSnapPoint(null);
  }, []);

  // Determine canvas tap handler
  const canvasTapHandler = measureActive || (!markupActive && hasProject) ? handleCanvasTap : undefined;

  return (
    <div
      className={`tablet-workspace fixed inset-0 ${isLight ? 'bg-gray-50' : 'bg-cad-bg'}`}
      data-theme={resolvedTheme}
    >
      <TabletCanvas
        onCanvasTap={canvasTapHandler}
        onLongPress={handleLongPress}
        gridVisible={tabletGridVisible}
        whiteBackground={isLight}
      />

      <span className="web-mobile-brand">Spanvision Infra · 2D CAD</span>
      {!markupActive && !measureActive && <button className="web-mobile-download" disabled={exporting} onClick={async () => {
        setExporting(true);
        try { await exportReviewPNG(useAppStore.getState().projectName); }
        catch (err) { notifyWeb(`Could not export PNG: ${err}`, true); }
        finally { setExporting(false); }
      }}><Download size={14} />{exporting ? 'Exporting…' : 'Review PNG'}</button>}

      {/* Gesture hints overlay */}
      {!gestureHintsSeen && (
        <GestureHints onDismiss={() => setGestureHintsSeen(true)} />
      )}

      {/* Info bar */}
      {hasProject && <InfoBar visible={showInfoBar} isLight={isLight} />}

      {/* Drawing tabs */}
      {hasProject && (
        <DrawingTabs
          onOverflow={() => setDrawingPickerOpen(true)}
          isLight={isLight}
        />
      )}

      {/* Navigation rail (left) */}
      <TabletToolbar
        onOpen={handleOpen}
        onSearch={handleSearchToggle}
        onMeasure={handleMeasureToggle}
        onMarkup={handleMarkupToggle}
        onGridToggle={handleGridToggle}
        onLayers={handleLayersToggle}
        onDrawings={handleDrawingsToggle}
        onMiniMap={() => setMiniMapVisible(prev => !prev)}
        measureActive={measureActive}
        markupActive={markupActive}
        gridVisible={tabletGridVisible}
        layerPanelOpen={layerPanelOpen}
        drawingPickerOpen={drawingPickerOpen}
        miniMapVisible={miniMapVisible}
        loading={loading}
        theme={theme}
        onThemeCycle={handleThemeCycle}
        isLight={isLight}
      />

      {/* Zoom controls + grid toggle */}
      <ZoomControls gridVisible={tabletGridVisible} onGridToggle={handleGridToggle} />

      {/* Mini-map */}
      <MiniMap visible={miniMapVisible} isLight={isLight} />

      {/* Shape action bar (floating) */}
      {shapeActionScreen && selectedShapeId && !measureActive && !markupActive && (
        <ShapeActionBar
          screenX={shapeActionScreen.x}
          screenY={shapeActionScreen.y}
          onInfo={handleShapeInfo}
          onZoomTo={handleShapeZoomTo}
          onCopyXY={handleCopyXY}
          onDismiss={() => { setShapeActionScreen(null); }}
        />
      )}

      {/* Property inspector */}
      <PropertyInspector
        shapeId={selectedShapeId}
        open={propertyInspectorOpen}
        onClose={() => setPropertyInspectorOpen(false)}
        isLight={isLight}
      />

      {/* Layer panel */}
      <LayerPanel
        open={layerPanelOpen}
        onClose={() => setLayerPanelOpen(false)}
        isLight={isLight}
      />

      {/* Search panel */}
      <SearchPanel
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        isLight={isLight}
      />

      {/* Drawing picker */}
      <DrawingPicker open={drawingPickerOpen} onClose={() => setDrawingPickerOpen(false)} />

      {/* Markup overlay */}
      <MarkupCanvas key={`${documentId}:${drawingId}`}
        active={markupActive}
        tool={markupTool}
        color={markupColor}
        width={markupWidth}
        strokes={markupStrokes}
        onStrokesChange={setMarkupStrokes}
      />

      {/* Markup toolbar */}
      {markupActive && (
        <MarkupToolbar
          activeTool={markupTool}
          color={markupColor}
          width={markupWidth}
          onToolChange={setMarkupTool}
          onColorChange={setMarkupColor}
          onWidthChange={setMarkupWidth}
          onUndo={handleMarkupUndo}
          onClear={handleMarkupClear}
          onClose={handleMarkupToggle}
          isLight={isLight}
        />
      )}

      {/* Measure overlay */}
      {measureActive && (
        <MeasureTool
          pointA={measureA}
          pointB={measureB}
          areaMode={measureAreaMode}
          areaPoints={measureAreaPoints}
          onToggleMode={handleMeasureModeToggle}
          isLight={isLight}
        />
      )}

      {/* Radial menu */}
      {radialMenu && (
        <RadialMenu
          screenX={radialMenu.x}
          screenY={radialMenu.y}
          onClose={() => setRadialMenu(null)}
          onSearch={handleSearchToggle}
          onThemeCycle={handleThemeCycle}
        />
      )}

      {/* Error toast */}
      {error && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 px-4 py-3 bg-red-900/90 text-red-100 text-sm rounded-lg shadow-lg backdrop-blur-sm max-w-[80vw] text-center`}
          style={{
            zIndex: 70,
            top: 'calc(16px + env(safe-area-inset-top, 0px))',
          }}
          onClick={(e) => {
            e.stopPropagation();
            setError(null);
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
