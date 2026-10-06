/**
 * Export/import service — handles file dialogs and Tauri commands.
 * Keeps business logic out of UI components.
 */
import { get } from "svelte/store";
import { _ } from "svelte-i18n";
import { isTauri, isWeb, invoke } from "./tauri.js";
import { api } from "./api.js";
import { toast } from "../stores/toast.js";
import { currentKozijn } from "../stores/kozijn.js";
import { refreshCustomProfiles } from "../stores/profiles.js";
import { ifcImportPreview, ifcComparison } from "../stores/ui.js";
import { project } from '../stores/project.js';
import { chooseBrowserFile, readIfcBrowserFile } from "./browserFile.js";
import { createStoredZip, downloadBytes } from './browserDownload.js';

// In web mode file export/import commands resolve to null (no filesystem);
// be honest about it instead of showing a success toast. In Tauri mode
// failures throw, so a null result never means this there.
function exportUnavailable(result) {
  if (!isWeb || result !== null) return false;
  toast.warning(get(_)("alert.exportDesktopOnly"));
  return true;
}

function importUnavailable(result) {
  if (!isWeb || result !== null) return false;
  toast.warning(get(_)("alert.importDesktopOnly"));
  return true;
}

async function getSaveDialog() {
  if (isTauri) return await import("@tauri-apps/plugin-dialog");
  return { save: async (opts) => prompt("Save path:", opts?.defaultPath || "file") };
}

async function getOpenDialog() {
  if (isTauri) return await import("@tauri-apps/plugin-dialog");
  return { open: async () => prompt("File path:") };
}

async function downloadDocument(kind, format, filename, id) {
  try {
    const bytes = await api('export_document_bytes', { kind, format, id });
    downloadBytes(filename, bytes, format === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf');
    toast.success(format.toUpperCase() + ' download created.');
  } catch { /* API supplies a visible error; failed exports do not download. */ }
}

// ── Export functions ────────────────────────────────────────

async function downloadIfc(k, lod) {
    try {
      const content = await api('export_ifc_text', { id: k.id, lod });
      const url = URL.createObjectURL(new Blob([content], { type: 'application/x-step' }));
      const link = document.createElement('a'); link.href = url; link.download = `${k.mark}${lod ? `_lod${lod}` : ''}.ifc`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('IFC download created.');
    } catch { /* api supplies the error toast */ }
}

export async function exportIfc() {
  const k = get(currentKozijn);
  if (!k) return;
  if (isWeb) return downloadIfc(k);
  const { save } = await getSaveDialog();
  const path = await save({
    filters: [{ name: "IFC", extensions: ["ifc"] }],
    defaultPath: `${k.mark}.ifc`,
  });
  if (!path) return;
  const result = await api("export_ifc", { id: k.id, outputPath: path });
  if (exportUnavailable(result)) return;
  toast.success(get(_)("alert.exportSuccess", { values: { type: "IFC", path } }));
}

export async function exportDxf() {
  const k = get(currentKozijn);
  if (!k) return;
  if (isWeb) {
    try {
      const content = await api('export_dxf_text', { id: k.id });
      const url = URL.createObjectURL(new Blob([content], { type: 'application/dxf' }));
      const link = document.createElement('a'); link.href = url; link.download = `${k.mark}.dxf`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('DXF download created.');
    } catch { /* api supplies the error toast */ }
    return;
  }
  const { save } = await getSaveDialog();
  const path = await save({
    filters: [{ name: "DXF", extensions: ["dxf"] }],
    defaultPath: `${k.mark}.dxf`,
  });
  if (!path) return;
  const result = await api("export_dxf", { id: k.id, outputPath: path });
  if (exportUnavailable(result)) return;
  toast.success(get(_)("alert.exportSuccess", { values: { type: "DXF", path } }));
}

export async function exportKozijnstaat(format) {
  if (isWeb) return downloadDocument('schedule', format, 'frame-schedule.' + format);
  const ext = format === "xlsx" ? "xlsx" : "pdf";
  const { save } = await getSaveDialog();
  const path = await save({
    filters: [{ name: format.toUpperCase(), extensions: [ext] }],
    defaultPath: `frame-schedule.${ext}`,
  });
  if (!path) return;
  const result = await api("export_kozijnstaat", { outputPath: path, format }).catch(() => undefined);
  if (result === undefined) return;
  if (exportUnavailable(result)) return;
  toast.success(get(_)("alert.exportSuccess", { values: { type: `Frame schedule ${format.toUpperCase()}`, path } }));
}

export async function exportWorkshop() {
  const k = get(currentKozijn);
  if (!k) return;
  if (isWeb) return downloadDocument('workshop', 'pdf', k.mark + '_workshop.pdf', k.id);
  const { save } = await getSaveDialog();
  const path = await save({
    filters: [{ name: "PDF", extensions: ["pdf"] }],
    defaultPath: `${k.mark}_workshop.pdf`,
  });
  if (!path) return;
  const result = await api("export_workshop_drawing", { id: k.id, outputPath: path }).catch(() => undefined);
  if (result === undefined) return;
  if (exportUnavailable(result)) return;
  toast.success(get(_)("alert.exportSuccess", { values: { type: "PDF", path } }));
}

export async function exportGltf() {
  const k = get(currentKozijn);
  if (!k) return;
  if (isWeb) {
    try {
      const bytes = await api('export_glb_bytes', { id: k.id });
      const url = URL.createObjectURL(new Blob([bytes], { type: 'model/gltf-binary' }));
      const link = document.createElement('a'); link.href = url; link.download = `${k.mark}.glb`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('3D model download created.');
    } catch { /* api supplies the error toast */ }
    return;
  }
  const { save } = await getSaveDialog();
  const path = await save({
    filters: [{ name: "glTF Binary", extensions: ["glb"] }],
    defaultPath: `${k.mark}.glb`,
  });
  if (!path) return;
  const result = await api("export_gltf", { id: k.id, outputPath: path });
  if (exportUnavailable(result)) return;
  toast.success(get(_)("alert.exportSuccess", { values: { type: "glTF", path } }));
}

export async function exportProduction(format) {
  if (isWeb && format === 'csv') {
    try {
      const files = await api('export_production_csv_files');
      downloadBytes('frame-production.zip', createStoredZip(files), 'application/zip');
      toast.success('Production CSV archive download created.');
    } catch { /* api supplies the error toast */ }
    return;
  }
  if (isWeb) return downloadDocument('production', format, 'frame-production.' + format);
  const extMap = { pdf: "pdf", xlsx: "xlsx", csv: "csv" };
  const ext = extMap[format] || "pdf";
  const defaultName = format === "csv" ? "frame-production" : `frame-production.${ext}`;
  const { save } = await getSaveDialog();
  const path = await save({
    filters: [{ name: format.toUpperCase(), extensions: [ext] }],
    defaultPath: defaultName,
  });
  if (!path) return;
  const result = await api("export_production_lists", { outputPath: path, format }).catch(() => undefined);
  if (result === undefined) return;
  if (exportUnavailable(result)) return;
  toast.success(get(_)("alert.exportSuccess", { values: { type: `Production ${format.toUpperCase()}`, path } }));
}

export async function exportQuotationPdf() {
  if (isWeb) return downloadDocument('quotation', 'pdf', 'frame-estimate.pdf');
  const { save } = await getSaveDialog();
  const path = await save({
    filters: [{ name: "PDF", extensions: ["pdf"] }],
    defaultPath: "frame-estimate.pdf",
  });
  if (!path) return;
  const result = await api("export_quotation_pdf", { outputPath: path }).catch(() => undefined);
  if (result === undefined) return;
  if (exportUnavailable(result)) return;
  toast.success(get(_)("alert.exportSuccess", { values: { type: "Cost estimate PDF", path } }));
}

export async function sendToBlender() {
  const k = get(currentKozijn);
  if (!k) return;
  if (isWeb) {
    toast.warning('The Blender bridge requires the Windows app and a running Bonsai add-on. Download GLB or IFC to open the model in Blender.');
    return;
  }
  const result = await api("send_to_blender", { id: k.id });
  toast.success(get(_)("alert.blenderSuccess", { values: { result } }));
}

// ── CNC & Labels ───────────────────────────────────────────

export async function exportCncGcode(frameId) {
  const k = typeof frameId === 'string' ? get(project)?.kozijnen.find(frame => frame.id === frameId) : get(currentKozijn);
  if (!k) return;
  if (isWeb) {
    try {
      await api('export_cnc_gcode', { id: k.id });
      toast.success('CNC archive download created.');
    } catch { /* api supplies the error toast */ }
    return;
  }
  const { save } = await getSaveDialog();
  const path = await save({
    filters: [{ name: "G-code", extensions: ["nc", "gcode"] }],
    defaultPath: `${k.mark}_cnc`,
  });
  if (!path) return;
  const result = await api("export_cnc_gcode", { id: k.id, outputDir: path });
  if (exportUnavailable(result)) return;
  toast.success(get(_)("alert.exportSuccess", { values: { type: "CNC G-code", path } }));
}

export async function exportLabels() {
  if (isWeb) return downloadDocument('labels', 'pdf', 'frame-labels.pdf');
  const { save } = await getSaveDialog();
  const path = await save({
    filters: [{ name: "PDF", extensions: ["pdf"] }],
    defaultPath: "labels.pdf",
  });
  if (!path) return;
  const result = await api("export_labels_pdf", { outputPath: path }).catch(() => undefined);
  if (result === undefined) return;
  if (exportUnavailable(result)) return;
  toast.success(get(_)("alert.exportSuccess", { values: { type: "Labels PDF", path } }));
}

export async function exportIfcWithLod(lod) {
  const k = get(currentKozijn);
  if (!k) return;
  if (isWeb) return downloadIfc(k, String(lod));
  const { save } = await getSaveDialog();
  const path = await save({
    filters: [{ name: "IFC", extensions: ["ifc"] }],
    defaultPath: `${k.mark}_lod${lod}.ifc`,
  });
  if (!path) return;
  // Rust expects lod as Option<String> — always pass a string.
  const result = await api("export_ifc", { id: k.id, outputPath: path, lod: String(lod) });
  if (exportUnavailable(result)) return;
  toast.success(get(_)("alert.exportSuccess", { values: { type: `IFC LOD${lod}`, path } }));
}

// ── IFC Import & Compare ───────────────────────────────────

export async function importIfcFile() {
  try {
    let result, filename;
    if (isWeb) {
      const file = await chooseBrowserFile();
      if (!file) return;
      filename = file.name;
      result = await invoke('import_ifc_text', { content: await readIfcBrowserFile(file) });
    } else {
      const { open } = await getOpenDialog();
      const path = await open({ filters: [{ name: 'IFC', extensions: ['ifc'] }], multiple: false });
      if (!path) return;
      filename = path.split(/[\\/]/).pop();
      result = await invoke('import_ifc_file', { filePath: path });
    }
    const data = typeof result === 'string' ? JSON.parse(result) : result;
    ifcImportPreview.set({ filename, ...data });
    return data;
  } catch (error) {
    // Errors before the API call (decoding/size) also need a visible outcome.
    toast.error(String(error));
  }
}

function toastIfcDiffSummary(result) {
  let diff = null;
  try {
    diff = typeof result === "string" ? JSON.parse(result) : result;
  } catch {
    diff = null;
  }
  if (!diff) {
    toast.warning(get(_)("alert.ifcCompareNoResult"));
    return;
  }
  ifcComparison.set(diff);
  toast.success(
    get(_)("alert.ifcCompareSummary", {
      values: {
        added: diff.added?.length ?? 0,
        removed: diff.removed?.length ?? 0,
        modified: diff.modified?.length ?? 0,
        unchanged: diff.unchanged ?? 0,
      },
    })
  );
}

export async function compareIfcRoundtrip() {
  if (isWeb) {
    try {
      const file = await chooseBrowserFile();
      if (!file) return;
      const result = await invoke('compare_project_ifc_text', { content: await readIfcBrowserFile(file) });
      toastIfcDiffSummary(result);
      return result;
    } catch (error) { toast.error(String(error)); }
    return;
  }
  const { open } = await getOpenDialog();
  const path = await open({
    filters: [{ name: "IFC", extensions: ["ifc"] }],
    multiple: false,
  });
  if (!path) return;
  const result = await api("compare_ifc_roundtrip", { filePath: path });
  toastIfcDiffSummary(result);
  return result;
}

export async function compareIfcFiles() {
  if (isWeb) {
    try {
      const oldFile = await chooseBrowserFile();
      if (!oldFile) return;
      const newFile = await chooseBrowserFile();
      if (!newFile) return;
      const result = await invoke('compare_ifc_text', {
        oldContent: await readIfcBrowserFile(oldFile), newContent: await readIfcBrowserFile(newFile),
      });
      toastIfcDiffSummary(result);
      return result;
    } catch (error) { toast.error(String(error)); }
    return;
  }
  const { open } = await getOpenDialog();
  const oldPath = await open({
    title: get(_)("dialog.selectOldIfc"),
    filters: [{ name: "IFC", extensions: ["ifc"] }],
    multiple: false,
  });
  if (!oldPath) return;
  const newPath = await open({
    title: get(_)("dialog.selectNewIfc"),
    filters: [{ name: "IFC", extensions: ["ifc"] }],
    multiple: false,
  });
  if (!newPath) return;
  const result = await api("compare_ifc_files", { oldPath, newPath });
  toastIfcDiffSummary(result);
  return result;
}

// ── Import functions ────────────────────────────────────────

export async function importDxfProfile() {
  const { open } = await getOpenDialog();
  const path = await open({
    filters: [{ name: "DXF", extensions: ["dxf"] }],
    multiple: false,
  });
  if (!path) return;
  const result = await api("import_dxf_profile", { filePath: path });
  if (importUnavailable(result)) return;
  const profile = JSON.parse(result);
  await api("add_custom_profile", { profileJson: JSON.stringify(profile) });
  await refreshCustomProfiles();
  toast.success(
    get(_)("alert.profileImported", {
      values: { name: profile.name, width: profile.width, depth: profile.depth },
    })
  );
}

export async function importCatalog() {
  const { open } = await getOpenDialog();
  const path = await open({
    filters: [{ name: "Catalog", extensions: ["json", "xlsx", "xls", "csv"] }],
    multiple: false,
  });
  if (!path) return;
  const result = await api("import_catalog", { filePath: path, supplier: null });
  if (importUnavailable(result)) return;
  const profiles = JSON.parse(result);
  for (const profile of profiles) {
    await api("add_custom_profile", { profileJson: JSON.stringify(profile) });
  }
  await refreshCustomProfiles();
  toast.success(
    get(_)("alert.catalogImported", { values: { count: profiles.length } })
  );
}
