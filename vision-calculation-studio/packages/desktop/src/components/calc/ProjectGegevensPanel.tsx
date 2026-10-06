import { Fragment, useMemo, useState } from "react";
import { useProjectStore } from "../../store/projectStore";
import { PROJECT_VELDEN, kFiVoor, type VeldDef } from "../../store/projectGegevens";
import WindAreaMap from "./WindAreaMap";
import "./ProjectGegevensPanel.css";

/**
 * Formulier met de gegevens die voor het héle project gelden.
 *
 * Wat je hier invult werkt door in elk rekenblad — de gevolgklasse vul je één
 * keer in, niet per blad. Alles wat per constructiedeel verschilt (belastingen,
 * afmetingen, materiaal) hoort níét hier maar in het blad zelf, zodat twee
 * exemplaren van dezelfde module elkaar nooit in de weg zitten.
 */
export default function ProjectGegevensPanel() {
  const gegevens = useProjectStore((s) => s.gegevens);
  const zetGegeven = useProjectStore((s) => s.zetGegeven);
  const projectNaam = useProjectStore((s) => s.projectNaam);
  const zetProjectNaam = useProjectStore((s) => s.zetProjectNaam);
  const exemplaren = useProjectStore((s) => s.exemplaren);
  // De windgebied-kaart is een hulpmiddel, geen invoerveld — inklapbaar zodat
  // het formulier compact blijft voor wie het gebied al weet.
  const [kaartOpen, setKaartOpen] = useState(true);

  const groepen = useMemo(() => {
    const uit: { naam: string; velden: VeldDef[] }[] = [];
    for (const veld of PROJECT_VELDEN) {
      let groep = uit.find((g) => g.naam === veld.groep);
      if (!groep) {
        groep = { naam: veld.groep, velden: [] };
        uit.push(groep);
      }
      groep.velden.push(veld);
    }
    return uit;
  }, []);

  const cc = parseFloat(gegevens.CC ?? "2");
  const kFi = kFiVoor(Number.isFinite(cc) ? cc : 2);

  return (
    <div className="pg-panel">
      <div className="pg-kop">
        <h1>Project details</h1>
        <p>
          {exemplaren.length === 0
            ? "These values apply to every calculation sheet in this project and do not need to be entered again."
            : `These values apply to ${exemplaren.length === 1 ? "the calculation sheet" : `alle ${exemplaren.length} rekenbladen`} in this project. Each sheet can use them without asking again.`}
        </p>
      </div>

      <div className="pg-groep">
        <h2>File</h2>
        <label className="pg-veld">
          <span className="pg-label">Project name (file)</span>
          <input
            type="text"
            value={projectNaam}
            placeholder="New project"
            onChange={(e) => zetProjectNaam(e.target.value)}
          />
          <span className="pg-hint">Name of the project file and heading of the PDF report.</span>
        </label>
      </div>

      {groepen.map((groep) => (
        <div className="pg-groep" key={groep.naam}>
          <h2>{groep.naam}</h2>
          {groep.velden.map((veld) => (
            <Fragment key={veld.naam}>
            <label className="pg-veld">
              <span className="pg-label">
                {veld.label}
                <code className="pg-var">{veld.naam}</code>
              </span>
              {veld.type === "keuze" ? (
                <select
                  value={gegevens[veld.naam] ?? veld.standaard}
                  onChange={(e) => zetGegeven(veld.naam, e.target.value)}
                >
                  {veld.opties?.map((o) => (
                    <option key={o.waarde} value={o.waarde}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={gegevens[veld.naam] ?? ""}
                  onChange={(e) => zetGegeven(veld.naam, e.target.value)}
                />
              )}
              {veld.hint && <span className="pg-hint">{veld.hint}</span>}
              {veld.naam === "CC" && (
                <span className="pg-afgeleid">
                  Derived: K<sub>FI</sub> = {kFi.toFixed(2).replace(".", ",")}
                </span>
              )}
            </label>
            {veld.naam === "windgebied" && (
              <div className="pg-windkaart">
                <button
                  type="button"
                  className="pg-windkaart-toggle"
                  onClick={() => setKaartOpen((o) => !o)}
                >
                  {kaartOpen ? "▾" : "▸"} Map — search for an address or click a location to set the wind region automatically
                </button>
                {kaartOpen && (
                  <WindAreaMap
                    initialAddress={gegevens.locatie ?? ""}
                    onWindGebiedChange={(gebied) => {
                      if (gebied) zetGegeven("windgebied", String(gebied));
                    }}
                  />
                )}
              </div>
            )}
            </Fragment>
          ))}
        </div>
      ))}

      <p className="pg-voet">
        You can use these names directly in a worksheet, for example{" "}
        <code>γ_G = 1,2·K_FI</code> or <code>#if CC ≡ 3</code>. If a sheet reassigns the value, it overrides the project value for that sheet only.
      </p>
    </div>
  );
}
