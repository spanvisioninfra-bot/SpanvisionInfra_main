
import { useI18n } from "../lib/i18n";
import brand from "../brand.json";

type View = "landing" | "suggestions" | "login" | "signup" | "account" | "home" | "settings" | "dictionary" | "models" | "mic-test" | "meeting" | "transcribe" | "tts";

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
  isRecording: boolean;
  isModelLoaded: boolean;
  modelName: string;
  onRecord: () => void;
}

export default function Sidebar(props: SidebarProps) {
  const { t } = useI18n();
  return (
    <aside class="sidebar" id="speech-sidebar" aria-label="Workspace navigation">
      <nav class="sidebar-nav"><a class="sidebar-brand" href="#landing"><img src="/sw-mark.svg" alt={brand.mark}/><span>{brand.product}<small>{brand.organization}</small></span></a><a class="sidebar-item" href="#suggestions" aria-label="Speech suggestions"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/></svg><span>Suggestions</span></a>
        <button
          class={`sidebar-item ${props.currentView === "home" ? "active" : ""}`} aria-label={t("sidebar.speech")}
          onClick={() => props.onViewChange("home")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
          </svg>
          <span>{t("sidebar.speech")}</span>
        </button>

        <button
          class={`sidebar-item ${props.currentView === "transcribe" ? "active" : ""}`} aria-label={t("sidebar.transcribe")}
          onClick={() => props.onViewChange("transcribe")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <span>{t("sidebar.transcribe")}</span>
        </button>

        <button
          class={`sidebar-item ${props.currentView === "meeting" ? "active" : ""}`} aria-label={t("sidebar.meeting")}
          onClick={() => props.onViewChange("meeting")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span>{t("sidebar.meeting")}</span>
        </button>

        <button
          class={`sidebar-item ${props.currentView === "mic-test" ? "active" : ""}`} aria-label={t("sidebar.micTest")}
          onClick={() => props.onViewChange("mic-test")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
          <span>{t("sidebar.micTest")}</span>
        </button>

        <button
          class={`sidebar-item ${props.currentView === "models" ? "active" : ""}`} aria-label={t("sidebar.models")}
          onClick={() => props.onViewChange("models")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          </svg>
          <span>{t("sidebar.models")}</span>
        </button>

        <button
          class={`sidebar-item ${props.currentView === "dictionary" ? "active" : ""}`} aria-label={t("sidebar.dictionary")}
          onClick={() => props.onViewChange("dictionary")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          <span>{t("sidebar.dictionary")}</span>
        </button>

        <button
          class={`sidebar-item ${props.currentView === "tts" ? "active" : ""}`} aria-label={t("sidebar.tts")}
          onClick={() => props.onViewChange("tts")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
          <span>{t("sidebar.tts")}</span>
        </button>

        <div class="sidebar-divider" />

        <button
          class={`sidebar-item ${props.currentView === "settings" ? "active" : ""}`} aria-label={t("sidebar.settings")}
          onClick={() => props.onViewChange("settings")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span>{t("sidebar.settings")}</span>
        </button>

      </nav>

    </aside>
  );
}
