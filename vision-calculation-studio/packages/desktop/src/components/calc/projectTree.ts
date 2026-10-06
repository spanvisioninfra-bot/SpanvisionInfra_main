/**
 * Modulecatalogus en naslagbibliotheek voor het zijpaneel.
 *
 * Dit bestand beschrijft WAT je kunt invoegen, niet wat er in je project zit.
 * De projectinhoud staat in `store/projectStore.ts`: een lijst exemplaren, elk
 * met een eigen kopie van de rekentekst en eigen invoerwaarden. Een module uit
 * deze catalogus kan dus meerdere keren in een project voorkomen.
 *
 *   - `moduleCatalogus` — rekenmodules, gegroepeerd per materiaal. Invoegen
 *     maakt er een exemplaar van.
 *   - `bibliotheek` — naslag: boeken, normuitwerkingen, CalcPAD-voorbeelden.
 *     Ook invoegbaar, zodat je een normuitwerking in je berekening kunt
 *     opnemen.
 *
 * `templateId` matcht een sleutel in `src/templates/index.ts`.
 */

export type ModuleStatus =
  /** Toetsing uitgewerkt én nagerekend op referentiebladen. */
  | "gereed"
  /** Toetsing staat er, maar is nog niet tegen referentiebladen gecontroleerd. */
  | "controleren"
  /** Alleen invoer en parametrisch beeld — de toetsing moet nog worden gemaakt. */
  | "concept";

export const STATUS_UITLEG: Record<ModuleStatus, string> = {
  gereed: "Calibrated — calculations verified against reference sheets",
  controleren: "Calculation complete — awaiting verification against reference sheets",
  concept: "To be completed — inputs and model view available; calculation pending",
};

/**
 * Publicatie staat los van de status hierboven.
 *
 * De status zegt hoe ver de tóétsing is; publicatie zegt of de module is
 * nagekeken en vrijgegeven om mee te werken. Een module kan gecalibreerd zijn
 * en toch nog niet zijn nagekeken — dan is hij wel bruikbaar maar niet
 * vrijgegeven, en dat hoort de gebruiker te zien.
 */
export const PUBLICATIE_UITLEG = {
  gepubliceerd: "Published — reviewed and released",
  onuitgegeven: "Unpublished — awaiting review",
} as const;

export type TreeNode =
  | { kind: "section"; id: string; label: string; children: TreeNode[] }
  | { kind: "category"; id: string; label: string; defaultExpanded?: boolean; children: TreeNode[]; count?: number }
  | {
      kind: "item";
      id: string;
      label: string;
      templateId?: string;
      emphasis?: boolean;
      status?: ModuleStatus;
      /** Nagekeken en vrijgegeven. Ontbreekt of `false` = nog niet. */
      gepubliceerd?: boolean;
    };

/**
 * Calc-sheets binnen het huidige project, gegroepeerd per materiaal.
 *
 * Vijf categorieën — Algemeen, Staal, Beton, Hout, Metselwerk — elk met de
 * modules die erbij horen. Binnen een categorie eerst de constructiedelen
 * (kolom, ligger, wand), daarna de verbindingen en tot slot de losse toetsen.
 *
 * Een `▫` achter het label betekent: invoer en parametrisch beeld zijn er, de
 * toetsing moet nog worden uitgewerkt.
 *
 * Voor nu hardcoded; later vervangen door dynamische projectstaat (persisted
 * per project file).
 */
export const moduleCatalogus: TreeNode[] = [
  {
    kind: "category",
    id: "cat-algemeen",
    label: "General",
    defaultExpanded: true,
    count: 3,
    children: [
      { kind: "item", id: "sheet-spuwer", label: "Scupper (emergency overflow)", templateId: "spuwer", status: "gereed", gepubliceerd: true },
      { kind: "item", id: "sheet-paaldraagvermogen", label: "Pile bearing capacity", templateId: "paaldraagvermogen", status: "controleren" },
      { kind: "item", id: "sheet-permanente-vuurlast", label: "Permanent fire load (NEN 6090)", templateId: "permanente-vuurlast", status: "controleren" },
    ],
  },
  {
    kind: "category",
    id: "cat-staal",
    label: "Steel",
    defaultExpanded: true,
    count: 13,
    children: [
      // "Stalen ligger IPE 300" stond hier als module, maar is een uitgewerkt
      // voorbeeld met de doorsnede hard ingetypt — geen profielkeuze, geen
      // parametrisch beeld. De echte toetsing staat als "Volledige toetsing
      // stalen ligger" in de bibliotheek hieronder.
      { kind: "item", id: "sheet-stalen-gevelkolom", label: "Steel facade column (wind + N)", templateId: "stalen-gevelkolom", status: "controleren" },
      { kind: "item", id: "sheet-verticaal-windverband", label: "Vertical wind bracing", templateId: "verticaal-windverband", status: "controleren" },
      { kind: "item", id: "sheet-voetplaatverbinding", label: "Base plate connection (column base)", templateId: "voetplaatverbinding", status: "controleren" },
      { kind: "item", id: "sheet-boutberekening", label: "Bolt calculation", templateId: "boutberekening", status: "gereed" },
      { kind: "item", id: "sheet-steel-tension-international", label: "Tension cross-section (India / US / UK)", templateId: "steel-tension-international", status: "gereed" },
      {
        kind: "category",
        id: "cat-staal-concept",
        label: "To be completed",
        defaultExpanded: true,
        count: 7,
        children: [
          { kind: "item", id: "sheet-stalen-kolom", label: "Steel column", templateId: "stalen-kolom", status: "concept" },
          { kind: "item", id: "sheet-momentverbinding", label: "Moment connection", templateId: "momentverbinding", status: "concept" },
          { kind: "item", id: "sheet-dwarskrachtverbinding", label: "Shear connection", templateId: "dwarskrachtverbinding", status: "concept" },
          { kind: "item", id: "sheet-schoorverbinding", label: "Brace connection", templateId: "schoorverbinding", status: "concept" },
          { kind: "item", id: "sheet-penverbinding", label: "Pin connection", templateId: "penverbinding", status: "concept" },
          { kind: "item", id: "sheet-lasberekening", label: "Weld calculation", templateId: "lasberekening", status: "concept" },
          { kind: "item", id: "sheet-brandwerendheid", label: "Fire resistance", templateId: "brandwerendheid", status: "concept" },
        ],
      },
    ],
  },
  {
    kind: "category",
    id: "cat-beton",
    label: "Concrete",
    defaultExpanded: true,
    count: 6,
    children: [
      { kind: "item", id: "sheet-kruipfactor", label: "Creep factor", templateId: "kruipfactor", status: "gereed" },
      { kind: "item", id: "sheet-verankeringslengte", label: "Anchorage length", templateId: "verankeringslengte", status: "gereed" },
      {
        kind: "category",
        id: "cat-beton-concept",
        label: "To be completed",
        defaultExpanded: true,
        count: 4,
        children: [
          { kind: "item", id: "sheet-betondoorsnede", label: "Concrete section", templateId: "betondoorsnede", status: "concept" },
          { kind: "item", id: "sheet-betonkolom", label: "Concrete column", templateId: "betonkolom", status: "concept" },
          { kind: "item", id: "sheet-ponsberekening", label: "Punching shear", templateId: "ponsberekening", status: "concept" },
          { kind: "item", id: "sheet-tweepaals-poer", label: "Two-pile cap", templateId: "tweepaals-poer", status: "concept" },
        ],
      },
    ],
  },
  {
    kind: "category",
    id: "cat-hout",
    label: "Timber",
    defaultExpanded: true,
    count: 4,
    children: [
      { kind: "item", id: "sheet-kolom", label: "Column (timber column)", templateId: "kolom", status: "gereed" },
      { kind: "item", id: "sheet-balklaag", label: "Floor joists (timber floor beams)", templateId: "balklaag", status: "gereed", gepubliceerd: true },
      { kind: "item", id: "sheet-gording", label: "Purlin (roof purlin)", templateId: "gording", status: "gereed" },
      { kind: "item", id: "sheet-schijfwerking", label: "Diaphragm action (wall panel)", templateId: "schijfwerking", status: "controleren" },
    ],
  },
  {
    kind: "category",
    id: "cat-metselwerk",
    label: "Masonry",
    defaultExpanded: true,
    count: 2,
    children: [
      { kind: "item", id: "sheet-metselwerkwand", label: "Load-bearing masonry wall", templateId: "metselwerkwand", status: "controleren" },
      { kind: "item", id: "sheet-opleg-metselwerk", label: "Bearing on masonry", templateId: "opleg-metselwerk", status: "controleren" },
    ],
  },
];

export const bibliotheek: TreeNode[] = [
  {
    kind: "category",
    id: "books",
    label: "Books",
    defaultExpanded: false,
    count: 8,
    children: [
      { kind: "item", id: "book-bijlage-a", label: "Structural calculation Annex A" },
      { kind: "item", id: "book-funderingsadvies", label: "Foundation advice" },
      { kind: "item", id: "vdp-schuifspanning", label: "Vandepitte: Shear stresses (Jourawsky)", templateId: "vdp-schuifspanning" },
      { kind: "item", id: "vdp-doorbuiging", label: "Vandepitte: Deflection + dwarskracht", templateId: "vdp-doorbuiging" },
      { kind: "item", id: "vdp-knikken", label: "Vandepitte: Buckling (Euler)", templateId: "vdp-knikken" },
      { kind: "item", id: "vdp-mohr", label: "Vandepitte: Deflection (Mohr)", templateId: "vdp-mohr" },
      { kind: "item", id: "vdp-eigenfrequentie", label: "Vandepitte: Natural frequency", templateId: "vdp-eigenfrequentie" },
      { kind: "item", id: "vdp-virtuele-arbeid", label: "Vandepitte: Virtual work (truss)", templateId: "vdp-virtuele-arbeid" },
    ],
  },
  {
    kind: "category",
    id: "standards",
    label: "Standards",
    defaultExpanded: true,
    children: [
      {
        kind: "category",
        id: "std-en1990",
        label: "NEN-EN 1990 Basis of design",
        children: [
          { kind: "item", id: "en1990-compleet", label: "Combination overview", templateId: "en1990-compleet" },
          { kind: "item", id: "en1990-fundamenteel", label: "§6.4.3.2 UGT Fundamental (STR/GEO)", templateId: "en1990-fundamenteel" },
          { kind: "item", id: "en1990-equ", label: "§6.4.2 UGT Equilibrium (EQU)", templateId: "en1990-equ" },
          { kind: "item", id: "en1990-buitengewoon", label: "§6.4.3.3 UGT Accidental", templateId: "en1990-buitengewoon" },
          { kind: "item", id: "en1990-aardbeving", label: "§6.4.3.4 UGT Seismic", templateId: "en1990-aardbeving" },
          { kind: "item", id: "en1990-bgt", label: "§6.5.3 BGT (SLS)", templateId: "en1990-bgt" },
          { kind: "item", id: "en1990-groep-c", label: "Table NB.6 Geotechnical (group C)", templateId: "en1990-groep-c" },
          { kind: "item", id: "en1990-rekenwaarden", label: "§6.3 Design values", templateId: "en1990-rekenwaarden" },
          { kind: "item", id: "en1990-referentieperiode", label: "NB Reference period", templateId: "en1990-referentieperiode" },
        ],
      },
      {
        kind: "category",
        id: "std-en1991",
        label: "EN 1991 Loads",
        children: [
          { kind: "item", id: "en1991-gebruiksbelasting", label: "1-1 Imposed loads (Table NB.1-6.2)", templateId: "en1991-gebruiksbelasting" },
          { kind: "item", id: "en1991-sneeuwbelasting", label: "1-3 §5.2 Snow load", templateId: "en1991-sneeuwbelasting" },
          { kind: "item", id: "en1991-windbelasting", label: "1-4 §4/§7 Wind load", templateId: "en1991-windbelasting" },
        ],
      },
      {
        kind: "category",
        id: "std-en1992",
        label: "EN 1992-1-1 Concrete",
        children: [
          { kind: "item", id: "ec2-materiaal", label: "Table 3.1 Material properties", templateId: "ec2-materiaal" },
          { kind: "item", id: "ec2-buiging", label: "§6.1 Bending", templateId: "ec2-buiging" },
          { kind: "item", id: "ec2-dwarskracht-zonder", label: "§6.2.2 Shear without stirrups", templateId: "ec2-dwarskracht-zonder" },
          { kind: "item", id: "ec2-dwarskracht-met", label: "§6.2.3 Shear with stirrups", templateId: "ec2-dwarskracht-met" },
          { kind: "item", id: "ec2-pons", label: "§6.4 Punching shear", templateId: "ec2-pons" },
          { kind: "item", id: "ec2-scheurwijdte", label: "§7.3.4 Crack width", templateId: "ec2-scheurwijdte" },
          { kind: "item", id: "ec2-doorbuiging", label: "§7.4.2 Deflection", templateId: "ec2-doorbuiging" },
          { kind: "item", id: "ec2-betonbalk", label: "Complete concrete beam check", templateId: "ec2-betonbalk" },
        ],
      },
      {
        kind: "category",
        id: "std-en1993",
        label: "EN 1993-1-1 Steel",
        children: [
          { kind: "item", id: "ec3-materiaal", label: "§3.2 Material and partial factors", templateId: "ec3-materiaal" },
          { kind: "item", id: "ec3-classificatie", label: "§5.5 Section classification", templateId: "ec3-classificatie" },
          { kind: "item", id: "ec3-trek", label: "§6.2.3 Tension", templateId: "ec3-trek" },
          { kind: "item", id: "ec3-druk", label: "§6.2.4 Compression", templateId: "ec3-druk" },
          { kind: "item", id: "ec3-buiging", label: "§6.2.5 Bending", templateId: "ec3-buiging" },
          { kind: "item", id: "ec3-dwarskracht", label: "§6.2.6 Shear", templateId: "ec3-dwarskracht" },
          { kind: "item", id: "ec3-buiging-normaalkracht", label: "§6.2.9 Bending + axial force", templateId: "ec3-buiging-normaalkracht" },
          { kind: "item", id: "ec3-kip", label: "§6.3.2 Lateral torsional buckling (LTB)", templateId: "ec3-kip" },
          { kind: "item", id: "ec3-knik", label: "§6.3.1 Buckling", templateId: "ec3-knik" },
          { kind: "item", id: "ec3-doorbuiging", label: "§7.2 Deflection (SLS)", templateId: "ec3-doorbuiging" },
          { kind: "item", id: "ec3-stalen-ligger", label: "Complete steel beam check", templateId: "ec3-stalen-ligger" },
        ],
      },
      {
        kind: "category",
        id: "std-en1995",
        label: "EN 1995-1-1 Timber",
        children: [
          { kind: "item", id: "ec5-buiging", label: "§6.1.6 Bending", templateId: "ec5-buiging" },
          { kind: "item", id: "ec5-afschuiving", label: "§6.1.7 Shear", templateId: "ec5-afschuiving" },
          { kind: "item", id: "ec5-druk", label: "§6.1.4 Compression parallel to grain", templateId: "ec5-druk" },
          { kind: "item", id: "ec5-druk-loodrecht", label: "§6.1.5 Compression perpendicular to grain", templateId: "ec5-druk-loodrecht" },
          { kind: "item", id: "ec5-knik", label: "§6.3.2 Buckling", templateId: "ec5-knik" },
          { kind: "item", id: "ec5-doorbuiging", label: "§7.2 Deflection", templateId: "ec5-doorbuiging" },
          { kind: "item", id: "ec5-houten-balk", label: "Complete timber beam check", templateId: "ec5-houten-balk" },
        ],
      },
      {
        kind: "category",
        id: "std-en1996",
        label: "EN 1996-1-1 Masonry",
        children: [
          { kind: "item", id: "en1996-druksterkte", label: "§3.6 Masonry compressive strength", templateId: "en1996-druksterkte" },
          { kind: "item", id: "en1996-drukwand", label: "§6.1.2 Wall in compression", templateId: "en1996-drukwand" },
          { kind: "item", id: "en1996-afschuiving", label: "§6.2 Shear", templateId: "en1996-afschuiving" },
          { kind: "item", id: "en1996-slankheid", label: "§5.5.1 Slenderness", templateId: "en1996-slankheid" },
        ],
      },
      {
        kind: "category",
        id: "std-nen9997",
        label: "NEN 9997-1 Geotechniek",
        children: [
          { kind: "item", id: "en1997-funderingsstrook", label: "§6 Strip foundation", templateId: "en1997-funderingsstrook" },
          { kind: "item", id: "en1997-paaldraagvermogen", label: "§7 Pile bearing capacity", templateId: "en1997-paaldraagvermogen" },
          { kind: "item", id: "en1997-zetting", label: "§6.6 Settlement", templateId: "en1997-zetting" },
          { kind: "item", id: "en1997-glijding", label: "§6.5.3 Sliding", templateId: "en1997-glijding" },
        ],
      },
    ],
  },
  {
    kind: "category",
    id: "calcpad-samples",
    label: "CalcPAD examples",
    defaultExpanded: false,
    count: 12,
    children: [
      { kind: "item", id: "cpd-2259-intertek", label: "2259 Intertek units (real-world)", templateId: "cpd-2259-intertek" },
      { kind: "item", id: "cpd-calcpad-demo", label: "CalcPAD syntax demo", templateId: "calcpad-demo" },
      { kind: "item", id: "cpd-quadratic", label: "Quadratic Equation", templateId: "cpd-quadratic" },
      { kind: "item", id: "cpd-cubic", label: "Cubic Equation", templateId: "cpd-cubic" },
      { kind: "item", id: "cpd-lissajous", label: "Lissajous Curve", templateId: "cpd-lissajous" },
      { kind: "item", id: "cpd-rose", label: "Rose Curve", templateId: "cpd-rose" },
      { kind: "item", id: "cpd-rectangle", label: "Rectangle Area", templateId: "cpd-rectangle" },
      { kind: "item", id: "cpd-circle", label: "Circle Area", templateId: "cpd-circle" },
      { kind: "item", id: "cpd-sphere", label: "Sphere Volume", templateId: "cpd-sphere" },
      { kind: "item", id: "cpd-hexagon", label: "Hexagon Section", templateId: "cpd-hexagon" },
      { kind: "item", id: "cpd-ssb-force", label: "SSB Concentrated Force", templateId: "cpd-ssb-force" },
      { kind: "item", id: "cpd-deep-beam", label: "Deep Beam (Elastic)", templateId: "cpd-deep-beam" },
    ],
  },
];

/** Wat de app van een sjabloon moet weten zodra het een exemplaar wordt. */
export interface ModuleInfo {
  templateId: string;
  label: string;
  status?: ModuleStatus;
  /** Categorie waaronder hij in de catalogus staat (Staal, Beton, ...). */
  categorie: string;
}

function verzamel(nodes: TreeNode[], categorie: string, uit: Record<string, ModuleInfo>) {
  for (const node of nodes) {
    if (node.kind === "item") {
      if (node.templateId && !uit[node.templateId]) {
        uit[node.templateId] = {
          templateId: node.templateId,
          label: node.label,
          status: node.status,
          categorie,
        };
      }
    } else {
      verzamel(node.children, node.kind === "category" ? node.label : categorie, uit);
    }
  }
}

/** Sjabloon-id naar label en status, voor de naamgeving van nieuwe exemplaren. */
export const modulesPerTemplate: Record<string, ModuleInfo> = (() => {
  const uit: Record<string, ModuleInfo> = {};
  verzamel(moduleCatalogus, "Algemeen", uit);
  verzamel(bibliotheek, "Bibliotheek", uit);
  return uit;
})();
