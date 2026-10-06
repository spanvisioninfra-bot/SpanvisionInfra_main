import { useCallback } from 'react';
import { useAppStore, generateId } from '../../state/appStore';
import {
  showOpenDialog,
  showSaveDialog,
  showExportDialog,
  showExportAllFormatsDialog,
  readProjectFile,
  writeProjectFile,
  exportToSVG,
  exportToDXF,
  exportToFolder,
  showError,
  showInfo,
  showConfirm,
  showImportDxfDialog,
  parseDXF,
  parseDXFAsUnderlay,
  parseDXFInsUnits,
  isTauriEnvironment,
  readTextFileUniversal,
  writeTextFileUniversal,
  clearBrowserFileHandle,
  needsBrowserSaveLocation,
} from '../../services/file/fileService';
import { generateIFC } from '../../services/ifc/ifcGenerator';
import { addRecentFile } from '../../services/file/recentFiles';
import { logger } from '../../services/log/logService';
import { DEFAULT_PROJECT_INFO } from '../../types/projectInfo';
import { importDwgFile } from '../../services/file/dwgImportService';


import { applySavedProject } from '../../services/file/saveCompletion';
import { createProjectFile } from '../../services/file/projectSnapshot';

export function useFileOperations() {
  const setPrintDialogOpen = useAppStore(s => s.setPrintDialogOpen);
  const addShapes = useAppStore(s => s.addShapes);

  const handleNew = useCallback(async () => {
    useAppStore.getState().createNewDocument();
    clearBrowserFileHandle(useAppStore.getState().activeDocumentId);
  }, []);

  const handleOpen = useCallback(async () => {
    const filePath = await showOpenDialog();
    if (!filePath) return false;

    const extension = filePath.split('.').pop()?.toLowerCase();

    if (extension === 'dxf') {
      try {
        const content = await readTextFileUniversal(filePath);
        const fileName = filePath.split(/[/\\]/).pop()?.replace('.dxf', '') || 'Untitled';

        // Auto-prompt for large DXF files (>5MB)
        let useUnderlay = false;
        if (content.length > 5_000_000) {
          useUnderlay = await showConfirm(
            'This is a large DXF file. Import a fast background underlay?\n\nContinue imports one background image. Cancel imports editable geometry.'
          );
        }

        // Parse before switching documents so failed imports preserve the active drawing.
        const staged = useUnderlay
          ? (() => { const image = parseDXFAsUnderlay(content, 'import-layer', 'import-drawing', fileName); return image ? [image] : []; })()
          : parseDXF(content, 'import-layer', 'import-drawing');
        if (staged.length === 0) {
          await showInfo('No supported entities found in the DXF file.');
          return false;
        }

        const s = useAppStore.getState();
        const prevDocId = s.activeDocumentId;
        const isEmptyUntitled = !s.isModified && !s.currentFilePath
          && s.shapes.length === 0 && s.projectName.startsWith('Untitled');

        // Create a new empty document first so we get its default layer/drawing IDs
        const docId = generateId();
        s.openDocument(docId, {
          projectName: fileName,
          isModified: false,
          projectInfo: { ...DEFAULT_PROJECT_INFO },
        });

        const newState = useAppStore.getState();

        useAppStore.getState().addShapes(staged.map(shape => ({ ...shape,
          layerId: newState.activeLayerId, drawingId: newState.activeDrawingId })));

        // Detect and apply DXF units
        const dxfUnit = parseDXFInsUnits(content);
        if (dxfUnit) {
          useAppStore.getState().setLengthUnit(dxfUnit);
        }

        if (isEmptyUntitled) {
          useAppStore.getState().closeDocument(prevDocId);
        }
        useAppStore.getState().zoomToFit();
        logger.info(`Opened DXF file: ${fileName}`, 'File');
        addRecentFile(filePath, fileName).catch(() => {});
        return true;
      } catch (err) {
        await showError(`Failed to open DXF: ${err}`);
        return false;
      }
    }

    if (extension === 'dwg') {
      try {
        const fileName = filePath.split(/[/\\]/).pop()?.replace('.dwg', '') || 'Untitled';

        if (!isTauriEnvironment()) {
          await showError('DWG import requires the Windows app. Convert the drawing to DXF to open it in the browser.');
          return false;
        }
        // Stage native parsing before creating or switching a document.
        const staged = await importDwgFile(filePath, 'import-layer', 'import-drawing');
        if (staged.length === 0) {
          await showInfo('No supported entities found in the DWG file.');
          return false;
        }

        const s = useAppStore.getState();
        const prevDocId = s.activeDocumentId;
        const isEmptyUntitled = !s.isModified && !s.currentFilePath
          && s.shapes.length === 0 && s.projectName.startsWith('Untitled');

        const docId = generateId();
        s.openDocument(docId, {
          projectName: fileName,
          isModified: false,
          projectInfo: { ...DEFAULT_PROJECT_INFO },
        });

        const newState = useAppStore.getState();
        const shapes = staged.map(shape => ({ ...shape, layerId: newState.activeLayerId, drawingId: newState.activeDrawingId }));
        useAppStore.getState().addShapes(shapes);
        useAppStore.getState().fitBoundaryToContent(newState.activeDrawingId, 100);
        useAppStore.getState().zoomToFit();

        if (isEmptyUntitled) {
          useAppStore.getState().closeDocument(prevDocId);
        }
        logger.info(`Opened DWG file: ${fileName} (${shapes.length} entities)`, 'File');
        addRecentFile(filePath, fileName).catch(() => {});
        return true;
      } catch (err) {
        await showError(`Failed to open DWG: ${err}`);
        return false;
      }
      return;
    }

    try {
      const project = await readProjectFile(filePath);
      const fileName = filePath.split(/[/\\]/).pop()?.replace('.o2d', '') || 'Untitled';

      // Check if current tab is an empty untitled document — close it after opening
      const s = useAppStore.getState();
      const prevDocId = s.activeDocumentId;
      const isEmptyUntitled = !s.isModified && !s.currentFilePath
        && s.shapes.length === 0 && s.projectName.startsWith('Untitled');

      // Open as a new document tab (or switch to it if already open)
      const docId = generateId();
      s.openDocument(docId, {
        shapes: project.shapes,
        layers: project.layers,
        activeLayerId: project.activeLayerId,
        drawings: project.drawings || [],
        sheets: project.sheets || [],
        activeDrawingId: project.activeDrawingId || (project.drawings?.[0]?.id ?? ''),
        activeSheetId: project.activeSheetId ?? null,
        drawingViewports: project.drawingViewports || {},
        sheetViewports: project.sheetViewports || {},
        filePath: isTauriEnvironment() ? filePath : undefined,
        projectName: fileName,
        isModified: false,
        projectInfo: project.projectInfo || { ...DEFAULT_PROJECT_INFO },
        // Restore per-document fields from project file (backward compatible)
        ...(project.parametricShapes ? { parametricShapes: project.parametricShapes } : {}),
        ...(project.textStyles ? { textStyles: project.textStyles } : {}),
        ...(project.customTitleBlockTemplates ? { customTitleBlockTemplates: project.customTitleBlockTemplates } : {}),
        ...(project.customSheetTemplates ? { customSheetTemplates: project.customSheetTemplates } : {}),
        ...(project.projectPatterns ? { projectPatterns: project.projectPatterns } : {}),
      });

      useAppStore.getState().setFilePath(filePath);

      // Restore snap settings from project
      if (project.settings) {
        const store = useAppStore.getState();
        store.setGridSize(project.settings.gridSize);
        if (store.gridVisible !== project.settings.gridVisible) store.toggleGrid();
        if (store.snapEnabled !== project.settings.snapEnabled) store.toggleSnap();
      }

      // Restore project-level filled region types (backward compatible)
      if (project.filledRegionTypes && project.filledRegionTypes.length > 0) {
        useAppStore.getState().setProjectFilledRegionTypes(project.filledRegionTypes);
      }
      // Restore project info (backward compatible)
      if (project.projectInfo) {
        useAppStore.getState().setProjectInfo(project.projectInfo);
      }
      // Restore unit settings (backward compatible)
      if (project.unitSettings) {
        useAppStore.getState().setUnitSettings(project.unitSettings);
      }
      // Restore wall types (backward compatible — global/shared state)
      if (project.wallTypes && project.wallTypes.length > 0) {
        useAppStore.getState().setWallTypes(project.wallTypes);
      }
      // Restore wall system types (backward compatible)
      if ((project as any).wallSystemTypes && (project as any).wallSystemTypes.length > 0) {
        useAppStore.getState().setWallSystemTypes((project as any).wallSystemTypes);
      }
      // Restore project structure (storeys)
      if ((project as any).projectStructure) {
        useAppStore.getState().setProjectStructure((project as any).projectStructure);
      }
      // Restore slab types
      if ((project as any).slabTypes && (project as any).slabTypes.length > 0) {
        useAppStore.getState().setSlabTypes((project as any).slabTypes);
      }
      // Restore pile types
      if ((project as any).pileTypes && (project as any).pileTypes.length > 0) {
        useAppStore.getState().setPileTypes((project as any).pileTypes);
      }
      // Restore saved queries (backward compatible)
      if (project.queries && project.queries.length > 0) {
        useAppStore.getState().setQueries(project.queries);
      }

      // Close the previous empty untitled tab
      if (isEmptyUntitled) {
        useAppStore.getState().closeDocument(prevDocId);
      }
      logger.info(`Opened project: ${fileName}`, 'File');
      addRecentFile(filePath, fileName).catch(() => {});
      return true;
    } catch (err) {
      await showError(`Failed to open file: ${err}`);
      return false;
    }
  }, [addShapes]);

  const handleSave = useCallback(async () => {
    const s = useAppStore.getState();
    let filePath = s.currentFilePath;

    if (!filePath || needsBrowserSaveLocation(s.activeDocumentId)) {
      filePath = await showSaveDialog(s.projectName, s.activeDocumentId);
      if (!filePath) return;
    }

    try {
      // Collect non-built-in filled region types for saving with project
      const project = createProjectFile(s);

      await writeProjectFile(filePath, project, s.activeDocumentId);
      const fileName = applySavedProject(s, filePath);
      logger.info(`Project saved: ${fileName}`, 'File');
      addRecentFile(filePath, fileName).catch(() => {});
    } catch (err) {
      await showError(`Failed to save file: ${err}`);
    }
  }, []);

  const handleSaveAs = useCallback(async () => {
    const s = useAppStore.getState();
    const filePath = await showSaveDialog(s.projectName, s.activeDocumentId);
    if (!filePath) return;

    try {
      const project = createProjectFile(s);

      await writeProjectFile(filePath, project, s.activeDocumentId);
      const fileName = applySavedProject(s, filePath);
      logger.info(`Project saved as: ${fileName}`, 'File');
      addRecentFile(filePath, fileName).catch(() => {});
    } catch (err) {
      await showError(`Failed to save file: ${err}`);
    }
  }, []);

  const handleExport = useCallback(async () => {
    const s = useAppStore.getState();
    if (s.shapes.length === 0) {
      await showInfo('Nothing to export. Draw some shapes first.');
      return;
    }

    const filePath = await showExportAllFormatsDialog(s.projectName);
    if (!filePath) return;

    try {
      const extension = filePath.split('.').pop()?.toLowerCase();
      let content: string;

      if (extension === 'ifc') {
        // Use the full parametric IFC generator for proper structural elements
        const result = generateIFC(
          s.shapes,
          s.wallTypes,
          s.slabTypes,
          s.projectStructure,
          s.drawings,
          s.pileTypes
        );
        content = result.content;
      } else if (extension === 'dxf') {
        content = exportToDXF(s.shapes, s.unitSettings);
      } else if (extension === 'json') {
        content = JSON.stringify({ shapes: s.shapes, layers: s.layers }, null, 2);
      } else {
        content = exportToSVG(s.shapes);
      }

      await writeTextFileUniversal(filePath, content);
      await showInfo(`Exported successfully to ${filePath}`);
    } catch (err) {
      await showError(`Failed to export: ${err}`);
    }
  }, []);

  const handleExportSVG = useCallback(async () => {
    const s = useAppStore.getState();
    if (s.shapes.length === 0) { await showInfo('Nothing to export. Draw some shapes first.'); return; }
    const filePath = await showExportDialog('svg', s.projectName);
    if (!filePath) return;
    try {
      await writeTextFileUniversal(filePath, exportToSVG(s.shapes), 'image/svg+xml');
      await showInfo(`Exported successfully to ${filePath}`);
    } catch (err) { await showError(`Failed to export: ${err}`); }
  }, []);

  const handleExportDXF = useCallback(async () => {
    const s = useAppStore.getState();
    if (s.shapes.length === 0) { await showInfo('Nothing to export. Draw some shapes first.'); return; }
    const filePath = await showExportDialog('dxf', s.projectName);
    if (!filePath) return;
    try {
      await writeTextFileUniversal(filePath, exportToDXF(s.shapes, s.unitSettings));
      await showInfo(`Exported successfully to ${filePath}`);
    } catch (err) { await showError(`Failed to export: ${err}`); }
  }, []);

  const handleExportIFC = useCallback(async () => {
    const s = useAppStore.getState();
    if (s.shapes.length === 0) { await showInfo('Nothing to export. Draw some shapes first.'); return; }

    try {
      // Use the full parametric IFC generator (walls, beams, slabs, etc.)
      const result = generateIFC(
        s.shapes,
        s.wallTypes,
        s.slabTypes,
        s.projectStructure,
        s.drawings,
        s.pileTypes
      );
      const content = result.content;

      const filePath = await showExportDialog('ifc', s.projectName);
      if (!filePath) return;
      await writeTextFileUniversal(filePath, content, 'application/x-step');
      await showInfo(`Exported IFC successfully to ${filePath}\n\n${result.entityCount} entities, ${(result.fileSize / 1024).toFixed(1)} KB`);
    } catch (err) { await showError(`Failed to export IFC: ${err}`); }
  }, []);

  const handleExportJSON = useCallback(async () => {
    const s = useAppStore.getState();
    if (s.shapes.length === 0) { await showInfo('Nothing to export. Draw some shapes first.'); return; }
    const filePath = await showExportDialog('json', s.projectName);
    if (!filePath) return;
    try {
      await writeTextFileUniversal(filePath, JSON.stringify({ shapes: s.shapes, layers: s.layers }, null, 2), 'application/json');
      await showInfo(`Exported successfully to ${filePath}`);
    } catch (err) { await showError(`Failed to export: ${err}`); }
  }, []);

  const handleImportDXF = useCallback(async () => {
    const filePath = await showImportDxfDialog();
    if (!filePath) return;

    try {
      const content = await readTextFileUniversal(filePath);
      const s = useAppStore.getState();
      const shapes = parseDXF(content, s.activeLayerId, s.activeDrawingId);
      if (shapes.length === 0) {
        await showInfo('No supported entities found in the DXF file.\n\nSupported entities: LINE, CIRCLE, ARC, ELLIPSE, POLYLINE, LWPOLYLINE, SPLINE, TEXT, MTEXT, POINT, SOLID, 3DFACE, TRACE');
        return;
      }

      addShapes(shapes);
      useAppStore.getState().zoomToFit();

      // Detect and apply DXF units
      const dxfUnit = parseDXFInsUnits(content);
      if (dxfUnit) {
        useAppStore.getState().setLengthUnit(dxfUnit);
      }
      logger.info(`Imported DXF: ${shapes.length} entities`, 'File');
    } catch (err) {
      await showError(`Failed to import DXF: ${err}`);
    }
  }, [addShapes]);

  const handleImportDXFAsUnderlay = useCallback(async () => {
    const filePath = await showImportDxfDialog();
    if (!filePath) return;

    try {
      const content = await readTextFileUniversal(filePath);
      const fileName = filePath.split(/[/\\]/).pop()?.replace('.dxf', '') || 'DXF';
      const s = useAppStore.getState();
      const underlay = parseDXFAsUnderlay(content, s.activeLayerId, s.activeDrawingId, fileName);
      if (!underlay) {
        await showInfo('Could not rasterize DXF file. No supported entities found.');
        return;
      }

      addShapes([underlay]);
      useAppStore.getState().zoomToFit();

      // Detect and apply DXF units
      const dxfUnit = parseDXFInsUnits(content);
      if (dxfUnit) {
        useAppStore.getState().setLengthUnit(dxfUnit);
      }
      logger.info(`Imported DXF as underlay: ${fileName}`, 'File');
    } catch (err) {
      await showError(`Failed to import DXF as underlay: ${err}`);
    }
  }, [addShapes]);

  /**
   * Open a file by its absolute path (used by the Recent Files list).
   * Reuses the same logic as handleOpen but skips the file-picker dialog.
   */
  const handleOpenPath = useCallback(async (filePath: string): Promise<void> => {
    const extension = filePath.split('.').pop()?.toLowerCase();

    if (extension === 'dxf') {
      try {
        const content = await readTextFileUniversal(filePath);
        const fileName = filePath.split(/[/\\]/).pop()?.replace('.dxf', '') || 'Untitled';

        const staged = parseDXF(content, 'import-layer', 'import-drawing');
        if (staged.length === 0) {
          await showInfo('No supported entities found in the DXF file.');
          return;
        }

        const s = useAppStore.getState();
        const prevDocId = s.activeDocumentId;
        const isEmptyUntitled = !s.isModified && !s.currentFilePath
          && s.shapes.length === 0 && s.projectName.startsWith('Untitled');

        const docId = generateId();
        s.openDocument(docId, {
          projectName: fileName,
          isModified: false,
          projectInfo: { ...DEFAULT_PROJECT_INFO },
        });

        const newState = useAppStore.getState();
        useAppStore.getState().addShapes(staged.map(shape => ({ ...shape,
          layerId: newState.activeLayerId, drawingId: newState.activeDrawingId })));

        const dxfUnit = parseDXFInsUnits(content);
        if (dxfUnit) {
          useAppStore.getState().setLengthUnit(dxfUnit);
        }

        if (isEmptyUntitled) {
          useAppStore.getState().closeDocument(prevDocId);
        }
        useAppStore.getState().zoomToFit();
        logger.info(`Opened DXF file: ${fileName}`, 'File');
        addRecentFile(filePath, fileName).catch(() => {});
      } catch (err) {
        await showError(`Failed to open DXF: ${err}`);
      }
      return;
    }

    if (extension === 'dwg') {
      try {
        const fileName = filePath.split(/[/\\]/).pop()?.replace('.dwg', '') || 'Untitled';

        if (!isTauriEnvironment()) {
          await showError('DWG import requires the Windows app. Convert the drawing to DXF to open it in the browser.');
          return;
        }
        // Stage native parsing before creating or switching a document.
        const staged = await importDwgFile(filePath, 'import-layer', 'import-drawing');
        if (staged.length === 0) {
          await showInfo('No supported entities found in the DWG file.');
          return;
        }

        const s = useAppStore.getState();
        const prevDocId = s.activeDocumentId;
        const isEmptyUntitled = !s.isModified && !s.currentFilePath
          && s.shapes.length === 0 && s.projectName.startsWith('Untitled');

        const docId = generateId();
        s.openDocument(docId, {
          projectName: fileName,
          isModified: false,
          projectInfo: { ...DEFAULT_PROJECT_INFO },
        });

        const newState = useAppStore.getState();
        const shapes = staged.map(shape => ({ ...shape, layerId: newState.activeLayerId, drawingId: newState.activeDrawingId }));
        useAppStore.getState().addShapes(shapes);
        useAppStore.getState().fitBoundaryToContent(newState.activeDrawingId, 100);
        useAppStore.getState().zoomToFit();

        if (isEmptyUntitled) {
          useAppStore.getState().closeDocument(prevDocId);
        }
        logger.info(`Opened DWG file: ${fileName} (${shapes.length} entities)`, 'File');
        addRecentFile(filePath, fileName).catch(() => {});
      } catch (err) {
        await showError(`Failed to open DWG: ${err}`);
      }
      return;
    }

    try {
      const project = await readProjectFile(filePath);
      const fileName = filePath.split(/[/\\]/).pop()?.replace('.o2d', '') || 'Untitled';

      const s = useAppStore.getState();
      const prevDocId = s.activeDocumentId;
      const isEmptyUntitled = !s.isModified && !s.currentFilePath
        && s.shapes.length === 0 && s.projectName.startsWith('Untitled');

      const docId = generateId();
      s.openDocument(docId, {
        shapes: project.shapes,
        layers: project.layers,
        activeLayerId: project.activeLayerId,
        drawings: project.drawings || [],
        sheets: project.sheets || [],
        activeDrawingId: project.activeDrawingId || (project.drawings?.[0]?.id ?? ''),
        activeSheetId: project.activeSheetId ?? null,
        drawingViewports: project.drawingViewports || {},
        sheetViewports: project.sheetViewports || {},
        filePath,
        projectName: fileName,
        isModified: false,
        projectInfo: project.projectInfo || { ...DEFAULT_PROJECT_INFO },
        // Restore per-document fields from project file (backward compatible)
        ...(project.parametricShapes ? { parametricShapes: project.parametricShapes } : {}),
        ...(project.textStyles ? { textStyles: project.textStyles } : {}),
        ...(project.customTitleBlockTemplates ? { customTitleBlockTemplates: project.customTitleBlockTemplates } : {}),
        ...(project.customSheetTemplates ? { customSheetTemplates: project.customSheetTemplates } : {}),
        ...(project.projectPatterns ? { projectPatterns: project.projectPatterns } : {}),
      });

      if (project.settings) {
        const store = useAppStore.getState();
        store.setGridSize(project.settings.gridSize);
        if (store.gridVisible !== project.settings.gridVisible) store.toggleGrid();
        if (store.snapEnabled !== project.settings.snapEnabled) store.toggleSnap();
      }

      if (project.filledRegionTypes && project.filledRegionTypes.length > 0) {
        useAppStore.getState().setProjectFilledRegionTypes(project.filledRegionTypes);
      }
      if (project.projectInfo) {
        useAppStore.getState().setProjectInfo(project.projectInfo);
      }
      if (project.unitSettings) {
        useAppStore.getState().setUnitSettings(project.unitSettings);
      }
      // Restore wall types (backward compatible — global/shared state)
      if (project.wallTypes && project.wallTypes.length > 0) {
        useAppStore.getState().setWallTypes(project.wallTypes);
      }
      // Restore wall system types (backward compatible)
      if ((project as any).wallSystemTypes && (project as any).wallSystemTypes.length > 0) {
        useAppStore.getState().setWallSystemTypes((project as any).wallSystemTypes);
      }
      // Restore project structure (storeys)
      if ((project as any).projectStructure) {
        useAppStore.getState().setProjectStructure((project as any).projectStructure);
      }
      // Restore slab types
      if ((project as any).slabTypes && (project as any).slabTypes.length > 0) {
        useAppStore.getState().setSlabTypes((project as any).slabTypes);
      }
      // Restore pile types
      if ((project as any).pileTypes && (project as any).pileTypes.length > 0) {
        useAppStore.getState().setPileTypes((project as any).pileTypes);
      }

      if (isEmptyUntitled) {
        useAppStore.getState().closeDocument(prevDocId);
      }
      logger.info(`Opened project: ${fileName}`, 'File');
      addRecentFile(filePath, fileName).catch(() => {});
    } catch (err) {
      await showError(`Failed to open file: ${err}`);
    }
  }, []);

  const handlePrint = useCallback(() => {
    setPrintDialogOpen(true);
  }, [setPrintDialogOpen]);

  const handleExportToFolder = useCallback(async () => {
    const s = useAppStore.getState();
    if (s.shapes.length === 0) {
      await showInfo('Nothing to export. Draw some shapes first.');
      return;
    }

    try {
      const name = s.projectName || 'project';
      const files: { name: string; content: string }[] = [];

      // SVG
      files.push({ name: `${name}.svg`, content: exportToSVG(s.shapes) });

      // DXF
      files.push({ name: `${name}.dxf`, content: exportToDXF(s.shapes, s.unitSettings) });

      // IFC (parametric)
      const ifcResult = generateIFC(s.shapes, s.wallTypes, s.slabTypes, s.projectStructure, s.drawings, s.pileTypes);
      files.push({ name: `${name}.ifc`, content: ifcResult.content });

      // JSON
      files.push({ name: `${name}.json`, content: JSON.stringify({ shapes: s.shapes, layers: s.layers }, null, 2) });

      const result = await exportToFolder(name, files);
      if (!result) return; // cancelled

      await showInfo(
        `Exported to: ${result.folder}\n\n` +
        result.files.map(f => `  ✓ ${f}`).join('\n')
      );
      logger.info(`Exported ${result.files.length} files to folder: ${result.folder}`, 'File');
    } catch (err) {
      await showError(`Export to folder failed: ${err}`);
    }
  }, []);

  const handleExit = useCallback(async () => {
    if (isTauriEnvironment()) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      getCurrentWindow().close();
    } else {
      window.close();
    }
  }, []);

  return { handleNew, handleOpen, handleOpenPath, handleSave, handleSaveAs, handleExport, handleExportSVG, handleExportDXF, handleExportIFC, handleExportJSON, handleExportToFolder, handleImportDXF, handleImportDXFAsUnderlay, handlePrint, handleExit };
}
