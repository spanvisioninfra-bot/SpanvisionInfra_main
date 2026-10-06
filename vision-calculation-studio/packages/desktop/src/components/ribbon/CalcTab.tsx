import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import RibbonGroup from "./RibbonGroup";
import RibbonButton from "./RibbonButton";
import RibbonButtonStack from "./RibbonButtonStack";
import {
  newDocIcon,
  openFolderIcon,
  saveDiskIcon,
  undoIcon,
  redoIcon,
  imageIcon,
  pdfIcon,
} from "./calcIcons";
import { saveProject } from "../../lib/saveProject";
import { useProjectStore } from "../../store/projectStore";
import { leesProjectBestand } from "../../store/projectBestand";
import { useAfdrukken, usePrintStore } from "../../store/printStore";
import { openCalculationFile } from "../../tauri/fileOps";
import { useRecentFiles } from "../../hooks/useRecentFiles";

interface CalcTabProps {
  onSettingsClick?: () => void;
}

export default function CalcTab({ onSettingsClick: _onSettingsClick }: CalcTabProps) {
  const { t } = useTranslation("ribbon");
  const laadProject = useProjectStore((s) => s.laadProject);
  const nieuwProject = useProjectStore((s) => s.nieuwProject);
  const ongedaan = useProjectStore((s) => s.ongedaan);
  const opnieuw = useProjectStore((s) => s.opnieuw);
  const kanOngedaan = useProjectStore((s) => s.verleden.length > 0);
  const kanOpnieuw = useProjectStore((s) => s.toekomst.length > 0);
  const afdrukken = useAfdrukken();
  const toonVoorbeeld = usePrintStore((s) => s.toonVoorbeeld);
  const { addRecentFile } = useRecentFiles();

  const handleOpen = useCallback(async () => {
    try {
      const file = await openCalculationFile();
      if (!file) return;
      laadProject(leesProjectBestand(file.raw, file.name));
      useProjectStore.getState().markeerOpgeslagen(file.path);
      await addRecentFile({
        path: file.path,
        name: file.name,
        type: "report",
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error("Open file failed:", err);
      alert(`Unable to open file:${(err as Error).message}`);
    }
  }, [laadProject, addRecentFile]);

  const handleSave = saveProject;

  const handleNew = useCallback(() => {
    if (useProjectStore.getState().dirty) {
      const ok = confirm("Niet-opgeslagen wijzigingen worden weggegooid. Doorgaan?");
      if (!ok) return;
    }
    nieuwProject();
  }, [nieuwProject]);

  /**
   * Afdrukken via de browser, niet via de rapportengine.
   *
   * `documentToReport` (de weg naar de Rust-engine) slaat svg- en image-knopen
   * over, dus daar komt geen enkele tekening uit. Bovendien is die engine een
   * pad-afhankelijkheid naar de `openaec-reports`-repo; zonder die repo is de
   * app niet eens te bouwen. Deze weg print exact wat de uitwerking toont —
   * formules, tekeningen en afbeeldingen — en in de printdialoog kies je
   * "Opslaan als PDF". Zie docs/backlog.md.
   */
  const handlePrint = useCallback(() => {
    if (useProjectStore.getState().exemplaren.length === 0) {
      alert("This project has no calculation sheets yet.");
      return;
    }
    afdrukken();
  }, [afdrukken]);

  const handleVoorbeeld = useCallback(() => {
    if (useProjectStore.getState().exemplaren.length === 0) {
      alert("This project has no calculation sheets yet.");
      return;
    }
    toonVoorbeeld();
  }, [toonVoorbeeld]);

  return (
    <div className="ribbon-content">
      <div className="ribbon-groups">
        <RibbonGroup label={t("calc.file", "Bestand")}>
          <RibbonButton icon={newDocIcon} label={t("calc.new", "Nieuw")} size="large" onClick={handleNew} />
          <RibbonButton icon={openFolderIcon} label={t("calc.browse", "Browse…")} size="large" onClick={handleOpen} />
          <RibbonButton icon={saveDiskIcon} label={t("calc.save", "Save")} size="large" onClick={handleSave} />
        </RibbonGroup>

        <RibbonGroup label={t("calc.edit", "Bewerken")}>
          <RibbonButtonStack>
            <RibbonButton
              icon={undoIcon}
              label={t("calc.undo", "Ongedaan")}
              size="small"
              disabled={!kanOngedaan}
              onClick={ongedaan}
            />
            <RibbonButton
              icon={redoIcon}
              label={t("calc.redo", "Opnieuw")}
              size="small"
              disabled={!kanOpnieuw}
              onClick={opnieuw}
            />
          </RibbonButtonStack>
        </RibbonGroup>

        <RibbonGroup label={t("insert.media", "Media")}>
          <RibbonButton icon={imageIcon} label={t("insert.image", "Afbeelding")} size="large" onClick={() => {}} />
        </RibbonGroup>

        <RibbonGroup label={t("calc.export", "Exporteren")}>
          <RibbonButton
            icon={pdfIcon}
            label={t("calc.preview", "Preview")}
            size="large"
            onClick={handleVoorbeeld}
          />
          <RibbonButton
            icon={pdfIcon}
            label={t("calc.pdfSave", "Save PDF")}
            size="large"
            onClick={handlePrint}
          />
        </RibbonGroup>
      </div>

    </div>
  );
}
