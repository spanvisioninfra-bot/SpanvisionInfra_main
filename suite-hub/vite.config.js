import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = path.dirname(require.resolve('tesseract.js-core/package.json'));
const files = fs.readdirSync(core).filter(name => /^tesseract-core.*-lstm\.wasm(?:\.js)?$/.test(name));
const ocrAssets = {
  name: 'local-ocr-engine',
  configureServer(server) {
    server.middlewares.use('/ocr-core', (request, response, next) => {
      const name = path.basename(request.url.split('?')[0]);
      if (!files.includes(name)) return next();
      response.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
      fs.createReadStream(path.join(core, name)).pipe(response);
    });
  },
  generateBundle() {
    for (const name of files) this.emitFile({ type: 'asset', fileName: 'ocr-core/' + name, source: fs.readFileSync(path.join(core, name)) });
    const legal = path.resolve('legal');
    const notices = fs.readdirSync(legal).filter(name => name.endsWith('-LICENSE.txt')).map(name => `${name}\n\n${fs.readFileSync(path.join(legal, name), 'utf8')}`).join('\n\n');
    this.emitFile({ type: 'asset', fileName: 'ocr-notices.txt', source: 'Local OCR dependencies: Tesseract.js, Tesseract.js Core, Mozilla PDF.js and pdf-lib.\n\n' + notices });
  },
};
export default defineConfig({ plugins: [solid(), ocrAssets], server: { host: '127.0.0.1', port: 4230, strictPort: true } });
