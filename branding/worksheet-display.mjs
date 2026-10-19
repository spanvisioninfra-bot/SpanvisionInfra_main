/** Text ranges in Calcpad worksheets; equations, directives and variable names stay intact. */
export function worksheetDisplayParts(text) {
  const parts = [];
  let hidden = false, selection = false, offset = 0;
  for (const raw of text.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) || []) {
    if (!raw) continue;
    const line = raw.replace(/[\r\n]+$/, ''), trimmed = line.trim();
    const leading = line.indexOf(trimmed);
    let value, start;
    if (/^#hide\b/.test(trimmed)) hidden = true;
    else if (/^#show\b/.test(trimmed)) hidden = false;
    else if (!hidden) {
      if (trimmed.startsWith('@select ')) {
        selection = true;
        const match = /"([^"]*)"/.exec(line);
        if (match) { value = match[1]; start = match.index + 1; }
      } else if (trimmed === '@end') selection = false;
      else if (selection) {
        const match = /^(.*?)\s*=\s*-?[\d.]+\s*$/.exec(trimmed);
        if (match) { value = match[1]; start = leading; }
      } else if (/^#{1,6} /.test(trimmed)) { value = trimmed; start = leading; }
      else {
        const annotation = /'([^'<>]*?)'\s*$/.exec(line);
        if (/\bper m'/.test(line) && !/[=<>]/.test(line)) { value = trimmed; start = leading; }
        else if (annotation) { value = annotation[1]; start = annotation.index + 1; }
        else if (!trimmed.startsWith("'") && !/[<>]/.test(line) && line.includes("'")) {
          const quote = line.indexOf("'");
          value = line.slice(quote + 1); start = quote + 1;
        } else if (!/[=<>']/.test(trimmed) && !trimmed.startsWith('#') && !/^\w+$/.test(trimmed)) { value = trimmed; start = leading; }
      }
      if (value?.trim()) {
        const key = value.trim();
        parts.push({ start: offset + start + value.indexOf(key), end: offset + start + value.indexOf(key) + key.length, text: key });
      }
    }
    offset += raw.length;
  }
  return parts;
}

export function worksheetInstructions(text) {
  let result = text;
  for (const part of worksheetDisplayParts(text).reverse()) result = result.slice(0, part.start) + '<display>' + result.slice(part.end);
  return result;
}

// Calcpad alternates quoted display text and live expressions on each line.
// Keep live expressions when translating HTML paragraphs such as 'UC = 'UC_x'...'.
export function worksheetCode(text) {
  return worksheetInstructions(text).split(/\r?\n/).map(line => {
    if (line.trimStart().startsWith('"')) return '<display>';
    let quoted = false, code = '';
    const fragments = [];
    for (let index = 0; index < line.length; index++) {
      const character = line[index];
      const wordApostrophe = quoted && /\p{L}/u.test(line[index - 1] || '') && /[sn]/.test(line[index + 1] || '') && !/\p{L}/u.test(line[index + 2] || '');
      if (character === "'" && !wordApostrophe) {
        if (!quoted && code.trim()) fragments.push(code.trim());
        code = ''; quoted = !quoted; continue;
      }
      if (!quoted) code += character;
    }
    if (code.trim()) fragments.push(code.trim());
    return fragments.join('\n');
  }).filter(line => line && line !== '<display>').join('\n');
}
