import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { studioInputs } from './studios.mjs';
export const root = path.resolve(import.meta.dirname, '..');
export const brand = JSON.parse(fs.readFileSync(path.join(root, 'branding/brand.json'), 'utf8'));
export const displayName = module => module.productName || `${brand.suiteName} · ${module.label}`;
export const appDirectory = module => path.join(root, module.directory, module.frontendDirectory || (module.id === 'ifc' ? 'apps/desktop' : ''));
export const digest = module => createHash('sha256').update(JSON.stringify(!module || module.id==='hub' ? brand : {
  organization:module.organization||brand.organization,product:displayName(module),mark:module.mark||brand.mark,
  language:brand.language,theme:brand.theme,services:brand.services,palette:brand.palette,module
})).digest('hex');
export function write(file, content) {
  const absolute = path.join(root, file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  if (!fs.existsSync(absolute) || fs.readFileSync(absolute, 'utf8') !== content) {
    const temporary = path.join(path.dirname(absolute), `.${path.basename(absolute)}.${randomUUID()}.tmp`);
    try {
      fs.writeFileSync(temporary, content, { flag: 'wx' });
      fs.renameSync(temporary, absolute);
    } finally { fs.rmSync(temporary, { force: true }); }
  }
}
export function files(directory) {
  const absolute = path.resolve(root, directory);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap(entry => {
    if (['node_modules','target','dist','dist-preview','.git','gen','qa','artifacts','source-provenance','legal','upstream-build'].includes(entry.name)) return [];
    const file = path.join(absolute, entry.name);
    return entry.isDirectory() ? files(file) : [file];
  });
}
export function fingerprint(module, brandingDigest=digest(module)) {
  const hash = createHash('sha256').update(brandingDigest);
  if (['hub', 'speech', 'pdf'].includes(module.id)) {
    for (const name of ['local-profile.js', 'local-profile.d.ts']) hash.update(name).update(fs.readFileSync(path.join(root, 'branding', name)));
  }
  if (module.id === 'hub' || module.id === 'speech') {
    for (const file of files(path.join(root, module.directory, 'legal')).sort()) hash.update(path.relative(root, file)).update(fs.readFileSync(file));
  }
  const base = path.join(root, module.directory);
  if(module.kind==='studio') {
    for(const file of studioInputs(root,module,files))hash.update(path.relative(base,file).replaceAll('\\','/')).update(fs.readFileSync(file));
    return hash.digest('hex');
  }
  if(module.id==='bim') {
    const inputs=['viewer/src','viewer/public','server','src/ifc_validator'].flatMap(dir=>files(path.join(base,dir))).filter(file=>!file.includes('__pycache__'));
    inputs.push(...['brand.json','pyproject.toml','requirements.txt','THIRD_PARTY_NOTICES.md','viewer/brand.json','viewer/package.json','viewer/package-lock.json','viewer/index.html','viewer/vite.config.ts','viewer/tsconfig.json','viewer/tsconfig.build.json'].map(name=>path.join(base,name)));
    for(const file of [...new Set(inputs)].sort())hash.update(path.relative(base,file).replaceAll('\\','/')).update(fs.readFileSync(file));
    return hash.digest('hex');
  }
  if(module.id==='pile') {
    const inputs=['crates','apps/pile-plan-studio/src','apps/pile-plan-studio/public','apps/pile-plan-studio/src-tauri/src','apps/pile-plan-studio/src-tauri/icons','apps/pile-plan-studio/src-tauri/capabilities','legal','sample_project','tools'].flatMap(dir=>files(path.join(base,dir))).filter(file=>!file.replaceAll('\\','/').includes('/src/core/wasm/'));
    inputs.push(...['brand.json','Cargo.toml','Cargo.lock','apps/pile-plan-studio/package.json','apps/pile-plan-studio/package-lock.json','apps/pile-plan-studio/index.html','apps/pile-plan-studio/tsconfig.json','apps/pile-plan-studio/tsconfig.node.json','apps/pile-plan-studio/vite.config.ts','apps/pile-plan-studio/src-tauri/build.rs','apps/pile-plan-studio/src-tauri/Cargo.toml','apps/pile-plan-studio/src-tauri/Cargo.lock','apps/pile-plan-studio/src-tauri/tauri.conf.json'].map(name=>path.join(base,name)));
    for(const file of [...new Set(inputs)].sort())hash.update(path.relative(base,file)).update(fs.readFileSync(file));
    return hash.digest('hex');
  }
  if(module.id==='stl') {
    const inputs=['app','web','legal'].flatMap(dir=>files(path.join(base,dir))).filter(file=>!file.includes('__pycache__')&&(file.includes(path.sep+'web'+path.sep)||file.includes(path.sep+'legal'+path.sep)||file.endsWith('.py')));
    inputs.push(...['brand.json','requirements.txt','run_app.py','LICENSE'].map(name=>path.join(base,name)));
    for(const file of [...new Set(inputs)].sort())hash.update(path.relative(base,file).replaceAll('\\','/')).update(fs.readFileSync(file));
    return hash.digest('hex');
  }
  const directories = module.id === 'cad' ? ['src','site','assets','locales','web'] : module.id === 'ifc' ? ['apps/desktop/src','apps/desktop/public','packages/viewer-engine/src','packages/ifc-core/src','brands'] : module.frontendDirectory ? [module.frontendDirectory+'/src',module.frontendDirectory+'/public'] : ['src','js','styles','preview','public'];
  const inputs = directories.flatMap(dir => files(path.join(base, dir))).filter(file => /\.(tsx?|jsx?|css|html|json|rs|ftl|svg|mjs)$/.test(file));
  for (const name of ['brand.json','package.json','index.html','preview.html','web-app.html','Cargo.toml']) if(fs.existsSync(path.join(base,name))) inputs.push(path.join(base,name));
  if(module.id==='hub')inputs.push(path.join(base,'package-lock.json'));
  if(module.id==='field') inputs.push(...files(path.join(base,'src-tauri/src')), ...files(path.join(base,'legal')), ...['package-lock.json','vite.config.ts','src-tauri/Cargo.toml','src-tauri/Cargo.lock','src-tauri/tauri.conf.json'].map(name=>path.join(base,name)));
  if(module.id==='pointcloud') inputs.push(...files(path.join(base,'src-tauri/src')), ...files(path.join(base,'src-tauri/icons')), ...files(path.join(base,'public')), ...files(path.join(base,'legal')), ...['package-lock.json','vite.config.ts','tsconfig.json','src-tauri/Cargo.toml','src-tauri/Cargo.lock','src-tauri/tauri.conf.json','LICENSE.md'].map(name=>path.join(base,name)));
  if(module.id==='speech') for (const name of ['package-lock.json','vite.config.ts','tsconfig.json','LICENSE','legal/UPSTREAM-NOTICES.md','legal/WHISPER-CPU-LICENSE.txt']) inputs.push(path.join(base,name));
  if (module.frontendDirectory) for (const name of ['brand.json','package.json','package-lock.json','index.html','vite.config.ts','tsconfig.json']) inputs.push(path.join(appDirectory(module),name));
  for (const file of [...new Set(inputs)].sort()) hash.update(path.relative(base,file)).update(fs.readFileSync(file));
  return hash.digest('hex');
}
