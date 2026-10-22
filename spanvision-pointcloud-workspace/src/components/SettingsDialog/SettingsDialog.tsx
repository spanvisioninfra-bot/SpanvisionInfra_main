import { useRef } from 'react';
import { useAppStore, UI_THEMES } from '../../state/appStore';
import { canvasColor } from '../../state/appearance';
import { useModal } from '../useModal';
import brand from '../../brand.json';
import './SettingsDialog.css';

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useModal(ref, onClose);
  const uiTheme = useAppStore(s => s.uiTheme);
  const setUITheme = useAppStore(s => s.setUITheme);
  const canvasBackground = useAppStore(s => s.canvasBackground);
  const setCanvasBackground = useAppStore(s => s.setCanvasBackground);
  return <dialog ref={ref} className="settings-dialog workspace-dialog" aria-labelledby="settings-title">
    <div className="settings-header"><h2 className="settings-title" id="settings-title">Settings</h2><button className="settings-close" aria-label="Close settings" onClick={onClose}>×</button></div>
    <div className="settings-body">
      <nav className="settings-sidebar" aria-label="Settings sections">
        <span className="settings-tab active">General</span>
      </nav>
      <div className="settings-content">
          <div className="settings-section"><h3 className="settings-section-title">Theme</h3><div className="settings-theme-table">
            {UI_THEMES.map(theme => <button key={theme.id} className={`settings-theme-row ${uiTheme === theme.id ? 'active' : ''}`} aria-pressed={uiTheme === theme.id} onClick={() => setUITheme(theme.id)}><span className={`ribbon-theme-swatch ${theme.id}`} /><span>{theme.label}</span>{uiTheme === theme.id && <span aria-hidden="true">✓</span>}</button>)}
          </div></div>
          <div className="settings-section"><h3 className="settings-section-title">Drawing canvas</h3><label className="canvas-color-control">Canvas color<input type="color" aria-label="Canvas color" value={canvasColor({uiTheme,canvasBackground})} onChange={event => setCanvasBackground(event.target.value)} /></label><button className="settings-footer-close" onClick={() => setCanvasBackground(null)}>Use theme canvas</button><p className="settings-help">Your theme and canvas choice are saved on this device.</p></div>
          <p className="settings-help">{brand.product}<br/>{brand.organization} · {brand.mark} · v{brand.version}</p>
      </div>
    </div>
    <div className="settings-footer"><button className="settings-footer-close" onClick={onClose}>Close</button></div>
  </dialog>;
}
