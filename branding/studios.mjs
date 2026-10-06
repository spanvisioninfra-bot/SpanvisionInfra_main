import fs from 'node:fs';
import path from 'node:path';

const layouts={
  planner:{directories:['src','public','scripts'],configs:['']},
  fem:{directories:['src','public','vendor','design-mockup/src','design-mockup/public','src-tauri/src','src-tauri/crates'],configs:['','design-mockup','src-tauri']},
  frame:{directories:['ui/src','ui/public','ofs-web','ofs-core/src','ofs-core/assets','ofs-wasm/src','src-tauri/src','scripts'],configs:['','ui','ofs-core','ofs-wasm','src-tauri']},
  calculation:{directories:['packages/core/src','packages/desktop/src','packages/desktop/public','packages/web/src','packages/web/public','scripts'],configs:['','packages/core','packages/desktop','packages/web']}
};

export function studioInputs(root,module,files) {
  const base=path.join(root,module.directory),layout=layouts[module.id];
  if(!layout)throw new Error(`Unknown studio: ${module.id}`);
  const inputs=layout.directories.flatMap(directory=>files(path.join(base,directory)));
  for(const directory of layout.configs) {
    const absolute=path.join(base,directory);
    for(const name of fs.readdirSync(absolute))if(/^(brand\.json|package(-lock)?\.json|Cargo\.(toml|lock)|index\.html|tsconfig.*\.json|vite.*\.(ts|js)|companion-plugin\.js)$/.test(name))inputs.push(path.join(absolute,name));
  }
  return [...new Set(inputs)].sort();
}

export function syncStudio({root,brand,module,emit}) {
  const identity={organization:brand.organization,product:module.productName,mark:module.mark,theme:brand.theme,palette:brand.palette,browserPreviewPort:module.port};
  emit(`${module.directory}/brand.json`,JSON.stringify(identity,null,2)+'\n');
  if(module.frontendDirectory)emit(`${module.directory}/${module.frontendDirectory}/brand.json`,JSON.stringify(identity,null,2)+'\n');
  const sourceNotices={planner:'OPEN_SOURCE_NOTICES.md',fem:'THIRD_PARTY_NOTICES.md',frame:'NOTICE.md',calculation:'NOTICE'};
  emit(`suite-hub/public/${module.id}-notices.txt`,fs.readFileSync(path.join(root,module.directory,sourceNotices[module.id]),'utf8'));
}
