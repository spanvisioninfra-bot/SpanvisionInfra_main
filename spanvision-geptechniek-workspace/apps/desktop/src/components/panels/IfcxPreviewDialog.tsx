import { BRAND } from "../../branding";
import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Modal from "../Modal";
import { useCptStore } from "../../store/useCptStore";
import {
  getLatestTekening,
  tekeningStateToIfcgis,
  titleBlockToIfcgis,
  buildDeliverable,
  getAllLayerLive,
  getEnabledLayerIds,
} from "../../store/tekeningState";
import { catalogToIfcgisLayers } from "../../utils/gisLayerCatalog";
import "./IfcxPreviewDialog.css";

/**
 * IfcxPreviewDialog — live preview van de IFCX-shaped JSON die in
 * het .ifcgis-bestand komt te staan. Bouwt dezelfde payload als
 * `saveProject` in Backstage en geeft 'm aan de Rust-command
 * `preview_project_ifcx` die de IFC4x3-spec-conform conversie doet.
 *
 * Read-only preview — geen save-knop hier. De gebruiker kan kopiëren
 * voor inspectie of vergelijking. Komt uit `Bestand → Project
 * opslaan` automatisch in de uiteindelijke .ifcgis.
 */

export interface IfcxPreviewDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function IfcxPreviewDialog({ open, onClose }: IfcxPreviewDialogProps) {
  const documents = useCptStore((s) => s.documents);
  const activeDocId = useCptStore((s) => s.activeDocId);
  const activeDoc = useMemo(
    () => documents.find((d) => d.id === activeDocId),
    [documents, activeDocId],
  );

  const [ifcxText, setIfcxText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Re-genereer telkens als de dialog opent OF het actieve document
  // verandert (anders krijg je een stale preview).
  useEffect(() => {
    if (!open) return;
    if (!activeDoc) {
      setIfcxText("");
      setError("No active document — open or create a project to see an IFCX preview.");
      return;
    }
    if (activeDoc.kind !== "project") {
      setIfcxText("");
      setError("IFCX preview is available for project documents. Use the IFC tab for individual CPTs or boreholes.");
      return;
    }
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        // Identieke payload als Backstage.saveProject. Gehouden
        // inline (niet gedeeld als helper) zodat het zonder side-
        // effects in deze dialog past — een gedeelde helper zou
        // moeten weten of-ie save of preview produceert.
        const meta = activeDoc.meta;
        const projectInfo = {
          type: "OpenGeoProject",
          title: meta.title,
          client: meta.client,
          location: meta.location,
          project_number: meta.project_number,
          author: meta.author,
          date: meta.date.slice(0, 10),
        };
        const cpts = Array.from(activeDoc.cpts.values());
        const bores = Array.from(activeDoc.bores.values());
        const tekState = getLatestTekening();
        const tekening = tekState ? tekeningStateToIfcgis(tekState) : null;
        const titleBlock = tekState
          ? titleBlockToIfcgis(tekState.titleBlock)
          : null;
        const liveLayerOverrides = getAllLayerLive();
        const gis = {
          epsg: 28992,
          name: "Amersfoort / RD New",
          center: tekState
            ? {
                lat: tekState.center.lat,
                lon: tekState.center.lon,
                zoom: tekState.center.zoom,
              }
            : null,
          layers: catalogToIfcgisLayers(liveLayerOverrides),
        };
        const deliverable = tekState
          ? buildDeliverable({
              projectName: meta.title,
              projectNumber: meta.project_number,
              tek: tekState,
              activeLayerIds: getEnabledLayerIds(),
            })
          : null;
        const payload = {
          header: {
            schema: "ifcgis-0.3",
            originating_system: BRAND.product,
            timestamp: new Date().toISOString(),
          },
          project: projectInfo,
          cpts,
          bores,
          crs: { epsg: 28992, name: "Amersfoort / RD New" },
          gis,
          ...(tekening ? { tekening } : {}),
          ...(titleBlock ? { title_block: titleBlock } : {}),
          ...(deliverable ? { deliverable } : {}),
        };
        const text = await invoke<string>("preview_project_ifcx", { payload });
        setIfcxText(text);
      } catch (err) {
        console.error("preview_project_ifcx failed", err);
        setError(String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [open, activeDoc]);

  const onCopy = async () => {
    if (!ifcxText) return;
    try {
      await navigator.clipboard.writeText(ifcxText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("clipboard write failed", err);
    }
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="IFCX preview — contents of the .ifcgis file"
      width={900}
      height="78vh"
      className="ifcx-preview-modal"
      footer={
        <div className="ifcx-preview-footer">
          <span className="ifcx-preview-info">
            {ifcxText
              ? `${ifcxText.length.toLocaleString("en-GB")} bytes IFCX (IFC4X3_ADD2)`
              : ""}
          </span>
          <button
            type="button"
            className="ifcx-preview-btn-secondary"
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="ifcx-preview-btn-primary"
            onClick={() => void onCopy()}
            disabled={!ifcxText}
          >
            {copied ? "Copied" : "Copy JSON"}
          </button>
        </div>
      }
    >
      <p className="ifcx-preview-hint">
        These are the exact contents of the <code>.ifcgis</code> file when you save the project: IFC5-alpha (IFCX) JSON with IfcProject, IfcSite, IfcBorehole and IfcAnnotation entities, and cross-references through <code>#id</code>.
      </p>
      {loading && (
        <div className="ifcx-preview-status">Generating IFCX…</div>
      )}
      {error && (
        <div className="ifcx-preview-error">
          <strong>Could not create preview:</strong>
          <pre>{error}</pre>
          <p className="ifcx-preview-hint">
            Tip: IFCX conversion requires the Rust backend to provide the
            <code>to_ifcx_json</code> function (ifcgis-0.4+). Restart the desktop development app after rebuilding cpt-core.
          </p>
        </div>
      )}
      {ifcxText && !error && (
        <pre className="ifcx-preview-content">{ifcxText}</pre>
      )}
    </Modal>
  );
}
