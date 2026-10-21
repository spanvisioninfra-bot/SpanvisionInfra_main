import { useMemo, useState, useEffect } from "react";
import Modal from "../Modal";
import "./OffertesDialog.css";

/**
 * Vraag-3-offertes-dialog: toont de Nederlandse sondeerbedrijven uit
 * de catalogus, gesorteerd op afstand tot het project (lat/lon van
 * de eerste sondering of het kaart-center). De 3 dichtstbijzijnde
 * worden voorgevinkt; de gebruiker kan toggelen. "Email openen"
 * bouwt een `mailto:` URL met alle geselecteerde adressen als
 * recipients + een prefilled offerte-aanvraag in body.
 *
 * Werkt met de catalogus uit `src/data/sondeerbedrijven.ts` —
 * die wordt los van deze component (handmatig) bijgehouden.
 */

import { SONDEERBEDRIJVEN, type Sondeerbedrijf } from "../../data/sondeerbedrijven";

export interface OffertesDialogProps {
  open: boolean;
  onClose: () => void;
  /** Project-naam — gebruikt in subject + body van de email. */
  projectName: string;
  /** Projectnummer (intern) — gaat als referentie in de subject. */
  projectNumber: string;
  /** Projectlocatie in WGS84. Bij ontbreken (geen sonderingen
   *  geplaatst) wordt fallback Amersfoort-center gebruikt en geen
   *  afstand-sortering toegepast. */
  projectLat?: number;
  projectLon?: number;
  /** Adres-string voor in de body (bv. titleBlock.address). */
  projectAddress?: string;
  /** Optioneel: aantal sonderingen om in de aanvraag te benoemen. */
  aantalSonderingen?: number;
}

/** Haversine afstand in km tussen twee WGS84-punten. */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export default function OffertesDialog({
  open,
  onClose,
  projectName,
  projectNumber,
  projectLat,
  projectLon,
  projectAddress,
  aantalSonderingen,
}: OffertesDialogProps) {
  const projectLoc = useMemo(() => {
    if (projectLat != null && projectLon != null) {
      return { lat: projectLat, lon: projectLon };
    }
    // Fallback: Lange Geldersekade 2, 3311CJ Dordrecht (zelfde
    // home-base als de Kaart-tab). Sorteren wordt dan op afstand-
    // tot-home — niet ideaal maar consistent met de rest van de app.
    return { lat: 51.81435338, lon: 4.66003133 };
  }, [projectLat, projectLon]);

  /** Gesorteerd op afstand tot project, dichtstbij eerst. */
  const sorted = useMemo(() => {
    return [...SONDEERBEDRIJVEN]
      .map((b) => ({
        ...b,
        distKm: haversineKm(projectLoc.lat, projectLoc.lon, b.lat, b.lon),
      }))
      .sort((a, b) => a.distKm - b.distKm);
  }, [projectLoc]);

  /** Geselecteerde bedrijf-IDs. Top-3 voorgevinkt bij eerste open. */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Reset selectie naar top-3 telkens als de dialog (her)opent.
  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set(sorted.slice(0, 3).map((b) => b.id)));
  }, [open, sorted]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedCompanies = sorted.filter((b) => selectedIds.has(b.id));

  /** Bouwt de mailto: URL. Outlook + Apple Mail begrijpen meerdere
   *  recipients comma-separated. Body is RFC 2368 percent-encoded
   *  (newlines worden %0A). */
  const buildMailto = (companies: Sondeerbedrijf[]): string => {
    const to = companies.map((c) => c.email).join(",");
    const projectLine = projectName
      ? `${projectName}${projectNumber ? ` (${projectNumber})` : ""}`
      : "geotechnical site investigation";
    const subject = `CPT quotation request —${projectLine}`;
    const greeting = companies.length === 1
      ? `Dear ${companies[0].contactPerson || "Sir or Madam"},`
      : "Dear Sir or Madam,";
    const aantalLine = aantalSonderingen != null
      ? `Number of CPTs:${aantalSonderingen}`
      : "";
    const adresLine = projectAddress
      ? `\nProject address: ${projectAddress}`
      : "";
    const body = `${greeting}

Please provide a quotation for cone penetration testing for the following project:

Project: ${projectName || "[project name]"}${
      projectNumber ? `\nProject number: ${projectNumber}` : ""
    }${adresLine}${aantalLine}

Please include:
- CPTs to the agreed investigation depth
- Sleeve friction measurements, if applicable
- Reports in BRO-XML, GEF and PDF formats
- Expected turnaround time

Please contact me by email if you have any questions.

Kind regards,
[your name]
[your company]`;
    // RFC 2368: %0A voor newlines, %20 voor spaties, etc.
    // Gebruik encodeURIComponent maar daarna `+` terug naar `%20`
    // zodat Outlook het correct interpreteert.
    return (
      `mailto:${encodeURIComponent(to)}` +
      `?subject=${encodeURIComponent(subject).replace(/\+/g, "%20")}` +
      `&body=${encodeURIComponent(body).replace(/\+/g, "%20")}`
    );
  };

  const onOpenMail = () => {
    if (selectedCompanies.length === 0) return;
    const url = buildMailto(selectedCompanies);
    // Open de mailto-URL; Outlook (of de standaard mail-app) pakt
    // 'm op. window.location vs window.open — beide werken in
    // WebView2, maar window.open vermijdt navigatie van de huidige
    // pagina als de mail-handler vertraging heeft.
    window.open(url, "_blank");
    onClose();
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={"Request three quotations from CPT companies"}
      width={640}
      className="offertes-modal"
      footer={
        <div className="offertes-footer">
          <span className="offertes-footer-info">
            {selectedCompanies.length} bedrijf
            {selectedCompanies.length === 1 ? "" : "ven"} selected
          </span>
          <button
            type="button"
            className="offertes-btn-secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="offertes-btn-primary"
            disabled={selectedCompanies.length === 0}
            onClick={onOpenMail}
            title={"Open your default email app with a prepared quotation request"}
          >
            Open email ({selectedCompanies.length})
          </button>
        </div>
      }
    >
      <p className="offertes-hint">
        Sorted by distance from the project. The three nearest companies are selected. Adjust your selection and click &ldquo;Open email&rdquo; to prepare a quotation request for the selected companies.
      </p>
      <div className="offertes-list" role="list">
        {sorted.slice(0, 15).map((b) => {
          const checked = selectedIds.has(b.id);
          return (
            <label
              key={b.id}
              className={`offertes-row${checked ? " selected" : ""}`}
              role="listitem"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(b.id)}
              />
              <div className="offertes-row-main">
                <div className="offertes-row-name">{b.name}</div>
                <div className="offertes-row-meta">
                  <span className="offertes-city">{b.city}</span>
                  <span className="offertes-dist">
                    {b.distKm.toFixed(1)} km
                  </span>
                </div>
                <div className="offertes-row-contact">
                  {b.contactPerson && (
                    <span className="offertes-contact-person">
                      {b.contactPerson} ·{" "}
                    </span>
                  )}
                  <a
                    href={`mailto:${b.email}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {b.email}
                  </a>
                </div>
              </div>
            </label>
          );
        })}
      </div>
      {sorted.length > 15 && (
        <p className="offertes-more">
          + {sorted.length - 15} additional companies hidden. The catalog ({sorted.length} companies) is in
          <code>apps/desktop/src/data/sondeerbedrijven.ts</code>.
        </p>
      )}
    </Modal>
  );
}
