/* Product identity only. Engine versions, project data and editor controls stay native. */
(() => {
  const data = document.getElementById('sv-tool-identity-data');
  if (!data) return;
  const tool = JSON.parse(data.textContent);
  if (!tool.icon || !/^\d+\.\d+$/.test(tool.version)) return;
  const root = document.documentElement;
  const adapters = {
    cad2d: { header: '.sv-cad2d-titlebar', logo: 'button[aria-label="Project start"] img', release: '.flex-1' },
    bim: { header: '.brand-header, .titlebar', logo: '.brand-lockup > svg, .titlebar-brand > svg', release: '.brand-lockup, .titlebar-title' },
    pdf: { header: '.title-bar', logo: '.app-icon', release: '.app-title', legacy: '.app-title small' },
    ifc: { header: 'header', logo: 'img[class*="appIcon"]', release: '[class*="dragRegion"]' },
    calc: { header: '.titlebar', logo: '.titlebar-icon img', release: '.titlebar-title' },
    planner: { header: '.title-bar', logo: '.studio-brand img', release: '.title-bar-center', title: '[data-ops-title-app-name]' },
    fem: { header: '.titlebar', logo: '.titlebar-icon > svg', release: '.titlebar-title' },
    frame: { header: '.titlebar', logo: '.app-icon', release: '.subtitle' },
    calculation: { header: '.titlebar', logo: '.titlebar-icon > svg', release: '.titlebar-title' },
    geo: { header: '.titlebar', logo: '.titlebar-icon > svg', release: '.titlebar-title' },
    speech: { header: '.titlebar', logo: '.titlebar-lockup img', release: '.titlebar-title' },
    stl: { header: '#topbar', logo: '.brand .mark', release: '.brand', legacy: '#app-version' },
    field: { header: '.app-toolbar, .title-bar', logo: '.logo > img, .title-bar-icon img', release: '.logo, .title-bar-center' },
    pointcloud: { header: '.titlebar', logo: '.brand-mark', release: '.title-lockup' },
    pile: { header: '.titlebar', logo: '.titlebar-icon img', release: '.titlebar-title' },
  };
  const replacements = new Map();
  let scheduled = false;

  function inkOnSurface(element) {
    for (let node = element; node && node !== root; node = node.parentElement) {
      const style = getComputedStyle(node);
      const surface = style.backgroundImage.includes('gradient(')
        ? style.backgroundImage.match(/rgba?\([^)]+\)/)?.[0] || style.backgroundColor
        : style.backgroundColor;
      const match = surface.match(/^rgba?\(([^)]+)\)$/);
      if (!match) continue;
      const [r, g, b, alpha = 1] = match[1].split(',').map(Number);
      if (alpha < .9) continue;
      return (r * .2126 + g * .7152 + b * .0722) / 255 > .5 ? '#17202b' : '#ffffff';
    }
    return root.dataset.svMode === 'light' ? '#17202b' : '#ffffff';
  }
  function logoUrl(color) {
    const { tone, lines, dots = [] } = tool.icon;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 34" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${tone}" fill="${color}" fill-opacity=".12" stroke="none"/><path d="${lines}"/>${dots.map(([x,y])=>`<circle cx="${x}" cy="${y}" r="1.5" fill="${color}" stroke-width=".6"/>`).join('')}</svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }
  function decorateLogo(element) {
    const color = inkOnSurface(element), url = logoUrl(color);
    let image = element;
    if (!(element instanceof HTMLImageElement)) {
      image = replacements.get(element);
      if (!image?.isConnected) {
        image = document.createElement('img');
        image.width = Number(element.getAttribute('width')) || 22;
        image.height = Number(element.getAttribute('height')) || 22;
        image.className = 'sv-tool-logo-replacement';
        element.insertAdjacentElement('afterend', image);
        element.dataset.svLegacyLogo = 'true';
        replacements.set(element, image);
      }
    }
    image.dataset.svToolLogo = tool.id;
    image.dataset.svLogoInk = color;
    image.alt = tool.label;
    if (image.getAttribute('src') !== url) image.src = url;
  }
  function releaseBadge(host) {
    let badge = host.querySelector(':scope > .sv-tool-release');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'sv-tool-release';
      badge.textContent = `v${tool.version}`;
      badge.setAttribute('aria-label', `${tool.label} v${tool.version}`);
      host.append(badge);
    }
    badge.style.setProperty('--sv-tool-ink', inkOnSurface(host));
  }
  function paint() {
    scheduled = false;
    for (const [original, image] of replacements) {
      if (!original.isConnected) { image.remove(); replacements.delete(original); }
    }
    if (tool.id === 'cad') {
      const canvas = document.querySelector('body > canvas');
      if (!canvas) return;
      let bar = document.querySelector('.sv-canvas-brandbar');
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'sv-canvas-brandbar';
        const image = document.createElement('img'), name = document.createElement('span');
        image.width = 24; image.height = 24;
        name.textContent = tool.label;
        bar.append(image, name);
        canvas.before(bar);
        document.body.dataset.svCanvasBranding = 'true';
      }
      decorateLogo(bar.querySelector('img'));
      releaseBadge(bar);
      return;
    }
    const adapter = adapters[tool.id];
    if (!adapter) return;
    for (const header of document.querySelectorAll(adapter.header)) {
      const logos = header.querySelectorAll(adapter.logo);
      if (!logos.length) continue;
      for (const logo of logos) decorateLogo(logo);
      for (const label of header.querySelectorAll('.titlebar-version, .title-bar-version, .title-version, .version' + (adapter.legacy ? ', ' + adapter.legacy : ''))) {
        label.dataset.svEngineVersion = 'true';
      }
      if (adapter.title) {
        const original = header.querySelector(adapter.title);
        if (original) {
          original.dataset.svEngineVersion = 'true';
          if (!original.parentElement.querySelector('.sv-tool-product-name')) {
            const name = document.createElement('span');
            name.className = 'sv-tool-product-name'; name.textContent = tool.label;
            original.insertAdjacentElement('afterend', name);
          }
        }
      }
      releaseBadge(header.querySelector(adapter.release) || header);
      header.dataset.svToolHeader = tool.id;
    }
  }
  function schedule() {
    if (!scheduled) { scheduled = true; requestAnimationFrame(paint); }
  }
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  new MutationObserver(schedule).observe(root, { attributes: true, attributeFilter: ['data-sv-mode'] });
  window.addEventListener('spanvision:mode-change', schedule);
  window.addEventListener('spanvision:mode-observed', schedule);
  paint();
})();
