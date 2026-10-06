import { useState, useRef, useCallback } from 'react';
import { useAppStore } from '../../../state/appStore';
import { parsePointcloudFile, FILE_INPUT_ACCEPT, SUPPORTED_EXTENSIONS } from '../../../engine/pointcloud/PointcloudParser';
import { setBrowserPointcloud, getBrowserPointcloud } from '../../../engine/pointcloud/BrowserPointcloudStore';
import { reconstructSurface, type ReconstructionProgress } from '../../../engine/pointcloud/SurfaceReconstruction';
import { exportToOBJ, downloadOBJ } from '../../../engine/pointcloud/MeshExporter';
import { exportToPLY, exportToXYZ, exportToPTS, exportToCSV, downloadFile } from '../../../engine/pointcloud/PointcloudExporter';
import { translatePointcloud, scalePointcloud, thinPointcloud } from '../../../engine/pointcloud/PointcloudTransforms';
import { formatPoints } from '../../../utils/format';

export function useRibbonActions() {
  const activePointcloudId = useAppStore((s) => s.activePointcloudId);
  const incrementTransformVersion = useAppStore((s) => s.incrementTransformVersion);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Transform inputs
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const [translateZ, setTranslateZ] = useState(0);
  const [scaleX, setScaleX] = useState(1);
  const [scaleY, setScaleY] = useState(1);
  const [scaleZ, setScaleZ] = useState(1);
  const [thinPercent, setThinPercent] = useState(50);

  // Reconstruction state
  const [reconstructing, setReconstructing] = useState(false);
  const [reconOpen, setReconOpen] = useState(false);
  const [reconPhase, setReconPhase] = useState('');
  const [reconPercent, setReconPercent] = useState(0);
  const reconCancelledRef = useRef({ value: false });
  const editingRef = useRef(false);

  const isTauri = !!(window as any).__TAURI_INTERNALS__;

  const editableCloud = useCallback(async (id: string) => {
    const existing = getBrowserPointcloud(id);
    if (existing) return existing;
    const pc = useAppStore.getState().pointclouds.find(p => p.id === id);
    if (!isTauri || !pc) throw new Error('Load a pointcloud first');
    if (pc.indexingProgress < 1) throw new Error('Wait for this cloud to finish indexing before editing it');
    const { invoke } = await import('@tauri-apps/api/core');
    const bytes = await invoke<ArrayBuffer>('pointcloud_read_editable_source', { id });
    const parsed = await parsePointcloudFile(new File([bytes], pc.fileName));
    if (parsed.header.numberOfPoints !== parsed.positions.length / 3) {
      throw new Error('The source changed or exceeds the complete-cloud editing limit. Reopen or split the file first.');
    }
    if (!useAppStore.getState().pointclouds.some(p => p.id === id)) throw new Error('This cloud was closed while preparing it');
    setBrowserPointcloud(id, parsed);
    return parsed;
  }, [isTauri]);

  const updateEditedCloud = useCallback((id: string) => {
    const parsed = getBrowserPointcloud(id);
    if (!parsed) return;
    const h = parsed.header;
    useAppStore.setState(s => {
      const pc = s.pointclouds.find(p => p.id === id);
      if (pc) {
        pc.totalPoints = parsed.positions.length / 3;
        pc.bounds = { minX: h.minX, minY: h.minY, minZ: h.minZ, maxX: h.maxX, maxY: h.maxY, maxZ: h.maxZ };
        pc.transformVersion += 1;
      }
    });
  }, []);

  const runEdit = useCallback(async (operation: (id: string) => void) => {
    if (!activePointcloudId || editingRef.current) return;
    editingRef.current = true;
    try {
      await editableCloud(activePointcloudId);
      operation(activePointcloudId);
      updateEditedCloud(activePointcloudId);
    } catch (error) {
      useAppStore.getState().showMessage(error instanceof Error ? error.message : String(error));
    } finally { editingRef.current = false; }
  }, [activePointcloudId, editableCloud, updateEditedCloud]);

  const handleTranslate = useCallback(() => {
    return runEdit(id => { translatePointcloud(id, translateX, translateY, translateZ); });
  }, [runEdit, translateX, translateY, translateZ]);

  const handleScale = useCallback(() => {
    return runEdit(id => { scalePointcloud(id, scaleX, scaleY, scaleZ); });
  }, [runEdit, scaleX, scaleY, scaleZ]);

  const handleThin = useCallback(() => {
    return runEdit(id => { thinPointcloud(id, thinPercent); });
  }, [runEdit, thinPercent]);

  const handleReconstruct = useCallback(async () => {
    if (!activePointcloudId || reconstructing) return;
    reconCancelledRef.current = { value: false };
    setReconstructing(true);
    setReconOpen(true);
    setReconPhase('Initializing');
    setReconPercent(0);

    try {
      const parsed = await editableCloud(activePointcloudId);
      if (reconCancelledRef.current.value) throw new Error('Reconstruction cancelled');
      const result = await reconstructSurface(parsed.positions, {
        kNeighbors: 15,
        onProgress: (progress: ReconstructionProgress) => {
          setReconPhase(progress.phase);
          setReconPercent(progress.percent);
        },
        cancelled: reconCancelledRef.current,
      });

      parsed.indices = result.indices;
      setBrowserPointcloud(activePointcloudId, parsed);
      incrementTransformVersion(activePointcloudId);

      setReconPhase(`Complete — ${result.indices.length / 3} triangles`);
      setReconPercent(100);
      await new Promise((r) => setTimeout(r, 1200));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg !== 'Reconstruction cancelled') {
        useAppStore.getState().showMessage(`Reconstruction failed:\n${msg}`);
      }
    } finally {
      setReconstructing(false);
      setReconOpen(false);
    }
  }, [activePointcloudId, reconstructing, incrementTransformVersion, editableCloud]);

  const handleReconCancel = useCallback(() => {
    reconCancelledRef.current.value = true;
    setReconPhase('Cancelling...');
  }, []);

  const handleExportOBJ = useCallback(() => {
    if (!activePointcloudId) return;
    const parsed = getBrowserPointcloud(activePointcloudId);
    if (!parsed) {
      useAppStore.getState().showMessage('No pointcloud data found.');
      return;
    }
    if (!parsed.indices || parsed.indices.length === 0) {
      useAppStore.getState().showMessage('No mesh data. Run "Reconstruct" first to generate a mesh.');
      return;
    }

    const pc = useAppStore.getState().pointclouds.find((p) => p.id === activePointcloudId);
    const baseName = pc?.fileName?.replace(/\.[^.]+$/, '') ?? 'mesh';

    const obj = exportToOBJ(parsed.positions, parsed.indices, undefined, parsed.colors, parsed.center);
    downloadOBJ(obj, `${baseName}.obj`);
  }, [activePointcloudId]);

  const handleExport = useCallback(async (format: 'ply-binary' | 'ply-ascii' | 'obj' | 'xyz' | 'pts' | 'csv') => {
    if (!activePointcloudId) return;
    const parsed = getBrowserPointcloud(activePointcloudId);
    const pc = useAppStore.getState().pointclouds.find((p) => p.id === activePointcloudId);
    const baseName = pc?.fileName?.replace(/\.[^.]+$/, '') ?? 'pointcloud';
    if (!parsed && isTauri && pc) {
      if (format === 'obj') {
        useAppStore.getState().showMessage('This cloud has no mesh. Import a triangle mesh or reconstruct a browser-parsed cloud before exporting OBJ.');
        return;
      }
      try {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const extension = format.startsWith('ply-') ? 'ply' : format;
        const destination = await save({ defaultPath: `${baseName}.${extension}`, filters: [{ name: `${extension.toUpperCase()} pointcloud`, extensions: [extension] }] });
        if (!destination) return;
        const { invoke } = await import('@tauri-apps/api/core');
        const count = await invoke<number>('pointcloud_export', { id: activePointcloudId, format, filePath: destination });
        useAppStore.getState().showMessage(`Exported ${count.toLocaleString('en-GB')} points.`);
      } catch (error) { useAppStore.getState().showMessage(`Export failed: ${error instanceof Error ? error.message : String(error)}`); }
      return;
    }
    if (!parsed) {
      useAppStore.getState().showMessage('No pointcloud data found. Load a pointcloud first.');
      return;
    }

    switch (format) {
      case 'ply-binary': {
        const blob = exportToPLY(parsed, true);
        downloadFile(blob, `${baseName}.ply`);
        break;
      }
      case 'ply-ascii': {
        const blob = exportToPLY(parsed, false);
        downloadFile(blob, `${baseName}.ply`);
        break;
      }
      case 'obj': {
        if (!parsed.indices || parsed.indices.length === 0) {
          useAppStore.getState().showMessage('No mesh data. Run "Reconstruct" first to export OBJ.');
          return;
        }
        const obj = exportToOBJ(parsed.positions, parsed.indices, undefined, parsed.colors, parsed.center);
        downloadOBJ(obj, `${baseName}.obj`);
        break;
      }
      case 'xyz': {
        const content = exportToXYZ(parsed);
        downloadFile(content, `${baseName}.xyz`);
        break;
      }
      case 'pts': {
        const content = exportToPTS(parsed);
        downloadFile(content, `${baseName}.pts`);
        break;
      }
      case 'csv': {
        const content = exportToCSV(parsed);
        downloadFile(content, `${baseName}.csv`);
        break;
      }
    }
  }, [activePointcloudId, isTauri]);

  const handleImport = useCallback(async () => {
    if (isTauri) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const result = await open({
          multiple: true,
          filters: [{ name: 'Point Clouds', extensions: SUPPORTED_EXTENSIONS.map(e => e.slice(1)) }],
        });
        if (!result) return;

        const files = Array.isArray(result) ? result : [result];

        for (const filePath of files) {
          const id = crypto.randomUUID();
          const fileName = filePath.split(/[/\\]/).pop() || 'unknown';
          const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
          const isNativeLAS = ext === '.las' || ext === '.laz';

          if (isNativeLAS) {
            // LAS/LAZ: use Rust backend parser + octree
            const { invoke } = await import('@tauri-apps/api/core');

            try {
              const meta: any = await invoke('pointcloud_open', { filePath });
              const rustId = meta.id;

              useAppStore.getState().addPointcloud({
                id: rustId,
                fileName,
                filePath,
                format: meta.format,
                totalPoints: meta.total_points,
                bounds: {
                  minX: meta.bounds.min_x,
                  minY: meta.bounds.min_y,
                  minZ: meta.bounds.min_z,
                  maxX: meta.bounds.max_x,
                  maxY: meta.bounds.max_y,
                  maxZ: meta.bounds.max_z,
                },
                hasColor: meta.has_color,
                hasIntensity: meta.has_intensity,
                hasClassification: meta.has_classification,
                visible: true,
                indexingProgress: 0,
                indexingPhase: 'Reading points...',
                transformVersion: 0,
              });

              // Poll Rust backend until octree is fully built
              const pollProgress = async () => {
                while (true) {
                  await new Promise((r) => setTimeout(r, 500));
                  try {
                    const prog: any = await invoke('pointcloud_get_progress', { id: rustId });
                    useAppStore.getState().updatePointcloudProgress(
                      rustId,
                      prog.progress,
                      prog.phase,
                    );
                    if (prog.progress >= 1.0 || prog.phase === 'Complete') {
                      useAppStore.getState().updatePointcloudProgress(rustId, 1.0, 'Ready');
                      break;
                    }
                    if (prog.phase.startsWith('Error:')) {
                      console.error('Octree build failed:', prog.phase);
                      useAppStore.getState().showMessage(prog.phase);
                      break;
                    }
                  } catch {
                    break;
                  }
                }
              };
              pollProgress();
            } catch (err) {
              console.error('Failed to open pointcloud:', err);
              useAppStore.getState().showMessage(`Unable to open ${fileName}: ${err instanceof Error ? err.message : String(err)}`);
            }
          } else {
            // Non-LAS formats: read file bytes, use frontend parser
            try {
              const { readFile } = await import('@tauri-apps/plugin-fs');
              const bytes = await readFile(filePath);
              const file = new File([bytes], fileName);

              useAppStore.getState().addPointcloud({
                id,
                fileName,
                filePath,
                format: ext.replace('.', '').toUpperCase(),
                totalPoints: 0,
                bounds: { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 },
                hasColor: false,
                hasIntensity: false,
                hasClassification: false,
                visible: true,
                indexingProgress: 0,
                indexingPhase: 'Reading file...',
                transformVersion: 0,
              });

              const parsed = await parsePointcloudFile(file, (phase, percent) => {
                useAppStore.getState().updatePointcloudProgress(id, percent / 100, phase);
              });
              const h = parsed.header;

              setBrowserPointcloud(id, parsed);

              useAppStore.setState((s) => {
                const pc = s.pointclouds.find((p) => p.id === id);
                if (pc) {
                  pc.totalPoints = parsed.positions.length / 3;
                  pc.bounds = {
                    minX: h.minX, minY: h.minY, minZ: h.minZ,
                    maxX: h.maxX, maxY: h.maxY, maxZ: h.maxZ,
                  };
                  pc.hasColor = parsed.hasColor;
                  pc.hasIntensity = parsed.hasIntensity;
                  pc.hasClassification = parsed.hasClassification;
                  pc.indexingProgress = 1.0;
                  pc.indexingPhase = 'Ready';
                }
              });
            } catch (err) {
              console.error('Failed to parse pointcloud file:', err);
              useAppStore.getState().removePointcloud(id);
              useAppStore.getState().showMessage(`Unable to open ${fileName}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }
      } catch (err) {
        console.error('Import failed:', err);
      }
    } else {
      fileInputRef.current?.click();
    }
  }, [isTauri]);

  const handleBrowserFiles = useCallback(async (files: File[]) => {

    for (const file of Array.from(files)) {
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      const format = ext.replace('.', '').toUpperCase();

      const id = crypto.randomUUID();
      useAppStore.getState().addPointcloud({
        id,
        fileName: file.name,
        filePath: file.name,
        format,
        totalPoints: 0,
        bounds: { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 },
        hasColor: false,
        hasIntensity: false,
        hasClassification: false,
        visible: true,
        indexingProgress: 0,
        indexingPhase: 'Reading file...',
        transformVersion: 0,
      });

      try {
        console.time(`[pointcloud] total import ${file.name}`);
        console.time(`[pointcloud] worker parse ${file.name}`);
        const parsed = await parsePointcloudFile(file, (phase, percent) => {
          console.log(`[pointcloud] progress: ${phase} ${percent}%`);
          useAppStore.getState().updatePointcloudProgress(id, percent / 100, phase);
        });
        console.timeEnd(`[pointcloud] worker parse ${file.name}`);
        const h = parsed.header;
        console.log(`[pointcloud] parsed ${parsed.positions.length / 3} points, hasColor=${parsed.hasColor}`);

        console.time(`[pointcloud] setBrowserPointcloud ${file.name}`);
        setBrowserPointcloud(id, parsed);
        console.timeEnd(`[pointcloud] setBrowserPointcloud ${file.name}`);

        console.time(`[pointcloud] store update ${file.name}`);
        useAppStore.setState((s) => {
          const pc = s.pointclouds.find((p) => p.id === id);
          if (pc) {
            pc.totalPoints = parsed.positions.length / 3;
            pc.bounds = {
              minX: h.minX, minY: h.minY, minZ: h.minZ,
              maxX: h.maxX, maxY: h.maxY, maxZ: h.maxZ,
            };
            pc.hasColor = parsed.hasColor;
            pc.hasIntensity = parsed.hasIntensity;
            pc.hasClassification = parsed.hasClassification;
            pc.indexingProgress = 1.0;
            pc.indexingPhase = 'Ready';
          }
        });
        console.timeEnd(`[pointcloud] store update ${file.name}`);
        console.timeEnd(`[pointcloud] total import ${file.name}`);
      } catch (err) {
        console.error('Failed to parse pointcloud file:', err);
        useAppStore.getState().removePointcloud(id);
        useAppStore.getState().showMessage(`Failed to parse ${file.name}:\n${err instanceof Error ? err.message : String(err)}`);
      }
    }

  }, []);
  const handleFileInputChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    input.value = '';
    await handleBrowserFiles(files);
  }, [handleBrowserFiles]);
  const handleLoadSample = useCallback(async () => {
    try {
      const response = await fetch('/samples/site-scan.ply');
      if(!response.ok) throw new Error('Sample could not be loaded. Try importing a local file.');
      await handleBrowserFiles([new File([await response.blob()], 'site-scan.ply')]);
    } catch(error) { useAppStore.getState().showMessage(error instanceof Error ? error.message : String(error)); }
  }, [handleBrowserFiles]);

  return {
    // File input
    fileInputRef,
    FILE_INPUT_ACCEPT,
    handleImport,
    handleLoadSample,
    handleFileInputChange,
    handleExport,
    handleExportOBJ,
    // Transforms
    translateX, setTranslateX,
    translateY, setTranslateY,
    translateZ, setTranslateZ,
    scaleX, setScaleX,
    scaleY, setScaleY,
    scaleZ, setScaleZ,
    thinPercent, setThinPercent,
    handleTranslate,
    handleScale,
    handleThin,
    // Reconstruction
    reconstructing,
    reconOpen,
    reconPhase,
    reconPercent,
    handleReconstruct,
    handleReconCancel,
    // Utils
    formatBudget: formatPoints,
  };
}
