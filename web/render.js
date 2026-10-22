export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );

// Deliberately small Markdown subset. User/model HTML and URLs never execute.
export function markdown(raw, references = [], scope = "") {
  const inline = (text) =>
    escapeHtml(text)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[(R\d+)\]/g, (label, id) =>
        references.some((ref) => ref.id === id)
          ? `<button class="citation" data-action="reference" data-ref="${id}" data-scope="${escapeHtml(scope)}" aria-label="查看原文引用 ${id}">${id}</button>`
          : label,
      );
  return String(raw || "")
    .split(/\n/)
    .map((line) => {
      if (!line.trim()) return "";
      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading)
        return `<h${heading[1].length + 1}>${inline(heading[2])}</h${heading[1].length + 1}>`;
      if (/^\s*[-*]\s+/.test(line))
        return `<p class="bullet">${inline(line.replace(/^\s*[-*]\s+/, ""))}</p>`;
      return `<p>${inline(line)}</p>`;
    })
    .join("");
}

export function referenceButtons(ids, references, scope = "") {
  return ids
    .filter((id) => references.some((ref) => ref.id === id))
    .map(
      (id) =>
        `<button class="citation" data-action="reference" data-ref="${escapeHtml(id)}" data-scope="${escapeHtml(scope)}">${escapeHtml(id)}</button>`,
    )
    .join(" ");
}

export function conceptGraph(entry, mastery, selectedId) {
  const nodes = entry.data.concepts;
  const center = { x: 400, y: 270 };
  const positions = new Map(
    nodes.map((node, index) => {
      const angle = (index / nodes.length) * Math.PI * 2 - Math.PI / 2;
      return [
        node.id,
        nodes.length === 1
          ? center
          : {
              x: center.x + Math.cos(angle) * 285,
              y: center.y + Math.sin(angle) * 185,
            },
      ];
    }),
  );
  const edges = entry.data.links
    .map((link) => {
      const a = positions.get(link.from),
        b = positions.get(link.to);
      return `<g><line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#c9d5cd" stroke-width="1.5"/><title>${escapeHtml(link.label)}</title></g>`;
    })
    .join("");
  const circles = nodes
    .map((node) => {
      const point = positions.get(node.id);
      const state = mastery[`${entry.id}:${node.id}`] || "learning";
      return `<g role="button" tabindex="0" aria-label="概念：${escapeHtml(node.name)}" data-action="concept" data-id="${escapeHtml(node.id)}" class="concept ${state} ${selectedId === node.id ? "selected" : ""}"><title>${escapeHtml(node.name)}</title><circle cx="${point.x}" cy="${point.y}" r="36"/><text x="${point.x}" y="${point.y + 58}" text-anchor="middle">${escapeHtml(node.name.length > 10 ? node.name.slice(0, 9) + "…" : node.name)}</text></g>`;
    })
    .join("");
  return `<svg class="concept-graph" viewBox="0 0 800 540" role="group" aria-label="${escapeHtml(entry.title)}概念图">${edges}${circles}</svg>`;
}
