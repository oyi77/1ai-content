/**
 * Minimal, dependency-free, escape-first Markdown → HTML converter for
 * article content.
 *
 * The entire input is HTML-escaped up front (before any transformation), so
 * raw HTML embedded in the source is never executable — every emission path
 * is safe by construction. Escaping never disturbs Markdown syntax
 * characters (` `, #, *, [, ], (, ), -, +, ., >, ~, digits), so the parser
 * still matches normally. Only the small set of constructs below is turned
 * into markup. This file has no dependencies (admin-ui intentionally ships
 * without a markdown library).
 */

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only http(s), mailto, hash anchors, and same-origin paths are kept. */
const SAFE_URL = /^(https?:|mailto:|#|\/)/i;

export function sanitizeUrl(raw: string): string | null {
  const url = raw.trim();
  if (!SAFE_URL.test(url)) return null;
  if (/^(javascript|data|vbscript):/i.test(url)) return null;
  // already HTML-escaped by markdownToHtml; safe inside double-quoted attrs
  return url;
}

function inline(text: string): string {
  let out = text;
  // inline code first so its contents are never re-processed
  out = out.replace(/`([^`]+)`/g, (_m, code: string) => `<code>${code}</code>`);
  // links / images — drop the element (keep label text) when the target is unsafe
  out = out.replace(/!?\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, target: string) => {
    const href = sanitizeUrl(target);
    return href
      ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`
      : label;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return out;
}

function isHr(line: string): boolean {
  return /^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line);
}

function isHeading(line: string): boolean {
  return /^\s{0,3}#{1,6}\s+/.test(line);
}

function isQuote(line: string): boolean {
  return /^\s{0,3}>/.test(line);
}

function isUl(line: string): boolean {
  return /^\s{0,3}[-*+]\s+/.test(line);
}

function isOl(line: string): boolean {
  return /^\s{0,3}\d+\.\s+/.test(line);
}

function isFence(line: string): boolean {
  return /^\s*(```|~~~)\s*([\w+-]*)\s*$/.test(line);
}

export function markdownToHtml(markdown: string): string {
  const lines = escapeHtml(markdown).replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let i = 0;

  const flushList = (type: "ul" | "ol", items: string[]) => {
    html.push(`<${type}>`);
    for (const item of items) html.push(`<li>${inline(item)}</li>`);
    html.push(`</${type}>`);
  };

  while (i < lines.length) {
    const line = lines[i];

    // fenced code block
    const fence = line.match(/^\s*(```|~~~)\s*([\w+-]*)\s*$/);
    if (fence) {
      const closer = fence[1];
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith(closer)) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1; // skip closing fence
      html.push(`<pre><code>${code.join("\n")}</code></pre>`);
      continue;
    }

    // heading
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    // horizontal rule
    if (isHr(line)) {
      html.push("<hr>");
      i += 1;
      continue;
    }

    // blockquote (multi-line)
    if (isQuote(line)) {
      const quote: string[] = [];
      while (i < lines.length && isQuote(lines[i])) {
        quote.push(lines[i].replace(/^\s{0,3}>\s?/, ""));
        i += 1;
      }
      html.push(`<blockquote><p>${inline(quote.join("<br>"))}</p></blockquote>`);
      continue;
    }

    // unordered list
    const ulMatch = line.match(/^\s{0,3}([-*+]) (.*)$/);
    if (ulMatch) {
      const items = [ulMatch[2]];
      i += 1;
      while (i < lines.length) {
        const m = lines[i].match(/^\s{0,3}([-*+]) (.*)$/);
        if (!m) break;
        items.push(m[2]);
        i += 1;
      }
      flushList("ul", items);
      continue;
    }

    // ordered list
    const olMatch = line.match(/^\s{0,3}\d+\. (.*)$/);
    if (olMatch) {
      const items = [olMatch[1]];
      i += 1;
      while (i < lines.length) {
        const m = lines[i].match(/^\s{0,3}\d+\. (.*)$/);
        if (!m) break;
        items.push(m[1]);
        i += 1;
      }
      flushList("ol", items);
      continue;
    }

    // blank line
    if (!line.trim()) {
      i += 1;
      continue;
    }

    // paragraph — consume consecutive plain lines
    const para: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !isHeading(lines[i]) &&
      !isQuote(lines[i]) &&
      !isUl(lines[i]) &&
      !isOl(lines[i]) &&
      !isFence(lines[i]) &&
      !isHr(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    html.push(`<p>${inline(para.join("<br>"))}</p>`);
  }

  return html.join("\n");
}
