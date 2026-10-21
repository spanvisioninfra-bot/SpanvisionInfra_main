// One-time import adaptation. Subsequent identity changes use field.mjs.
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'), app=path.join(root,'spanvision-field-workspace');
const marker=path.join(app,'legal/IMPORT.json');
if(fs.existsSync(marker))throw Error('Archive already adapted; use brand:sync.');
function edit(file,transform){const target=path.join(root,file);fs.writeFileSync(target,transform(fs.readFileSync(target,'utf8').replaceAll('\r','')));}
function replace(source,before,after){if(!source.includes(before))throw Error('Missing expected anchor: '+before.slice(0,75));return source.replace(before,after);}
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{if(['node_modules','.git','legal','icons'].includes(entry.name))return [];const file=path.join(dir,entry.name);return entry.isDirectory()?walk(file):[file];});}
for(const file of walk(app))if(/\.(html|css|tsx?|js|json|rs|toml)$/.test(file)&&!file.endsWith('package-lock.json')&&!/pdf(\.worker)?\.min\.js$/.test(file)) {
 let text=fs.readFileSync(file,'utf8').replaceAll('\r','').replaceAll('Open Field Studio','Field Workspace').replaceAll('OpenFieldStudio','FieldWorkspace').replaceAll('__ofs','__fw');
 text=text.replaceAll('OpenAEC Design System','Spanvision interface').replaceAll('Based on OpenAEC Foundation Style Book v0.1','Adapted for Spanvision infra; attribution is in legal/UPSTREAM-NOTICES.md').replaceAll('OpenAEC Design Tokens','Spanvision presentation tokens').replaceAll('OpenAEC 3-tier system','three-tier shadows').replaceAll('OpenAEC system','component system').replaceAll("Inspired by Open PDF Studio's titlebar design","Custom desktop title bar; attribution is in legal/UPSTREAM-NOTICES.md");
 fs.writeFileSync(file,text);
}
edit('branding/brand.json',s=>{const b=JSON.parse(s);b.modules.push({id:'field',label:'Field Workspace',productName:'Field Workspace',mark:'FW',directory:'spanvision-field-workspace',dist:'dist',port:4245,path:'/',description:'Inspect sites, record defects on floor plans and prepare signed handover reports.'});return JSON.stringify(b,null,2)+'\n';});
edit('branding/sync.mjs',s=>replace(replace(s,"import { syncStl } from './stl.mjs';","import { syncStl } from './stl.mjs';\nimport { syncField } from './field.mjs';"),"for (const module of selectedModules) {","for (const module of selectedModules) {\n  if(module.id==='field') { syncField({root,brand,module,emit}); continue; }"));
edit('branding/icons.mjs',s=>replace(s," if(module.id==='speech') {"," if(module.id==='field') {\n   const fieldMaster=await sharp(fs.readFileSync(path.join(app,'public/fw-mark.svg'))).resize(1024).png().toBuffer();\n   const source=path.join(app,'public/icon_256.png'); await sharp(fieldMaster).resize(256).png().toFile(source);\n   execFileSync(process.execPath,[path.join(app,'node_modules/@tauri-apps/cli/tauri.js'),'icon',source,'--output',path.join(app,'src-tauri/icons')],{stdio:'pipe'});\n   const ico=await pngToIco(await sharp(fieldMaster).resize(256).png().toBuffer());\n   fs.writeFileSync(path.join(app,'public/favicon.ico'),ico); fs.writeFileSync(path.join(app,'public/icon.ico'),ico);\n   continue;\n }\n if(module.id==='speech') {"));
edit('branding/common.mjs',s=>replace(s,"  if(module.id==='speech') for","  if(module.id==='field') inputs.push(...files(path.join(base,'src-tauri/src')), ...files(path.join(base,'legal')), ...['package-lock.json','vite.config.ts','src-tauri/Cargo.toml','src-tauri/Cargo.lock','src-tauri/tauri.conf.json'].map(name=>path.join(base,name)));\n  if(module.id==='speech') for"));
edit('branding/build.mjs',s=>replace(s,"if(['geo','speech'].includes(module.id))","if(['geo','speech','field'].includes(module.id))"));
edit('suite-hub/src/main.jsx',s=>replace(replace(s,"<h3>{module.label}</h3>","<h3>{module.id==='field'&&<img class=\"field-card-mark\" src=\"/fw-mark.svg\" alt=\"FW\"/>}{module.label}</h3>"),"['Create a printable 3D map','stl']","['Create a printable 3D map','stl'],['Prepare a site inspection','field']"));
edit('suite-hub/src/hub.css',s=>s+'\n.field-card-mark{width:36px;height:36px;vertical-align:middle;margin-right:10px}.module-card[data-module="field"] h3{font-size:30px;letter-spacing:-1px}\n');
edit('spanvision-field-workspace/index.html',s=>{
 s=replace(s,'<meta charset="UTF-8">','<meta charset="UTF-8">\n    <script src="/theme-init.js"></script>');
 s=replace(s,'<link rel="stylesheet" href="/themes.css">','<link rel="stylesheet" href="/themes.css">\n    <link rel="stylesheet" href="/brand-palette.css">\n    <link rel="stylesheet" href="/field-ui.css">');
 s=s.replace('content="#2A2A32"','content="#000000"');
 s=s.replace(/(<div class="title-bar-icon">)\s*<svg[\s\S]*?<\/svg>/,'$1<img src="/fw-mark.svg" alt="FW">');
 s=s.replace(/(<div class="logo">)\s*<svg[\s\S]*?<\/svg>\s*<h1>Field Workspace<\/h1>/,'$1<img src="/fw-mark.svg" alt="FW"><div class="brand-name"><h1>Field Workspace</h1><small>Spanvision infra</small></div>');
 s=replace(s,"var savedTheme = localStorage.getItem('ofs_theme') || 'light';","var savedTheme = window.__fwAppearance.apply(document.documentElement.dataset.theme, false);");
 s=replace(s,"var current = document.documentElement.getAttribute('data-theme') || 'light';\n          var next = current === 'dark' ? 'light' : 'dark';\n          document.documentElement.setAttribute('data-theme', next);\n          localStorage.setItem('ofs_theme', next);","var next = window.__fwAppearance.next();");
 s=s.replace("theme === 'dark' ? 'block' : 'none'","theme !== 'light' ? 'block' : 'none'");
 return s;
});
edit('spanvision-field-workspace/src/main.tsx',s=>replace(s,"import i18next from './i18n';","import i18next from './i18n';\nimport brand from './brand.json';\n(window as any).__fwBrand = brand;"));
edit('spanvision-field-workspace/public/app.js',s=>replace(s,'        this.init();','        this.ready = this.init();'));
edit('spanvision-field-workspace/vite.config.ts',s=>s.replace('port: 3042','port: 4245').replace('host: true',"host: '127.0.0.1'"));
edit('spanvision-field-workspace/src-tauri/Cargo.toml',s=>s.replace('name = "open-field-studio"','name = "spanvision-field-workspace"').replace('version = "0.1.0"','version = "0.3.6"').replace('authors = ["OpenAEC Foundation"]','authors = ["Spanvision infra"]').replace('license = ""','license = "CC-BY-SA-4.0"'));
edit('spanvision-field-workspace/src-tauri/Cargo.lock',s=>s.replace('name = "open-field-studio"\nversion = "0.1.0"','name = "spanvision-field-workspace"\nversion = "0.3.6"'));
edit('spanvision-field-workspace/package-lock.json',s=>{const lock=JSON.parse(s);lock.name='@spanvision-infra/field-workspace';lock.packages[''].name=lock.name;lock.packages[''].license='CC-BY-SA-4.0';return JSON.stringify(lock,null,2)+'\n';});
edit('suite-hub/public/notices.md',s=>s+'\n## Field Workspace\n\nAdapted from Open Field Studio by OpenAEC Foundation (archive v0.3.6). Original work and Spanvision adaptations: CC BY-SA 4.0. Changes include branding, monochrome appearance, responsive layout fixes, packaging and profile migration. Source: https://github.com/OpenAEC-Foundation/Open-Field-Studio · License: https://creativecommons.org/licenses/by-sa/4.0/\n');
edit('package.json',s=>{const pkg=JSON.parse(s);Object.assign(pkg.scripts,{'preview:field':'node branding/preview-field.mjs','verify:field':'node qa/field/verify.mjs','build:field:windows':'node branding/native-field.mjs'});return JSON.stringify(pkg,null,2)+'\n';});
edit('.gitignore',s=>s+'\nspanvision-field-workspace/node_modules/\nspanvision-field-workspace/dist/\nspanvision-field-workspace/src-tauri/target/\nqa/field/*.log\n');
fs.writeFileSync(path.join(app,'src/updater.ts'),`// Field Workspace: upstream update checks are disabled.\ndeclare const __APP_VERSION__: string;\nexport type UpdateStatus = {available:boolean;currentVersion:string;latestVersion?:string;htmlUrl?:string};\nexport async function checkForUpdates(): Promise<UpdateStatus> { return {available:false,currentVersion:__APP_VERSION__}; }\nexport function renderUpdateBadge(_status:UpdateStatus,_tGet?:(key:string,...args:string[])=>string) { document.getElementById('title-bar-update-badge')?.remove(); }\n`);
fs.writeFileSync(marker,JSON.stringify({archive:'Open-Field-Studio.zip',sha256:'a612c978b38475f08deef6679a153bdaa5b657831c50429b9c7426b87cf6207b',version:'0.3.6',upstream:'https://github.com/OpenAEC-Foundation/Open-Field-Studio',license:'CC-BY-SA-4.0',modifiedBy:'Spanvision infra',changes:['Branding','Monochrome presentation','Responsive layout fixes','Windows packaging','Non-destructive native profile migration'],excluded:['.git','.github','upstream screenshots']},null,2)+'\n');
console.log('Field archive adapted and registered. Run brand:sync.');
