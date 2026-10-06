/** Actual browser files, never a desktop-path prompt. */
export function chooseBrowserFile(accept = '.ifc') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept; input.hidden = true;
    const finish = value => { input.remove(); resolve(value); };
    input.addEventListener('change', () => finish(input.files?.[0] || null), { once: true });
    input.addEventListener('cancel', () => finish(null), { once: true });
    document.body.append(input);
    input.click();
  });
}

export async function readIfcBrowserFile(file) {
  if (file.size > 64 * 1024 * 1024) throw new Error('IFC import is limited to 64 MB.');
  // Fatal UTF-8 decoding matches the native reader; do not replace invalid bytes.
  return new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
}
