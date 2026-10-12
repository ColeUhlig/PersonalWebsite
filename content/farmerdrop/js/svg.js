const NS = "http://www.w3.org/2000/svg";

export function svg(tag, attrs = {}, text) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null) node.setAttribute(key, String(value));
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Split a label into at most `maxLines` lines that fit `width` px, using an average glyph width. */
export function wrap(label, width, { charWidth = 6.9, maxLines = 2 } = {}) {
  const perLine = Math.max(6, Math.floor(width / charWidth));
  const lines = [];
  let line = "";
  for (const word of label.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > perLine && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1]}…`;
  return kept;
}
