import type { CenterProfile, DesignFeedback, PosterContent, PosterLayout, PosterMetadata, PosterTheme } from "./types.js";
import { escapeHtml } from "./util.js";

function cssVars(theme: PosterTheme): string {
  const spacing = theme.spacingScale === "compact" ? "24px" : theme.spacingScale === "airy" ? "44px" : "34px";
  return `:root {
  --background: ${theme.background};
  --surface: ${theme.surface};
  --text: ${theme.text};
  --muted: ${theme.mutedText};
  --accent: ${theme.accent};
  --font: ${theme.fontFamily};
  --radius: ${theme.radius};
  --border-width: ${theme.borderWidth};
  --space: ${spacing};
}`;
}

export function renderCss(layout: PosterLayout, theme: PosterTheme): string {
  return `${cssVars(theme)}
* { box-sizing: border-box; }
html, body { margin: 0; width: 100%; min-height: 100%; background: var(--background); color: var(--text); font-family: var(--font); }
body { -webkit-font-smoothing: antialiased; text-rendering: geometricPrecision; }
.poster { width: 1080px; min-height: 1350px; padding: calc(var(--space) * 1.4); display: flex; flex-direction: column; gap: var(--space); background: var(--background); }
.topline { display: flex; align-items: center; justify-content: space-between; gap: 20px; color: var(--muted); font-size: 28px; font-weight: 700; letter-spacing: 0; }
.badge { border: var(--border-width) solid var(--accent); color: var(--accent); border-radius: 999px; padding: 10px 22px; font-size: 24px; font-weight: 800; }
.title { margin: 0; font-size: ${layout === "table" ? "76px" : "92px"}; line-height: 1.08; font-weight: 900; letter-spacing: 0; word-break: keep-all; }
.subtitle, .body, .note, .footer { margin: 0; color: var(--muted); word-break: keep-all; }
.subtitle { font-size: 34px; line-height: 1.35; }
.headline { margin: 0; font-size: 74px; line-height: 1.12; font-weight: 900; color: var(--accent); word-break: keep-all; }
.body { font-size: 34px; line-height: 1.55; white-space: pre-wrap; }
.highlight { background: var(--surface); border: var(--border-width) solid color-mix(in srgb, var(--accent), transparent 30%); border-radius: var(--radius); padding: 34px; font-size: 48px; line-height: 1.25; font-weight: 900; color: var(--accent); word-break: keep-all; }
.cta { margin-top: auto; background: var(--accent); color: var(--background); border-radius: var(--radius); padding: 24px 32px; text-align: center; font-size: 36px; font-weight: 900; word-break: keep-all; }
.table-wrap { background: var(--surface); border: var(--border-width) solid color-mix(in srgb, var(--text), transparent 82%); border-radius: var(--radius); overflow: hidden; }
.split-section { display: flex; flex-direction: column; gap: 12px; }
.split-section h3 { margin: 0; color: var(--accent); font-size: 30px; line-height: 1.1; font-weight: 900; }
.price-list { background: var(--surface); border: var(--border-width) solid color-mix(in srgb, var(--text), transparent 82%); border-radius: var(--radius); padding: 20px 30px; }
.price-list-row { display: flex; align-items: baseline; justify-content: space-between; gap: 28px; padding: 20px 0; border-bottom: var(--border-width) solid color-mix(in srgb, var(--text), transparent 88%); font-size: 34px; line-height: 1.2; }
.price-list-row:last-child { border-bottom: 0; }
.price-list-row strong { color: var(--accent); font-size: 40px; font-variant-numeric: tabular-nums; white-space: nowrap; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
th, td { padding: 24px 22px; border-bottom: var(--border-width) solid color-mix(in srgb, var(--text), transparent 86%); font-size: 30px; line-height: 1.25; text-align: left; word-break: keep-all; }
th { color: var(--muted); font-size: 25px; font-weight: 800; }
td.price, th.price { text-align: right; font-variant-numeric: tabular-nums; }
td.highlight-cell { color: var(--accent); font-size: 36px; font-weight: 900; }
.category-row td { background: color-mix(in srgb, var(--accent), transparent 84%); color: var(--accent); font-size: 24px; font-weight: 900; text-align: left; }
.note { font-size: 26px; line-height: 1.45; }
.footer { border-top: var(--border-width) solid color-mix(in srgb, var(--text), transparent 84%); padding-top: 24px; font-size: 26px; line-height: 1.45; }
.feedback-hints { display: none; }`;
}

function vatText(policy: PosterMetadata["vatPolicy"]): string {
  if (policy === "included") return "※ 모든 금액 VAT 포함";
  if (policy === "excluded") return "※ VAT 별도";
  return "";
}

function renderTable(content: PosterContent, metadata: PosterMetadata): string {
  const table = content.table;
  if (!table) return "";
  if (metadata.tableStyle === "split") {
    return renderSplitTables(content);
  }
  if (metadata.tableStyle === "price-list") {
    return renderPriceList(content);
  }
  const highlightColumn = table.highlightColumn;
  const header = table.columns
    .map((column, index) => `<th class="${isPriceColumn(column) ? "price" : ""}">${escapeHtml(column)}</th>`)
    .join("");
  const rows = table.rows
    .map((row, rowIndex) => {
      const category = table.rowCategories?.[rowIndex];
      const categoryRow =
        metadata.tableStyle === "grouped" && category ? `<tr class="category-row"><td colspan="${table.columns.length}">${escapeHtml(String(category).toUpperCase())}</td></tr>` : "";
      const cells = row
        .map((cell, index) => {
          const classes = [isPriceColumn(table.columns[index] ?? "") ? "price" : "", highlightColumn === index ? "highlight-cell" : ""].filter(Boolean).join(" ");
          return `<td class="${classes}">${escapeHtml(cell)}</td>`;
        })
        .join("");
      return `${categoryRow}<tr>${cells}</tr>`;
    })
    .join("");
  return `<div class="table-wrap"><table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function isPriceColumn(label: string): boolean {
  return /(가|가격|금액|price|원)/i.test(label);
}

function renderSplitTables(content: PosterContent): string {
  const table = content.table;
  if (!table) return "";
  const groups = new Map<string, Array<Array<string>>>();
  table.rows.forEach((row, index) => {
    const label = String(table.rowCategories?.[index] ?? "OTHER").toUpperCase();
    groups.set(label, [...(groups.get(label) ?? []), row]);
  });
  if (groups.size <= 1) return renderSingleTable(content);
  return [...groups.entries()]
    .map(([label, rows]) => {
      const header = table.columns
        .map((column) => `<th class="${isPriceColumn(column) ? "price" : ""}">${escapeHtml(column)}</th>`)
        .join("");
      const body = rows
        .map((row) => {
          const cells = row
            .map((cell, index) => {
              const classes = [isPriceColumn(table.columns[index] ?? "") ? "price" : "", table.highlightColumn === index ? "highlight-cell" : ""].filter(Boolean).join(" ");
              return `<td class="${classes}">${escapeHtml(cell)}</td>`;
            })
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("");
      return `<section class="split-section"><h3>${escapeHtml(label)}</h3><div class="table-wrap"><table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div></section>`;
    })
    .join("");
}

function renderSingleTable(content: PosterContent): string {
  const table = content.table;
  if (!table) return "";
  const header = table.columns.map((column) => `<th class="${isPriceColumn(column) ? "price" : ""}">${escapeHtml(column)}</th>`).join("");
  const rows = table.rows
    .map((row) => {
      const cells = row
        .map((cell, index) => {
          const classes = [isPriceColumn(table.columns[index] ?? "") ? "price" : "", table.highlightColumn === index ? "highlight-cell" : ""].filter(Boolean).join(" ");
          return `<td class="${classes}">${escapeHtml(cell)}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<div class="table-wrap"><table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderPriceList(content: PosterContent): string {
  const table = content.table;
  if (!table) return "";
  const rows = table.rows
    .map((row) => {
      const label = row.slice(0, -1).join(" ");
      const price = row.at(-1) ?? "";
      return `<div class="price-list-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(price)}</strong></div>`;
    })
    .join("");
  return `<div class="price-list">${rows}</div>`;
}

export function renderHtml(input: {
  metadata: PosterMetadata;
  content: PosterContent;
  center: CenterProfile;
  feedback: DesignFeedback[];
}): string {
  const { metadata, content, center, feedback } = input;
  const footer = content.footer ?? center.footerText ?? "";
  const vat = vatText(metadata.vatPolicy);
  const title = content.title ?? metadata.title;
  const feedbackHints = feedback.map((item) => `<li>${escapeHtml(item.text)}</li>`).join("");
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=1080, initial-scale=1">
  <title>${escapeHtml(metadata.title)}</title>
  <link rel="stylesheet" href="./poster.css">
</head>
<body>
  <main class="poster" data-layout="${escapeHtml(metadata.layout)}" data-poster-id="${escapeHtml(metadata.id)}">
    <div class="topline">
      <span>${escapeHtml(content.eyebrow ?? center.name)}</span>
      ${content.badge ? `<span class="badge">${escapeHtml(content.badge)}</span>` : ""}
    </div>
    <h1 class="title">${escapeHtml(title)}</h1>
    ${content.subtitle ? `<p class="subtitle">${escapeHtml(content.subtitle)}</p>` : ""}
    ${content.headline ? `<h2 class="headline">${escapeHtml(content.headline)}</h2>` : ""}
    ${content.body ? `<p class="body">${escapeHtml(content.body)}</p>` : ""}
    ${content.highlight ? `<section class="highlight">${escapeHtml(content.highlight)}</section>` : ""}
    ${renderTable(content, metadata)}
    ${content.note || vat ? `<p class="note">${escapeHtml([content.note, vat].filter(Boolean).join("\n"))}</p>` : ""}
    ${content.cta ? `<div class="cta">${escapeHtml(content.cta)}</div>` : ""}
    ${footer ? `<footer class="footer">${escapeHtml(footer)}</footer>` : ""}
    <ul class="feedback-hints">${feedbackHints}</ul>
  </main>
</body>
</html>
`;
}
