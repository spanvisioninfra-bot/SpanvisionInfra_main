import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import CropStage, { type CropStageHandle } from "./CropStage";
import "./ImageCropDialog.css";
import "./PdfCropDialog.css";

/**
 * PdfCropDialog — two-phase modal for using a PDF as a tekening overlay.
 *
 * Phase 1 — page picker
 *   The PDF is parsed with pdfjs-dist and every page is rendered to a
 *   small thumbnail (scale 0.4) on a background task. The user picks
 *   one page by clicking its thumbnail.
 *
 * Phase 2 — crop
 *   The chosen page is re-rendered at higher resolution (scale 2.0)
 *   into an off-screen canvas, the PNG data URL of that render goes
 *   into the shared `<CropStage>` (same crop UI as for raster images),
 *   and the user trims away whatever they don't need. On confirm we
 *   hand the cropped PNG data URL back to the caller.
 *
 * The dialog re-uses `ImageCropDialog.css` so the chrome looks identical
 * to the raster crop step; the page-picker grid + back-button live in
 * a small `PdfCropDialog.css` next to this file.
 */

interface Props {
  /** Object URL pointing at the PDF blob. Owned by the caller. */
  pdfSrc: string;
  fileName: string;
  onConfirm: (croppedDataUrl: string) => void;
  onCancel: () => void;
}

// Render-scale tuning. Thumbnail scale is small enough that even
// 100-page reports stay responsive; the page-crop scale is generous
// so the user has plenty of resolution to crop into.
const THUMB_SCALE = 0.4;
const PAGE_SCALE = 2.0;

export default function PdfCropDialog({
  pdfSrc,
  fileName,
  onConfirm,
  onCancel,
}: Props) {
  const [thumbs, setThumbs] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  // 1-indexed page number — null while the user is still picking.
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  // PNG data URL of the chosen page at PAGE_SCALE.
  const [pageImage, setPageImage] = useState<string | null>(null);
  const stageRef = useRef<CropStageHandle>(null);
  const [info, setInfo] = useState("…");

  // ── Phase 1: load PDF and render thumbnails ──────────────────
  // Keep one document/worker for thumbnails and the crop render.
  // Destroy it on close, cancellation or replacement.
  //
  // pdfjs-dist is loaded *lazily* via a dynamic import so the
  // (relatively large) library and its Web Worker only land in the
  // browser when the user actually opens a PDF. This also keeps any
  // pdfjs init failure isolated to this dialog instead of blocking
  // the whole app at startup.
  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | undefined;
    let render: RenderTask | undefined;
    setError(null);
    setThumbs(null);
    setPdfDoc(null);
    setSelectedPage(null);
    setPageImage(null);
    (async () => {
      try {
        const { getDocument } = await import("../../utils/pdfjsSetup");
        if (cancelled) return;
        task = getDocument({ url: pdfSrc });
        const doc = await task.promise;
        if (cancelled) return;
        setPdfDoc(doc);
        const out: string[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          if (cancelled) return;
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale: THUMB_SCALE });
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          // pdfjs ≥ 5 requires `canvas` in the render params; older
          // versions accepted just `canvasContext`. We pass both so
          // we don't depend on which subminor is installed.
          render = page.render({
            canvasContext: ctx,
            canvas,
            viewport,
          } as Parameters<typeof page.render>[0]);
          await render.promise;
          out.push(canvas.toDataURL("image/png"));
          page.cleanup();
        }
        if (!cancelled) setThumbs(out);
      } catch (err) {
        if (!cancelled) {
          console.error("PDF load failed", err);
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
      render?.cancel();
      void task?.destroy().catch(() => {});
    };
  }, [pdfSrc]);

  // ── Phase 2: render the picked page at higher resolution ─────
  useEffect(() => {
    if (selectedPage === null || !pdfDoc) return;
    let cancelled = false;
    let render: RenderTask | undefined;
    (async () => {
      try {
        setPageImage(null);
        const page = await pdfDoc.getPage(selectedPage);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: PAGE_SCALE });
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Unable to create the PDF page canvas");
        render = page.render({
          canvasContext: ctx,
          canvas,
          viewport,
        } as Parameters<typeof page.render>[0]);
        await render.promise;
        if (!cancelled) setPageImage(canvas.toDataURL("image/png"));
        page.cleanup();
      } catch (err) {
        if (!cancelled) {
          console.error("PDF page render failed", err);
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
      render?.cancel();
    };
  }, [pdfDoc, selectedPage]);

  const doConfirm = useCallback(() => {
    const dataUrl = stageRef.current?.commit();
    if (dataUrl) onConfirm(dataUrl);
  }, [onConfirm]);

  // Keyboard shortcuts: Esc cancels, Enter advances in the right phase.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === "Enter" && selectedPage !== null && pageImage) {
        e.preventDefault();
        doConfirm();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, selectedPage, pageImage, doConfirm]);

  // ── Render ───────────────────────────────────────────────────

  // Hard failure: PDF could not be parsed at all.
  if (error) {
    return (
      <div className="icrop-backdrop" onMouseDown={onCancel}>
        <div
          className="icrop-dialog"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <header className="icrop-header">
            <span className="icrop-title">Unable to read PDF</span>
            <span className="icrop-filename" title={fileName}>
              {fileName}
            </span>
          </header>
          <div className="pcrop-error">{error}</div>
          <footer className="icrop-footer">
            <div />
            <div className="icrop-actions">
              <button
                type="button"
                className="icrop-btn"
                onClick={onCancel}
              >
                Close
              </button>
            </div>
          </footer>
        </div>
      </div>
    );
  }

  // Phase 2 — page chosen, crop UI showing.
  if (selectedPage !== null) {
    return (
      <div className="icrop-backdrop" onMouseDown={onCancel}>
        <div
          className="icrop-dialog"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <header className="icrop-header pcrop-header">
            <button
              type="button"
              className="icrop-btn pcrop-back-btn"
              onClick={() => {
                setSelectedPage(null);
                setPageImage(null);
              }}
              title={"Choose another page"}
            >
              ← Another page
            </button>
            <span className="icrop-title">
              Page {selectedPage} crop
            </span>
            <span className="icrop-filename" title={fileName}>
              {fileName}
            </span>
          </header>
          {pageImage ? (
            <CropStage
              ref={stageRef}
              imageSrc={pageImage}
              onCropChange={(c) =>
                setInfo(`${c.cropWidthPx} × ${c.cropHeightPx} px`)
              }
            />
          ) : (
            <div className="pcrop-loading">Rendering page…</div>
          )}
          <footer className="icrop-footer">
            <div className="icrop-info">{pageImage ? info : ""}</div>
            <div className="icrop-actions">
              <button
                type="button"
                className="icrop-btn"
                onClick={onCancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className="icrop-btn icrop-btn-primary"
                disabled={!pageImage}
                onClick={doConfirm}
              >
                Crop &amp; add
              </button>
            </div>
          </footer>
        </div>
      </div>
    );
  }

  // Phase 1 — page picker (default).
  return (
    <div className="icrop-backdrop" onMouseDown={onCancel}>
      <div
        className="icrop-dialog pcrop-picker-dialog"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="icrop-header">
          <span className="icrop-title">PDF — select page</span>
          <span className="icrop-filename" title={fileName}>
            {fileName}
          </span>
        </header>
        {thumbs ? (
          <div className="pcrop-thumbs">
            {thumbs.map((src, i) => (
              <button
                key={i}
                type="button"
                className="pcrop-thumb"
                onClick={() => setSelectedPage(i + 1)}
                title={`Page ${i + 1}`}
              >
                <img src={src} alt={`Page ${i + 1}`} />
                <span className="pcrop-thumb-label">Page {i + 1}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="pcrop-loading">Reading PDF…</div>
        )}
        <footer className="icrop-footer">
          <div className="icrop-info">
            {thumbs
              ? `${thumbs.length} page${thumbs.length === 1 ? "" : "s"}`
              : ""}
          </div>
          <div className="icrop-actions">
            <button type="button" className="icrop-btn" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
