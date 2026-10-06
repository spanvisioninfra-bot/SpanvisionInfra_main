import * as THREE from 'three';
import { initIFC, openModel, closeModel, extractAllProperties, sortParameters } from '@spanvision-infra/ifc-core';
import { extractGeometry, zoomFitCamera } from '@spanvision-infra/viewer-engine';
import * as ifcStore from '@/state/ifc-store';
import * as uiStore from '@/state/ui-store';
import * as viewer from '@/state/viewer-store';
import { clearAllSelection } from '@/state/selection-store';
import { resetPlayerStore } from '@/state/player-store';
import { selectParameter } from './select-parameter';
import { prepareForNewDocument, addDocument } from '@/state/document-store';
import { t } from '@/state/locale-store';

let ifcInitialized = false;

async function ensureIfcInit(): Promise<void> {
  if (!ifcInitialized) {
    await initIFC();
    ifcInitialized = true;
  }
}

export async function loadFile(file: File): Promise<void> {
  if (uiStore.isLoading()) return;
  let stagedModel: number | null = null;
  const stagedScene = new THREE.Scene();
  uiStore.showLoading(t('loading.file'));

  try {
    if (!/\.ifc$/i.test(file.name)) throw new Error('Choose an .ifc file.');
    if (!file.size || file.size > 256 * 1024 * 1024) throw new Error('Choose a nonempty IFC file smaller than 256 MB.');
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);
    const header = new TextDecoder().decode(data.subarray(0, 16384));
    if (!/^\s*ISO-10303-21\s*;/i.test(header) || !/FILE_SCHEMA\s*\(/i.test(header)) {
      throw new Error('The file is not an IFC STEP document.');
    }
    await ensureIfcInit();
    if (!viewer.scene) throw new Error('The 3D viewer is not ready. Please reload and try again.');

    uiStore.showLoading(t('loading.parse'));
    const modelId = openModel(data);
    stagedModel = modelId;

    uiStore.showLoading(t('loading.geometry'));
    const result = extractGeometry(modelId, stagedScene);
    if (!result.allMeshes.length) throw new Error('No supported visible geometry was found in this IFC model.');

    uiStore.showLoading(t('loading.properties'));
    const propResult = extractAllProperties(modelId, result.meshes);
    const sorted = sortParameters(propResult.allParameters);

    // A failed second import must not hide or overwrite the active document.
    prepareForNewDocument();
    clearAllSelection();
    resetPlayerStore();
    ifcStore.resetIfcStore();
    uiStore.setPropertyPanelOpen(false);
    uiStore.setPropertyPanelData(null);
    uiStore.setContextMenuVisible(false);
    for (const mesh of result.allMeshes) viewer.scene.add(mesh);
    viewer.setMeshes(result.meshes);
    viewer.setAllMeshes(result.allMeshes);
    viewer.setHoveredMesh(null);
    ifcStore.setModelId(modelId);
    ifcStore.setFileName(file.name);
    ifcStore.setHasFile(true);
    ifcStore.setElements(propResult.elements);
    ifcStore.setElementProperties(propResult.elementProperties);
    ifcStore.setAllParameters(propResult.allParameters);

    ifcStore.setParameterOptions(sorted);

    // Auto-select 'Mark' parameter if available
    const markParam = sorted.find(([p]) => p.toLowerCase().includes('mark')) ?? sorted[0];
    if (markParam) {
      ifcStore.setSelectedParameter(markParam[0]);
      selectParameter(markParam[0]);
    }

    const cc = viewer.cameraController;
    if (cc) zoomFitCamera(result.allMeshes, cc.target, cc.spherical, () => cc.updateCamera());
    uiStore.setShowDropZone(false);
    uiStore.showStatus(`${propResult.elements.length} ${t('status.loaded')}`, 'success');
    uiStore.setShowStatusBar(true);
    uiStore.setShowViewerControls(true);
    addDocument(file.name);
    stagedModel = null;

  } catch (error: unknown) {
    for (const mesh of [...stagedScene.children]) {
      if (mesh instanceof THREE.Mesh) {
        mesh.geometry.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach(material => material.dispose());
      }
      stagedScene.remove(mesh);
    }
    if (stagedModel !== null) closeModel(stagedModel);
    uiStore.showStatus(t('status.error') + (error instanceof Error ? error.message : String(error)), 'error');
    uiStore.setShowStatusBar(true);
    uiStore.setShowDropZone(!ifcStore.hasFile());
  } finally {
    uiStore.hideLoading();
  }
}

