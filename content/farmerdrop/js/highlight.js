/** Minimal syntax colouring for the SQL and TypeScript excerpts. Builds DOM nodes; never uses innerHTML. */

const SQL_KEYWORDS = new Set(
  ("select from where and or not null as on in is by order desc limit create unique index if exists table view " +
    "function returns language immutable lateral join update set returning insert into values conflict do nothing " +
    "for case when then else end primary key default constraint references alter add column type enum " +
    "begin commit with group sum coalesce round table numeric integer serial text timestamp boolean")
    .split(" "),
);
const TS_KEYWORDS = new Set(
  "const let await async return if throw new await of for function import export from true false null".split(" "),
);

const TOKEN = /(--[^\n]*|\/\/[^\n]*)|('(?:[^']|'')*'|`[^`]*`|"[^"]*")|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|(\s+|[^\sA-Za-z0-9_'"`-]+|-)/g;

function classify(match, lang) {
  const [, comment, string, number, word] = match;
  if (comment) return "tok-comment";
  if (string) return "tok-string";
  if (number) return "tok-number";
  if (word) {
    const keywords = lang === "sql" ? SQL_KEYWORDS : TS_KEYWORDS;
    return keywords.has(lang === "sql" ? word.toLowerCase() : word) ? "tok-keyword" : null;
  }
  return null;
}

export function highlightLine(text, lang) {
  const fragment = document.createDocumentFragment();
  for (const match of text.matchAll(TOKEN)) {
    const cls = classify(match, lang);
    if (cls) {
      const span = document.createElement("span");
      span.className = cls;
      span.textContent = match[0];
      fragment.append(span);
    } else {
      fragment.append(match[0]);
    }
  }
  return fragment;
}

/** Colour every <pre><code data-lang> on the page. Lines stay as text, wrapped in spans for linking. */
export function highlightAll(root = document) {
  for (const code of root.querySelectorAll("pre > code[data-lang]")) {
    const lang = code.dataset.lang;
    const lines = code.textContent.replace(/\n$/, "").split("\n");
    code.replaceChildren(
      ...lines.map((line) => {
        const span = document.createElement("span");
        span.className = "line";
        span.append(highlightLine(line, lang), "\n");
        return span;
      }),
    );
  }
}
