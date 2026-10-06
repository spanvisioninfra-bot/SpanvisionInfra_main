import i18next from "i18next";
import { initReactI18next } from "react-i18next";
// English
import enCommon from "./locales/en/common.json";
import enRibbon from "./locales/en/ribbon.json";
import enBackstage from "./locales/en/backstage.json";
import enSettings from "./locales/en/settings.json";
import enFeedback from "./locales/en/feedback.json";
import enCheck from "./locales/en/check.json";

// Spanvision Infra uses English independently of browser or saved language.
export const LANGUAGES = [{ code: "en", name: "English" }];
i18next.use(initReactI18next).init({
  lng: "en", supportedLngs: ["en"], fallbackLng: "en",
  resources: { en: { common: enCommon, ribbon: enRibbon, backstage: enBackstage, settings: enSettings, feedback: enFeedback, check: enCheck } },
  ns: ["common", "ribbon", "backstage", "settings", "feedback", "check"],
  defaultNS: "common", interpolation: { escapeValue: false },
});
document.documentElement.setAttribute("lang", "en");
export function changeLanguage(_lang: string) { return i18next.changeLanguage("en"); }
export default i18next;
