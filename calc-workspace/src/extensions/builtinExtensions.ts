import { BRAND } from '../config/brand';
/**
 * Built-in extensions that ship with Spanvision Infra · Calc.
 * These wrap existing importers as extensions so they appear
 * in the Extension Manager and can be enabled/disabled.
 */
import type { InstalledExtension, ExtensionManifest } from './types';
import { useAppStore } from '../state/appStore';
import { importBasCalcFile } from '../services/importers/bascalcImporter';
import { importRsx } from '../services/importers/rsxImporter';
// WpCalc importer is lazy-loaded because mdb-reader needs Buffer polyfill
// import { importWpCalcFile } from '../services/importers/wpcalcImporter';
import { recalculateItems } from '../services/calculation/calculator';


const bc3Manifest: ExtensionManifest = {
  id: 'builtin-bc3-importer',
  name: 'FIEBDC-3 Importer',
  version: '1.0.0',
  minAppVersion: __APP_VERSION__,
  author: BRAND.organization,
  description: "Import Spanish FIEBDC-3 budgets and price books (.bc3), including chapters, measurements, labor, equipment and materials.",
  category: 'Import/Export',
  main: 'builtin',
  permissions: ['commands', 'events'],
  tags: ['bc3', 'fiebdc', 'spanje', 'import'],
  icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>',
};

const onlvManifest: ExtensionManifest = {
  id: 'builtin-onlv-importer',
  name: 'ÖNORM A 2063 Importer',
  version: '1.0.0',
  minAppVersion: __APP_VERSION__,
  author: BRAND.organization,
  description: "Import Austrian ÖNORM A 2063 bills of quantities (.onlv), including groups, items, quantities and labor/other prices, and standard-text catalogs (.onlb).",
  category: 'Import/Export',
  main: 'builtin',
  permissions: ['commands', 'events'],
  tags: ['onlv', 'onlb', 'önorm', 'a2063', 'oostenrijk', 'import'],
  icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M8 12h8M8 15h8M8 18h5"/></svg>',
};

// ── BasCalc Importer ──

const bascalcManifest: ExtensionManifest = {
  id: 'builtin-bascalc-importer',
  name: 'BasCalc Importer',
  version: '1.0.0',
  minAppVersion: __APP_VERSION__,
  author: BRAND.organization,
  description: "Import estimates from BasCalc/BasData Excel files (.xls, .xlsx), including direct costs, overheads and company details.",
  category: 'Import/Export',
  main: 'builtin',
  permissions: ['commands', 'events'],
  tags: ['bascalc', 'basdata', 'excel', 'xls', 'import'],
  icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h3M8 17h3M13 13h3M13 17h3"/></svg>',
};

const wpcalcManifest: ExtensionManifest = {
  id: 'builtin-wpcalc-importer',
  name: 'WpCalc Importer',
  version: '1.0.0',
  minAppVersion: __APP_VERSION__,
  author: BRAND.organization,
  description: "Import estimates from WpCalc (.calc) files, reading chapters, items, overheads and rate groups from the Access database.",
  category: 'Import/Export',
  main: 'builtin',
  permissions: ['commands', 'events'],
  tags: ['wpcalc', 'calc', 'access', 'mdb', 'import', 'bouw'],
  icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>',
};

const inschrijfstaatManifest: ExtensionManifest = {
  id: 'builtin-inschrijfstaat-importer',
  name: 'Inschrijfstaat Importer',
  version: '1.0.0',
  minAppVersion: __APP_VERSION__,
  author: BRAND.organization,
  description: "Import RAW tender schedules from Excel files (.xls, .xlsx), including specification items, quantities and prices.",
  category: 'Import/Export',
  main: 'builtin',
  permissions: ['commands', 'events'],
  tags: ['inschrijfstaat', 'raw', 'excel', 'xls', 'import'],
  icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>',
};

const wpcalcExporterManifest: ExtensionManifest = {
  id: 'builtin-wpcalc-exporter',
  name: 'WpCalc Exporter',
  version: '1.0.0',
  minAppVersion: __APP_VERSION__,
  author: BRAND.organization,
  description: "Export estimates to WpCalc (.calc) Access files, including chapters, items, overheads and rate groups.",
  category: 'Import/Export',
  main: 'builtin',
  permissions: ['commands', 'events', 'filesystem'],
  tags: ['wpcalc', 'calc', 'access', 'mdb', 'export', 'bouw'],
  icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><polyline points="17 8 12 3 7 8" stroke="currentColor" stroke-width="1.5"/></svg>',
};

const xtbManifest: ExtensionManifest = {
  id: 'builtin-xtb-importer',
  name: 'IBIS-TRAD Importer',
  version: '1.0.0',
  minAppVersion: __APP_VERSION__,
  author: BRAND.organization,
  description: "Import estimates from IBIS-TRAD (.xtb) SQLite files, including chapters, items, costs, labor, materials, equipment, subcontracting and hourly-rate codes.",
  category: 'Import/Export',
  main: 'builtin',
  permissions: ['commands', 'events'],
  tags: ['ibis', 'ibis-trad', 'xtb', 'sqlite', 'import', 'bouw'],
  icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><ellipse cx="12" cy="14" rx="4" ry="2"/><path d="M8 14v3a4 2 0 008 0v-3"/></svg>',
};

const dncManifest: ExtensionManifest = {
  id: 'builtin-dnc-importer',
  name: 'DNC Importer',
  version: '1.0.0',
  minAppVersion: __APP_VERSION__,
  author: BRAND.organization,
  description: "Import STABU estimates from .dnc files (7z archives containing dBASE tables), including chapters, items, labor, materials, subcontracting, hourly rates, overhead percentages and benchmarks.",
  category: 'Import/Export',
  main: 'builtin',
  permissions: ['commands', 'events'],
  tags: ['dnc', 'stabu', 'directiebegroting', 'dbase', '7z', 'import', 'bouw'],
  icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>',
};

const rsxManifest: ExtensionManifest = {
  id: 'builtin-rsx-importer',
  name: 'RAW Bestek Importer',
  version: '1.0.0',
  minAppVersion: __APP_VERSION__,
  author: BRAND.organization,
  description: `Import RAW specifications from .rsx files. Convert specification items, chapters and quantities to ${BRAND.product} formaat.`,
  category: 'Import/Export',
  main: 'builtin',
  permissions: ['commands', 'events'],
  tags: ['raw', 'bestek', 'rsx', 'import', 'gww'],
  icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M9 15l2 2 4-4"/></svg>',
};

/**
 * Register built-in extensions on first startup.
 * Unlike user extensions (stored in IndexedDB), these are always available
 * and are registered directly in the Zustand store.
 */
export function registerBuiltinExtensions(): void {
  const store = useAppStore.getState();

  // BasCalc Importer
  const bascalcExt: InstalledExtension = {
    id: 'builtin-bascalc-importer',
    manifest: bascalcManifest,
    status: 'enabled',
  };
  store.registerExtension(bascalcExt);
  store.addExtensionImporter({
    extensionId: 'builtin-bascalc-importer',
    id: 'bascalc-import',
    name: 'BasCalc / BasData (.xls)',
    description: "Import estimates from BasCalc/BasData Excel files",
    fileExtensions: ['.xls', '.xlsx'],
    icon: bascalcManifest.icon,
    handler: async (file: File) => {
      const buffer = await file.arrayBuffer();
      const result = importBasCalcFile(buffer);
      return {
        schedule: result.schedule,
        items: recalculateItems(result.items),
        companyInfo: result.companyInfo,
      };
    },
  });

  // WpCalc Importer
  const wpcalcExt: InstalledExtension = {
    id: 'builtin-wpcalc-importer',
    manifest: wpcalcManifest,
    status: 'enabled',
  };
  store.registerExtension(wpcalcExt);
  store.addExtensionImporter({
    extensionId: 'builtin-wpcalc-importer',
    id: 'wpcalc-import',
    name: 'WpCalc (.calc)',
    description: "Import estimates from WpCalc Access files",
    fileExtensions: ['.calc', '.mdb'],
    icon: wpcalcManifest.icon,
    handler: async (file: File) => {
      const { importWpCalcFile } = await import('../services/importers/wpcalcImporter');
      const buffer = await file.arrayBuffer();
      const result = importWpCalcFile(buffer);
      return {
        schedule: result.schedule,
        items: recalculateItems(result.items),
        companyInfo: result.companyInfo,
      };
    },
  });

  // RSX Importer
  const rsxExt: InstalledExtension = {
    id: 'builtin-rsx-importer',
    manifest: rsxManifest,
    status: 'enabled',
  };
  store.registerExtension(rsxExt);
  store.addExtensionImporter({
    extensionId: 'builtin-rsx-importer',
    id: 'rsx-import',
    name: 'RAW Bestek (.rsx)',
    description: "Import RAW specifications from .rsx files",
    fileExtensions: ['.rsx'],
    icon: rsxManifest.icon,
    handler: async (file: File) => {
      const text = await file.text();
      const result = importRsx(text);
      return {
        schedule: result.schedule,
        items: recalculateItems(result.items),
        companyInfo: result.companyInfo,
        warnings: result.warnings,
        format: result.format,
      };
    },
  });

  // Inschrijfstaat Importer
  const inschrijfstaatExt: InstalledExtension = {
    id: 'builtin-inschrijfstaat-importer',
    manifest: inschrijfstaatManifest,
    status: 'enabled',
  };
  store.registerExtension(inschrijfstaatExt);
  store.addExtensionImporter({
    extensionId: 'builtin-inschrijfstaat-importer',
    id: 'inschrijfstaat-import',
    name: 'Inschrijfstaat (.xls)',
    description: "Import tender schedules from RAW Excel files",
    fileExtensions: ['.xls', '.xlsx'],
    icon: inschrijfstaatManifest.icon,
    handler: async (file: File) => {
      const { importInschrijfstaatFile } = await import('../services/importers/inschrijfstaatImporter');
      const buffer = await file.arrayBuffer();
      const result = await importInschrijfstaatFile(buffer);
      return {
        schedule: result.schedule,
        items: recalculateItems(result.items),
        companyInfo: result.companyInfo,
      };
    },
  });

  // WpCalc Exporter (informational registration — export is handled in Backstage)
  const wpcalcExporterExt: InstalledExtension = {
    id: 'builtin-wpcalc-exporter',
    manifest: wpcalcExporterManifest,
    status: 'enabled',
  };
  store.registerExtension(wpcalcExporterExt);

  // DNC (STABU-directiebegroting) Importer
  const dncExt: InstalledExtension = {
    id: 'builtin-dnc-importer',
    manifest: dncManifest,
    status: 'enabled',
  };
  store.registerExtension(dncExt);
  store.addExtensionImporter({
    extensionId: 'builtin-dnc-importer',
    id: 'dnc-import',
    name: 'STABU-directiebegroting (.dnc)',
    description: "Import STABU estimates from .dnc files",
    fileExtensions: ['.dnc'],
    icon: dncManifest.icon,
    handler: async (file: File) => {
      const { importDncFile } = await import('../services/importers/dncImporter');
      const buffer = await file.arrayBuffer();
      const result = await importDncFile(buffer, file.name);
      // Een .dnc is een STABU-directiebegroting → toon meteen het bijpassende
      // directiebegroting-rapport in plaats van het standaard (Bouw 1) rapport.
      useAppStore.getState().setReportView('directie');
      return {
        schedule: result.schedule,
        items: recalculateItems(result.items, result.schedule.tarieven),
        warnings: result.warnings,
      };
    },
  });

  // IBIS-TRAD .xtb Importer
  const xtbExt: InstalledExtension = {
    id: 'builtin-xtb-importer',
    manifest: xtbManifest,
    status: 'enabled',
  };
  store.registerExtension(xtbExt);
  store.addExtensionImporter({
    extensionId: 'builtin-xtb-importer',
    id: 'xtb-import',
    name: 'IBIS-TRAD (.xtb)',
    description: "Import IBIS-TRAD estimates from .xtb SQLite files",
    fileExtensions: ['.xtb'],
    icon: xtbManifest.icon,
    handler: async (file: File) => {
      const { importXtbFile } = await import('../services/importers/xtbImporter');
      const buffer = await file.arrayBuffer();
      const result = await importXtbFile(buffer);
      return {
        schedule: result.schedule,
        items: recalculateItems(result.items),
        warnings: result.warnings,
      };
    },
  });

  // FIEBDC-3 (.bc3) Importer
  const bc3Ext: InstalledExtension = {
    id: 'builtin-bc3-importer',
    manifest: bc3Manifest,
    status: 'enabled',
  };
  store.registerExtension(bc3Ext);
  store.addExtensionImporter({
    extensionId: 'builtin-bc3-importer',
    id: 'bc3-import',
    name: 'FIEBDC-3 (.bc3)',
    description: 'Importeer Spaanse FIEBDC-3-begrotingen (.bc3)',
    fileExtensions: ['.bc3'],
    icon: bc3Manifest.icon,
    handler: async (file: File) => {
      const { importBc3File } = await import('../services/importers/bc3Importer');
      const buffer = await file.arrayBuffer();
      const result = importBc3File(buffer);
      return {
        schedule: result.schedule,
        items: recalculateItems(result.items),
        // Meldingen (o.a. "geen prijzen") + vertaalbare codes naar de UI.
        warnings: result.warnings,
        warningCodes: result.warningCodes,
        format: result.format,
      };
    },
  });

  // ÖNORM A 2063 (.onlv / .onlb) Importer
  const onlvExt: InstalledExtension = {
    id: 'builtin-onlv-importer',
    manifest: onlvManifest,
    status: 'enabled',
  };
  store.registerExtension(onlvExt);
  store.addExtensionImporter({
    extensionId: 'builtin-onlv-importer',
    id: 'onlv-import',
    name: 'ÖNORM A 2063 (.onlv, .onlb)',
    description: 'Importeer Oostenrijkse Leistungsverzeichnisse (.onlv) en Leistungsbücher (.onlb)',
    fileExtensions: ['.onlv', '.onlb'],
    icon: onlvManifest.icon,
    handler: async (file: File) => {
      const { importOnlvFile } = await import('../services/importers/onlvImporter');
      // Als bytes lezen: UTF-8 met of zonder BOM (en UTF-16 met BOM).
      const result = importOnlvFile(await file.arrayBuffer());
      return {
        schedule: result.schedule,
        items: recalculateItems(result.items),
        warnings: result.warnings,
        warningCodes: result.warningCodes,
        format: result.format,
      };
    },
  });
}
