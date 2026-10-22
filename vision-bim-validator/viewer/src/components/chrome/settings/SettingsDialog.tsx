import { useState, useEffect, useRef, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { LANGUAGES, changeLanguage } from "../../../i18n/config";
import { getSetting, setSetting, applyTheme, getCanvasColor } from "../../../utils/settingsStore";
import Modal from "../Modal";

import ThemedSelect from "../ThemedSelect";
import "../ThemedSelect.css";
import "./SettingsDialog.css";

const THEME_OPTIONS = [
  { value: "spanvision-mono", labelKey: "appearance.mono", swatches: ["#000000", "#121212", "#1B1B1B", "#FFFFFF"] },
  { value: "light", labelKey: "appearance.light", swatches: ["#F5F6F8", "#FFFFFF", "#EEF1F5", "#17202B"] },
];

const TAB_IDS = ["general", "appearance"] as const;

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  theme: string;
  onThemeChange: (theme: string) => void;
}

export default function SettingsDialog({
  open,
  onClose,
  theme,
  onThemeChange,
}: SettingsDialogProps) {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const [activeTab, setActiveTab] = useState("general");

  const [draftTheme, setDraftTheme] = useState(theme);
  const [draftLang, setDraftLang] = useState("auto");
  const [draftCanvas, setDraftCanvas] = useState(getCanvasColor);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const originalTheme = useRef(theme);
  const originalLang = useRef("");

  useEffect(() => {
    if (open) {
      originalTheme.current = theme;
      setDraftTheme(theme);
      setDraftCanvas(getCanvasColor());
      const lang = getSetting("language", "auto");
      originalLang.current = lang;
      setDraftLang(lang);
    }
  }, [open, theme]);

  const handleCancel = () => {
    setDraftTheme(originalTheme.current);
    setDraftLang(originalLang.current);
    onClose();
  };

  const handleSave = () => {
    onThemeChange(draftTheme);
    applyTheme(draftTheme);
    setSetting("theme", draftTheme);
    setSetting("canvasColor", draftCanvas);
    window.dispatchEvent(new CustomEvent('canvas-color-change', { detail: draftCanvas }));
    setSetting("language", draftLang);
    changeLanguage(draftLang);
    onClose();
  };

  const handleReset = () => {
    setConfirmResetOpen(true);
  };

  const handleConfirmReset = () => {
    setDraftTheme("spanvision-mono");
    setDraftCanvas('#1B1B1B');
    setDraftLang("auto");
    setConfirmResetOpen(false);
  };

  const footer = (
    <>
      <button className="settings-btn settings-btn-secondary" onClick={handleReset}>
        {t("resetToDefaults")}
      </button>
      <div className="settings-footer-right">
        <button className="settings-btn settings-btn-secondary" onClick={handleCancel}>
          {tCommon("cancel")}
        </button>
        <button className="settings-btn settings-btn-primary" onClick={handleSave}>
          {tCommon("save")}
        </button>
      </div>
    </>
  );

  return (
    <>
      <Modal open={open} onClose={handleCancel} title={t("title")} width={560} height={440} className="settings-dialog" footer={footer}>
        <div className="settings-body">
          <div className="settings-sidebar">
            {TAB_IDS.map((id) => (
              <button
                key={id}
                className={`settings-tab${activeTab === id ? " active" : ""}`}
                onClick={() => setActiveTab(id)}
              >
                {t(`tabs.${id}`)}
              </button>
            ))}
          </div>

          <div className="settings-content">
            {activeTab === "general" && (
              <GeneralTabContent lang={draftLang} onLangChange={setDraftLang} />
            )}
            {activeTab === "appearance" && (
              <><AppearanceTabContent theme={draftTheme} onThemeSelect={setDraftTheme} />
                <div className="settings-section">
                  <label className="settings-row" htmlFor="canvas-color"><span>Canvas background</span>
                    <input id="canvas-color" type="color" aria-label="Canvas background" value={draftCanvas} onInput={e => setDraftCanvas(e.currentTarget.value)} onChange={e => setDraftCanvas(e.target.value)} />
                    <span>{draftCanvas.toUpperCase()}</span>
                  </label>
                  <p className="settings-hint">Your model materials and validation highlights keep their original colors.</p>
                </div></>
            )}

          </div>
        </div>
      </Modal>

      <Modal
        open={confirmResetOpen}
        onClose={() => setConfirmResetOpen(false)}
        title={t("resetToDefaults")}
        width={340}
        footer={
          <>
            <button className="settings-btn settings-btn-secondary" onClick={() => setConfirmResetOpen(false)}>
              {tCommon("cancel")}
            </button>
            <button className="settings-btn settings-btn-primary" onClick={handleConfirmReset}>
              {t("resetToDefaults")}
            </button>
          </>
        }
      >
        <div style={{ padding: 12, fontSize: 12 }}>{t("resetConfirm")}</div>
      </Modal>
    </>
  );
}

function GeneralTabContent({
  lang,
  onLangChange,
}: {
  lang: string;
  onLangChange: (value: string) => void;
}) {
  const { t } = useTranslation("settings");

  return (
    <div className="settings-section">
      <h3>{t("general.application")}</h3>
      <div className="settings-row">
        <span className="settings-label">{t("general.language")}</span>
        <ThemedSelect
          value={lang}
          options={LANGUAGES.map((l) => ({ value: l.code, label: l.name }))}
          onChange={onLangChange}
          style={{ width: 180 }}
        />
      </div>
    </div>
  );
}

function AppearanceTabContent({
  theme,
  onThemeSelect,
}: {
  theme: string;
  onThemeSelect: (value: string) => void;
}) {
  const { t } = useTranslation("settings");
  return (
    <div className="settings-section">
      <h3>{t("appearance.theme")}</h3>
      <ThemeDropdown theme={theme} onThemeSelect={onThemeSelect} />
    </div>
  );
}

function ThemeDropdown({
  theme,
  onThemeSelect,
}: {
  theme: string;
  onThemeSelect: (value: string) => void;
}) {
  const { t } = useTranslation("settings");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const selected = THEME_OPTIONS.find((o) => o.value === theme) ?? THEME_OPTIONS[0]!;

  const swatchRow = (swatches: string[]) => (
    <div className="theme-dropdown-swatches">
      {swatches.map((color, i) => (
        <span key={i} className="theme-dropdown-swatch" style={{ backgroundColor: color } as CSSProperties} />
      ))}
    </div>
  );

  return (
    <div className="theme-dropdown" ref={ref}>
      <button className="theme-dropdown-trigger" onClick={() => setOpen(!open)}>
        {swatchRow(selected.swatches)}
        <span className="theme-dropdown-label">{t(selected.labelKey)}</span>
        <svg className="theme-dropdown-chevron" width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2.5 4L5 6.5L7.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="theme-dropdown-menu">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`theme-dropdown-item${theme === opt.value ? " active" : ""}`}
              onClick={() => { onThemeSelect(opt.value); setOpen(false); }}
            >
              {swatchRow(opt.swatches)}
              <span className="theme-dropdown-label">{t(opt.labelKey)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
