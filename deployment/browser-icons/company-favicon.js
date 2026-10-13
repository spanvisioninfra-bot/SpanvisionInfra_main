/* The same company identity is used by every browser tool. */
(() => {
  const base = new URL('.', document.currentScript.src);
  function paint() {
    const mode = document.documentElement.dataset.svMode === 'light' ? 'light' : 'dark';
    for (const [id,file] of [['sv-tool-favicon',`company-${mode}.svg`],['sv-tool-favicon-png',`company-${mode}-32.png`],['sv-tool-touch-icon',`company-${mode}-180.png`]]) {
      const link = document.getElementById(id);
      const href = new URL(file,base).href;
      if (link && link.href !== href) link.href = href;
    }
  }
  paint();
  new MutationObserver(paint).observe(document.documentElement,{attributes:true,attributeFilter:['data-sv-mode']});
  window.addEventListener('spanvision:mode-change',paint);
  window.addEventListener('spanvision:mode-observed',paint);
})();
