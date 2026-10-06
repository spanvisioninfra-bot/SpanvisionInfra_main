import { useEffect } from "react";
import { useProjectStore } from "../store/projectStore";
import { useAfdrukken } from "../store/printStore";
import { saveProject } from "../lib/saveProject";

/**
 * Sneltoetsen: Ctrl+Z / Ctrl+Y (en Ctrl+Shift+Z) om ongedaan te maken, Ctrl+P
 * om af te drukken.
 *
 * De editor heeft zijn eigen geschiedenis uitstaan, dus deze snelkoppelingen
 * werken overal hetzelfde: in de rekentekst, in het parametrische beeld en in
 * de projectboom.
 *
 * Uitzondering: staat de cursor in een gewoon invoerveld — een naam die je aan
 * het typen bent, een veld in de projectgegevens — dan laat de browser zijn
 * eigen ongedaan-gedrag doen. Anders zou één toetsaanslag zowel het woord als
 * de vorige projectwijziging terugdraaien.
 */
export function useSneltoetsen(): void {
  const ongedaan = useProjectStore((s) => s.ongedaan);
  const opnieuw = useProjectStore((s) => s.opnieuw);
  const afdrukken = useAfdrukken();

  useEffect(() => {
    const opToets = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const doel = e.target as HTMLElement | null;
      const tag = doel?.tagName;
      const toets = e.key.toLowerCase();
      if (toets === "s") {
        e.preventDefault();
        void saveProject();
        return;
      }
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (toets === "p") {
        // Eigen afdrukweergave in plaats van de kale pagina van de browser.
        e.preventDefault();
        afdrukken();
      } else if (toets === "z" && !e.shiftKey) {
        e.preventDefault();
        ongedaan();
      } else if (toets === "y" || (toets === "z" && e.shiftKey)) {
        e.preventDefault();
        opnieuw();
      }
    };
    window.addEventListener("keydown", opToets);
    const save = () => { void saveProject(); };
    window.addEventListener("spanvision:save", save);
    return () => {
      window.removeEventListener("keydown", opToets);
      window.removeEventListener("spanvision:save", save);
    };
  }, [ongedaan, opnieuw, afdrukken]);
}
