import { createWorker } from 'tesseract.js';
import workerUrl from 'tesseract.js/dist/worker.min.js?url';
import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
const MAX_PIXELS = 20_000_000;
const MAX_PAGES = 25;

export async function recognizeScan(file, { signal, onProgress = () => {}, pages = 'all' } = {}) {
  if (!file) throw new Error('Choose a scanned PDF or image first.');
  if (file.size > 50 * 1024 * 1024) throw new Error('Choose a file smaller than 50 MB.');
  const cancelled = () => { if (signal?.aborted) throw new DOMException('Recognition cancelled', 'AbortError'); };
  cancelled();
  const input = new Uint8Array(await file.arrayBuffer());
  const isPdf = String.fromCharCode(...input.slice(0, 5)) === '%PDF-';
  let sourcePdf, sourcePdfTask, worker, canvas, bitmap, index = 0, count = 1;
  const abort = () => worker?.terminate();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const output = isPdf ? await PDFDocument.load(input.slice()) : await PDFDocument.create();
    if (isPdf) {
      sourcePdfTask = pdfjs.getDocument({ data: input.slice(), isEvalSupported: false });
      sourcePdf = await sourcePdfTask.promise;
      count = pages === 'first' ? 1 : sourcePdf.numPages;
      if (count > MAX_PAGES) throw new Error(`Process up to ${MAX_PAGES} pages at a time. Split larger PDFs in PDF Studio.`);
    }
    worker = await createWorker('eng', 1, {
      workerPath: workerUrl, workerBlobURL: false, corePath: '/ocr-core',
      logger: message => {
        if (!signal?.aborted && message.status === 'recognizing text') onProgress(Math.round(((index + message.progress) / count) * 100));
      },
    });
    cancelled();
    const font = await output.embedFont(StandardFonts.Helvetica);
    const texts = [];
    for (index = 0; index < count; index++) {
      cancelled(); canvas = document.createElement('canvas');
      let target, viewport;
      if (sourcePdf) {
        const page = await sourcePdf.getPage(index + 1);
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(2, Math.sqrt(MAX_PIXELS / (base.width * base.height)));
        viewport = page.getViewport({ scale });
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d'), canvas, viewport }).promise;
        target = output.getPage(index);
      } else {
        bitmap = await createImageBitmap(file);
        if (bitmap.width * bitmap.height > MAX_PIXELS) throw new Error('Use an image smaller than 20 megapixels.');
        canvas.width = bitmap.width; canvas.height = bitmap.height;
        canvas.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close(); bitmap = undefined;
        target = output.addPage([canvas.width * 0.75, canvas.height * 0.75]);
        const image = await output.embedPng(canvas.toDataURL('image/png'));
        target.drawImage(image, { x: 0, y: 0, width: target.getWidth(), height: target.getHeight() });
      }
      const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true });
      cancelled(); texts.push(data.text.trim());
      for (const block of data.blocks ?? []) for (const paragraph of block.paragraphs ?? [])
        for (const line of paragraph.lines ?? []) for (const word of line.words ?? []) {
          // Standard PDF fonts cannot encode arbitrary Unicode. The text export
          // retains every recognized character; the PDF layer uses printable English.
          const text = word.text.replace(/[^\x20-\x7e]/g, ' ').trim();
          if (!text) continue;
          const { x0, y0, y1 } = word.bbox;
          const [x, y] = viewport ? viewport.convertToPdfPoint(x0, y1) : [x0 * 0.75, target.getHeight() - y1 * 0.75];
          const size = Math.max(1, (y1 - y0) * (viewport ? 1 / viewport.scale : 0.75));
          target.drawText(text, { x, y, size, font, opacity: 0, rotate: degrees(-(viewport?.rotation ?? 0)) });
        }
      canvas.width = canvas.height = 0; canvas = undefined;
      onProgress(Math.round(((index + 1) / count) * 100));
    }
    cancelled();
    const bytes = await output.save();
    return { text: texts.join('\n\n'), pdf: new Blob([bytes], { type: 'application/pdf' }), pages: count };
  } finally {
    signal?.removeEventListener('abort', abort);
    await worker?.terminate(); await sourcePdfTask?.destroy(); bitmap?.close();
    if (canvas) canvas.width = canvas.height = 0;
  }
}

export function downloadScan(blob, filename) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
