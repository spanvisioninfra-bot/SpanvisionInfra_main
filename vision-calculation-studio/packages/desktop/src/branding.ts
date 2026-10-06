/** Product identity shared by the browser and native workspace. */
export const ORGANIZATION_NAME = "Spanvision Infra";
export const APP_NAME = "Vision Calculation Studio";
export const APP_VERSION = "0.1.5";
export const DEFAULT_THEME = "spanvision-mono";
// Keep the existing document extension for interoperability.
export const APP_FILE_EXT = "ifc-calc";
export const IS_DESKTOP = typeof window !== "undefined" && Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
