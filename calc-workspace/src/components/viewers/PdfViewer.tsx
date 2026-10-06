/**
 * PDF Viewer with measurement tools (length, area).
 * Uses pdfjs-dist for rendering. Measurements are drawn on an overlay canvas.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';

type Tool = 'pan' | 'length' | 'area';

interface Point { x: number; y: number; }
interface Measurement {
  id: string;
  type: 'length' | 'area';
  page: number;
  points: Point[];
  scale: number; // mm per PDF unit
  value: number; // computed length (m) or area (m²)
}

export function PdfViewer() {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<any>(null);
  const loadingTaskRef = useRef<any>(null);
  const renderTaskRef = useRef<any>(null);
  const drawOverlayRef = useRef<() => void>(() => {});
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [tool, setTool] = useState<Tool>('pan');
  const [scale, setScale] = useState(1); // mm per PDF unit
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [zoom, setZoom] = useState(1.5);
  const setPdfMeasurements = useAppStore(s => s.setPdfMeasurements);

  // Sync measurements to global store for QuantityPicker
  useEffect(() => {
    setPdfMeasurements(measurements.map((m, i) => ({
      id: m.id,
      label: t('pdfViewer.measurementLabel', {
        type: m.type === 'length' ? t('pdfViewer.length') : t('pdfViewer.area'),
        index: i + 1,
        page: m.page,
      }),
      type: m.type,
      page: m.page,
      value: m.value,
    })));
  }, [measurements, setPdfMeasurements, t]);

  // Render current page
  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdfRef.current || !canvasRef.current) return;
    renderTaskRef.current?.cancel();
    const document = pdfRef.current;
    const pdfPage = await pdfRef.current.getPage(pageNum);
    if (pdfRef.current !== document || !canvasRef.current) return;
    const viewport = pdfPage.getViewport({ scale: zoom });
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const task = pdfPage.render({ canvasContext: ctx, viewport, canvas });
    renderTaskRef.current = task;
    await task.promise;
    if (renderTaskRef.current !== task) return;

    if (overlayRef.current) {
      overlayRef.current.width = viewport.width;
      overlayRef.current.height = viewport.height;
      drawOverlayRef.current();
    }
  }, [zoom]);

  const drawOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const pageMeasurements = measurements.filter(m => m.page === page);
    for (const m of pageMeasurements) {
      ctx.strokeStyle = m.type === 'length' ? '#e74c3c' : '#3498db';
      ctx.fillStyle = m.type === 'length' ? 'rgba(231,76,60,0.1)' : 'rgba(52,152,219,0.2)';
      ctx.lineWidth = 2;

      if (m.points.length === 0) continue;

      ctx.beginPath();
      ctx.moveTo(m.points[0].x * zoom, m.points[0].y * zoom);
      for (let i = 1; i < m.points.length; i++) {
        ctx.lineTo(m.points[i].x * zoom, m.points[i].y * zoom);
      }
      if (m.type === 'area') {
        ctx.closePath();
        ctx.fill();
      }
      ctx.stroke();

      // Draw points
      for (const p of m.points) {
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.arc(p.x * zoom, p.y * zoom, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Label
      const last = m.points[m.points.length - 1];
      ctx.fillStyle = ctx.strokeStyle;
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(
        m.type === 'length' ? `${m.value.toFixed(2)} m` : `${m.value.toFixed(2)} m²`,
        last.x * zoom + 8, last.y * zoom - 8
      );
    }

    // Draw current points (in-progress measurement)
    if (currentPoints.length > 0) {
      ctx.strokeStyle = tool === 'length' ? '#e74c3c' : '#3498db';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(currentPoints[0].x * zoom, currentPoints[0].y * zoom);
      for (let i = 1; i < currentPoints.length; i++) {
        ctx.lineTo(currentPoints[i].x * zoom, currentPoints[i].y * zoom);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      for (const p of currentPoints) {
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.arc(p.x * zoom, p.y * zoom, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [measurements, page, currentPoints, tool, zoom]);
  drawOverlayRef.current = drawOverlay;

  useEffect(() => { drawOverlay(); }, [drawOverlay]);

  useEffect(() => {
    if (pdfRef.current) void renderPage(page).catch(reason => {
      if (reason?.name !== 'RenderingCancelledException') setError('The PDF page could not be rendered. Try reopening the document.');
    });
    return () => renderTaskRef.current?.cancel();
  }, [page, fileName, renderPage]);

  useEffect(() => () => {
    renderTaskRef.current?.cancel();
    void loadingTaskRef.current?.destroy();
  }, []);

  const loadPdf = useCallback(async (file: File) => {
    setError('');
    const pdfjs = await import('pdfjs-dist');
    const { default: pdfWorkerUrl } = await import('pdfjs-dist/build/pdf.worker.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

    renderTaskRef.current?.cancel();
    await loadingTaskRef.current?.destroy();
    pdfRef.current = null;
    setFileName('');
    const buffer = await file.arrayBuffer();
    const task = pdfjs.getDocument({ data: buffer });
    loadingTaskRef.current = task;
    const pdf = await task.promise;
    if (loadingTaskRef.current !== task) return;
    pdfRef.current = pdf;
    setNumPages(pdf.numPages);
    setPage(1);
    setFileName(file.name);
    setMeasurements([]);
    setCurrentPoints([]);
  }, []);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (tool === 'pan' || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    setCurrentPoints([...currentPoints, { x, y }]);
  };

  const handleCanvasDoubleClick = () => {
    if (currentPoints.length < 2) return;
    let value = 0;
    if (tool === 'length') {
      for (let i = 1; i < currentPoints.length; i++) {
        const dx = currentPoints[i].x - currentPoints[i - 1].x;
        const dy = currentPoints[i].y - currentPoints[i - 1].y;
        value += Math.sqrt(dx * dx + dy * dy);
      }
      value = (value * scale) / 1000; // mm → m
    } else if (tool === 'area') {
      // Shoelace formula
      let area = 0;
      for (let i = 0; i < currentPoints.length; i++) {
        const j = (i + 1) % currentPoints.length;
        area += currentPoints[i].x * currentPoints[j].y;
        area -= currentPoints[j].x * currentPoints[i].y;
      }
      value = Math.abs(area / 2) * (scale * scale) / 1_000_000; // mm² → m²
    }
    setMeasurements([...measurements, {
      id: crypto.randomUUID(),
      type: tool as 'length' | 'area',
      page,
      points: currentPoints,
      scale,
      value,
    }]);
    setCurrentPoints([]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void loadPdf(file).catch(() => setError('The PDF could not be opened. Choose a valid, unencrypted PDF document.'));
    e.target.value = '';
  };

  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px', fontSize: 12, border: 'none', borderRadius: 4,
    cursor: 'pointer', background: active ? 'var(--theme-accent)' : 'var(--theme-surface)',
    color: active ? 'var(--theme-accent-text)' : 'var(--theme-text)',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--theme-content-bg)' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', gap: 8, alignItems: 'center', padding: 8,
        background: 'var(--theme-surface)', borderBottom: '1px solid var(--theme-border)', flexShrink: 0,
      }}>
        <button style={btnStyle(false)} onClick={() => fileInputRef.current?.click()}>
          {t('pdfViewer.openPdf')}
        </button>
        <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleFileChange} />
        {fileName && <span style={{ fontSize: 11, color: 'var(--theme-text-secondary)' }}>{fileName}</span>}

        <div style={{ width: 1, height: 24, background: 'var(--theme-border)', margin: '0 4px' }} />

        <button style={btnStyle(tool === 'pan')} onClick={() => setTool('pan')}>{t('pdfViewer.pan')}</button>
        <button style={btnStyle(tool === 'length')} onClick={() => setTool('length')}>📏 {t('pdfViewer.length')}</button>
        <button style={btnStyle(tool === 'area')} onClick={() => setTool('area')}>⬛ {t('pdfViewer.area')}</button>

        <div style={{ width: 1, height: 24, background: 'var(--theme-border)', margin: '0 4px' }} />

        <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
          {t('pdfViewer.scaleLabel')}
          <input
            type="number"
            value={scale}
            onChange={(e) => setScale(parseFloat(e.target.value) || 1)}
            style={{ width: 60, padding: '2px 4px', fontSize: 11 }}
          />
        </label>

        <div style={{ width: 1, height: 24, background: 'var(--theme-border)', margin: '0 4px' }} />

        <button style={btnStyle(false)} onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}>−</button>
        <span style={{ fontSize: 11, minWidth: 40, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button style={btnStyle(false)} onClick={() => setZoom(z => Math.min(4, z + 0.25))}>+</button>

        {numPages > 0 && (
          <>
            <div style={{ width: 1, height: 24, background: 'var(--theme-border)', margin: '0 4px' }} />
            <button style={btnStyle(false)} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>◀</button>
            <span style={{ fontSize: 11 }}>{t('pdfViewer.page', { page, total: numPages })}</span>
            <button style={btnStyle(false)} onClick={() => setPage(p => Math.min(numPages, p + 1))} disabled={page >= numPages}>▶</button>
          </>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: 11 }}>
          <span>📏 {measurements.filter(m => m.type === 'length').reduce((s, m) => s + m.value, 0).toFixed(2)} m</span>
          <span>⬛ {measurements.filter(m => m.type === 'area').reduce((s, m) => s + m.value, 0).toFixed(2)} m²</span>
          <button
            style={{ ...btnStyle(false), background: 'var(--theme-surface-elevated, var(--theme-surface))', color: 'var(--theme-danger-color)' }}
            onClick={() => setMeasurements([])}
            disabled={measurements.length === 0}
          >{t('pdfViewer.clearMeasurements')}</button>
        </div>
      </div>

      {/* PDF canvas */}
      {error && <p role="alert" style={{ padding: '8px 16px', color: 'var(--theme-danger-color)' }}>{error}</p>}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', padding: 16 }}>
        {!fileName ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--theme-text-secondary)', fontSize: 14 }}>
            {t('pdfViewer.emptyPrefix')} <strong style={{ margin: '0 4px' }}>{t('pdfViewer.openPdf')}</strong> {t('pdfViewer.emptySuffix')}
          </div>
        ) : (
          <div style={{ position: 'relative', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
            <canvas ref={canvasRef} style={{ display: 'block' }} />
            <canvas
              ref={overlayRef}
              style={{
                position: 'absolute', top: 0, left: 0,
                cursor: tool === 'pan' ? 'grab' : 'crosshair',
              }}
              onClick={handleCanvasClick}
              onDoubleClick={handleCanvasDoubleClick}
            />
          </div>
        )}
      </div>

      {/* Measurements list */}
      {measurements.length > 0 && (
        <div style={{
          maxHeight: 120, overflow: 'auto', padding: 8, background: 'var(--theme-surface)',
          borderTop: '1px solid var(--theme-border)', fontSize: 11, flexShrink: 0,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('pdfViewer.measurements')}</div>
          {measurements.map((m, i) => (
            <div key={m.id} style={{ display: 'flex', gap: 8, padding: '2px 0' }}>
              <span style={{ color: m.type === 'length' ? '#e74c3c' : '#3498db' }}>
                {m.type === 'length' ? '📏' : '⬛'}
              </span>
              <span>{t('pdfViewer.measurementRow', { index: i + 1, page: m.page })}</span>
              <span style={{ marginLeft: 'auto', fontWeight: 600 }}>
                {m.type === 'length' ? `${m.value.toFixed(2)} m` : `${m.value.toFixed(2)} m²`}
              </span>
              <button
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--theme-danger-color)', padding: 0 }}
                onClick={() => setMeasurements(measurements.filter(x => x.id !== m.id))}
              >✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
