import { loadSettings } from "./lib/settings.js";
import { initWasm } from "./lib/tauri.js";

// Load settings, init WASM (web mode), then i18n, then mount
async function boot() {
  await loadSettings();
  await initWasm();
  await import("./lib/i18n.js");
  const { mount } = await import("svelte");
  const App = (await import("./App.svelte")).default;
  mount(App, { target: document.getElementById("app") });
}

boot().catch(error => {
  console.error('Frame Studio startup failed:', error);
  const panel = document.createElement('section'); panel.setAttribute('role', 'alert');
  Object.assign(panel.style, { margin: '10vh auto', maxWidth: '560px', padding: '28px', fontFamily: 'sans-serif', color: 'var(--text-primary, #e5e7eb)', background: 'var(--bg-surface, #18212e)', borderRadius: '12px' });
  const heading = document.createElement('h1'); heading.textContent = 'Frame Studio could not start';
  const message = document.createElement('p'); message.textContent = 'Reload the page to retry. Your saved project files have not been changed.';
  const retry = document.createElement('button'); retry.textContent = 'Reload Frame Studio'; retry.onclick = () => location.reload();
  panel.append(heading, message, retry); document.getElementById('app').replaceChildren(panel);
});

// Spanvision appearance bridge
window.addEventListener('spanvision:mode-change',async()=>{const {setTheme}=await import('./stores/ui.js');setTheme(document.documentElement.dataset.svMode === 'light' ? 'light' : 'spanvision-mono');});
