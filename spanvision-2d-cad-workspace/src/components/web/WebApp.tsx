import { lazy, Suspense, useEffect, useState } from 'react';
import { ArrowUpRight, FilePlus2, FolderOpen, History, Check, X, Loader2, Trash2 } from 'lucide-react';
import { useFileOperations } from '../../hooks/file/useFileOperations';
import { useAppStore } from '../../state/appStore';
import { useReviewStore } from '../../state/reviewStore';
import { BRAND } from '../../config/brand';
import { isMobileViewer } from '../../utils/platform';
import { deleteDraft, extractDraft, listDrafts, migrateLegacyDraft, writeDraft, type BrowserDraft } from '../../services/web/draftStorage';
import { restoreBrowserDraft, startBrowserSession } from '../../services/web/browserSession';
import { notifyWeb, requestWebDialog } from '../../services/web/dialogService';
import { WebDialogHost } from './WebDialogHost';
import '../../styles/web.css';

const mobile = isMobileViewer();
const Editor = lazy(() => mobile ? import('../tablet/TabletApp') : import('../../App'));

export default function WebApp() {
  const [directLaunch, setDirectLaunch] = useState(() => new URL(location.href).searchParams.get('launch') === 'workspace');
  const [started, setStarted] = useState(false);
  const [drafts, setDrafts] = useState<BrowserDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Drafts stay on this device');
  const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null);
  const { handleOpen, handleNew } = useFileOperations();

  useEffect(() => {
    const onStart = async () => {
      const state = useAppStore.getState();
      try {
        await writeDraft(extractDraft(state, useReviewStore.getState().byDocument[state.activeDocumentId]));
        setDrafts(await listDrafts());
      } catch { notifyWeb('Could not save the recovery draft. Download your project to keep a copy.', true); }
      setDirectLaunch(false);
      setStarted(false);
    };
    window.addEventListener('spanvision-start', onStart);
    return () => window.removeEventListener('spanvision-start', onStart);
  }, []);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        await migrateLegacyDraft();
        const stored = await listDrafts();
        if (live) {
          setDrafts(stored);
          if (directLaunch && stored[0]) restoreBrowserDraft(stored[0]);
        }
      } catch { notifyWeb('Draft recovery is unavailable in this browser. You can still open and download local files.', true); }
      finally {
        if (live) {
          setLoading(false);
          if (directLaunch) setStarted(true);
        }
      }
    };
    void load();
    return () => { live = false; };
  }, [directLaunch]);
  useEffect(() => {
    if (!started) return;
    return startBrowserSession();
  }, [started]);
  useEffect(() => {
    const onNotice = (event: Event) => setNotice((event as CustomEvent).detail);
    const onStatus = (event: Event) => setStatus((event as CustomEvent).detail);
    window.addEventListener('spanvision-notice', onNotice);
    window.addEventListener('spanvision-draft-status', onStatus);
    return () => {
      window.removeEventListener('spanvision-notice', onNotice);
      window.removeEventListener('spanvision-draft-status', onStatus);
    };
  }, []);
  useEffect(() => {
    if (!notice || notice.error) return;
    const timeout = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timeout);
  }, [notice]);

  const openFile = async () => {
    setBusy(true);
    try { if (await handleOpen()) {
      setStarted(true);
      if (mobile) setTimeout(() => useAppStore.getState().zoomToFit(), 120);
    } }
    finally { setBusy(false); }
  };
  const restore = (draft: BrowserDraft) => { restoreBrowserDraft(draft); setStarted(true); };
  const discard = async (draft: BrowserDraft) => {
    const result = await requestWebDialog({ title: 'Delete browser draft?', message: `“${draft.name}” will be removed from this browser. Downloaded files are unaffected.`, actions: [{ value: 'cancel', label: 'Cancel' }, { value: 'delete', label: 'Delete draft', primary: true }] });
    if (result?.action !== 'delete') return;
    try { await deleteDraft(draft.id); setDrafts(await listDrafts()); }
    catch { notifyWeb('The draft could not be deleted. Try again.', true); }
  };

  return <>
    <div className="web-editor" inert={!started} aria-hidden={!started}>
      <Suspense fallback={<div className="web-loading"><Loader2 className="animate-spin" size={24} /><span>Opening workspace…</span></div>}><Editor /></Suspense>
    </div>
    {!started && directLaunch && <div className="web-loading" role="status"><Loader2 className="animate-spin" size={24} /><span>Opening workspace…</span></div>}
    {!started && !directLaunch && <div className="web-start-overlay" data-web-modal>
      <section className="web-start" aria-label="Start a CAD project">
        <header className="web-start-brand"><img src="/logo.svg" alt={BRAND.mark} /><span>{BRAND.organization}</span><span className="web-edition">WEB WORKSPACE</span></header>
        <div className="web-start-intro"><span className="web-eyebrow">DRAW · REFINE · BUILD</span><h1>{BRAND.product}</h1><p>A precise space for your next idea.<br />Create a drawing, open a file, or pick up where you left off.</p></div>
        <div className={`web-start-actions ${mobile ? 'mobile' : ''}`}>
          {!mobile && <button className="web-start-action featured" disabled={busy || loading} onClick={() => {
            const state = useAppStore.getState();
            if (state.shapes.length || state.isModified || state.currentFilePath) void handleNew();
            setStarted(true);
          }}>
            <FilePlus2 size={25} /><ArrowUpRight className="web-action-arrow" size={18} /><strong>New drawing</strong><span>Start with a blank canvas</span>
          </button>}
          <button className="web-start-action" disabled={busy} onClick={() => { void openFile(); }}>
            {busy ? <Loader2 className="animate-spin" size={25} /> : <FolderOpen size={25} />}<ArrowUpRight className="web-action-arrow" size={18} /><strong>{busy ? 'Opening…' : 'Open file'}</strong><span>.o2d projects or DXF drawings</span>
          </button>
          {drafts[0] && <button className="web-start-action" disabled={busy} onClick={() => restore(drafts[0])}>
            <History size={25} /><ArrowUpRight className="web-action-arrow" size={18} /><strong>Restore draft</strong><span className="truncate">{drafts[0].name}</span>
          </button>}
        </div>
        {loading && <p className="web-start-loading">Checking for browser drafts…</p>}
        {drafts.length > 0 && <div className="web-draft-list"><span className="web-eyebrow">ON THIS DEVICE</span>{drafts.slice(0, 5).map(draft => <div key={draft.id} className="web-draft-row">
          <button onClick={() => restore(draft)} disabled={busy}><span>{draft.name}</span><small>{new Date(draft.savedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</small></button>
          <button aria-label={`Delete draft ${draft.name}`} title="Delete draft" onClick={() => { void discard(draft); }}><Trash2 size={14} /></button>
        </div>)}</div>}
        <footer className="web-start-footer"><span><span className="web-status-dot" />Files stay with you</span><span>{mobile ? 'Inspect · Measure · Mark up' : 'Local files · Browser drafts'}</span></footer>
      </section>
      <span className="web-start-caption">{BRAND.organization} / PRECISION IN EVERY LINE</span>
    </div>}
    {started && !mobile && <div className="web-draft-status" title="Browser drafts are recovery copies. Save or download .o2d to keep a file."><Check size={11} />{status}</div>}
    {notice && <div role={notice.error ? 'alert' : 'status'} className={`web-notice ${notice.error ? 'error' : ''}`}><span>{notice.message}</span><button aria-label="Dismiss notification" onClick={() => setNotice(null)}><X size={16} /></button></div>}
    <WebDialogHost />
  </>;
}
