import fs from 'node:fs';

const artwork = fs.readFileSync(new URL('./spanvision-infra-curved-s-logo.png', import.meta.url)).toString('base64');

// Render the supplied artwork through a luminance mask. The original PNG stays
// intact; this compact mark excludes the white paper and the separate wordmark.
export function companyMark(mode = 'dark') {
  const colors = mode === 'light'
    ? ['#17202b', '#536274', '#17202b', '#39485b', '#17202b']
    : ['#b9bfc7', '#ffffff', '#d6dce4', '#ffffff', '#a7afb9'];
  const stops = colors.map((color, index) => `<stop offset="${index / 4}" stop-color="${color}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="72 32 266 254" role="img" aria-label="Spanvision Infra">
<defs>
<filter id="paper-to-mask" color-interpolation-filters="sRGB">
<feColorMatrix type="matrix" values="-.2126 -.7152 -.0722 0 1 -.2126 -.7152 -.0722 0 1 -.2126 -.7152 -.0722 0 1 0 0 0 1 0"/>
<feComponentTransfer><feFuncR type="linear" slope="1.25" intercept="-.05"/><feFuncG type="linear" slope="1.25" intercept="-.05"/><feFuncB type="linear" slope="1.25" intercept="-.05"/></feComponentTransfer>
</filter>
<mask id="curved-s" maskUnits="userSpaceOnUse" x="72" y="32" width="266" height="254" style="mask-type:luminance">
<image href="data:image/png;base64,${artwork}" width="418" height="418" filter="url(#paper-to-mask)"/>
</mask>
<linearGradient id="metal" x1="0" y1="0" x2=".7" y2="1">${stops}</linearGradient>
</defs>
<rect x="72" y="32" width="266" height="254" fill="url(#metal)" mask="url(#curved-s)"/>
</svg>\n`;
}
