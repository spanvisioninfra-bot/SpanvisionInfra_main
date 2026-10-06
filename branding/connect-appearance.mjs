import fs from 'node:fs';
function append(file,code){let text=fs.readFileSync(file,'utf8');if(!text.includes('// Spanvision appearance bridge'))fs.writeFileSync(file,text+'\n// Spanvision appearance bridge\n'+code+'\n');}
const theme="document.documentElement.dataset.svMode === 'light' ? 'light' : 'spanvision-mono'";
append('spanvision-2d-cad-workspace/src/main.tsx',`import { useAppStore } from './state/appStore';\nconst applyColorMode=()=>useAppStore.getState().setUITheme(${theme});\nwindow.addEventListener('spanvision:mode-change',applyColorMode);\napplyColorMode();`);
append('spanvision-pointcloud-workspace/src/main.tsx',`const applyColorMode=()=>useAppStore.getState().setUITheme(${theme});\nwindow.addEventListener('spanvision:mode-change',applyColorMode);\napplyColorMode();`);
append('open-vision-studio/src/main.tsx',`import { useAppStore } from '@/state/appStore';\nconst applyColorMode=()=>useAppStore.getState().setUI({uiTheme:${theme}});\nwindow.addEventListener('spanvision:mode-change',applyColorMode);`);
append('fem-vision-studio/src/main.tsx',`import { setTheme as setColorMode } from './lib/theme';\nwindow.addEventListener('spanvision:mode-change',()=>setColorMode(${theme}));`);
append('frame-vision-studio/ui/src/main.js',`window.addEventListener('spanvision:mode-change',async()=>{const {setTheme}=await import('./stores/ui.js');setTheme(${theme});});`);
append('ifc-view/apps/desktop/src/index.tsx',`import {setTheme} from '@/state/appearance-store';\nwindow.addEventListener('spanvision:mode-change',()=>setTheme(${theme}));`);
append('spanvision-pdf-workspace/open-pdf-studio/js/core/preferences.js',`window.addEventListener('spanvision:mode-change',()=>{const theme=${theme};state.preferences.theme=theme;applyTheme(theme);savePreferences();});`);
append('spanvision-field-workspace/public/theme-init.js',`window.addEventListener('spanvision:mode-change',()=>window.__fwAppearance.apply(${theme},true));`);
append('spanvision-stl-3d-map-workspace/web/app.js',`window.addEventListener('spanvision:mode-change',()=>applyTheme(${theme}));`);
console.log('Connected the quick appearance switch to native editor theme state.');
