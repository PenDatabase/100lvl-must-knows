import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

export function renderMarkdown(markdown: string) {
  const html = marked.parse(markdown, { async: false });
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["h1", "h2", "h3", "del"]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ["href", "name", "target", "rel"],
    },
    allowedSchemes: ["http", "https", "mailto"],
  });
}
