/**
 * Print / PDF engine.
 *
 * Every printable surface in the app funnels through here: a standalone HTML
 * document is composed, dropped into a hidden same-origin iframe and handed to
 * the browser's print dialog — where "Save as PDF" is the destination the user
 * picks. Nothing here touches the app's own stylesheet, so what lands on paper
 * is deliberate rather than a screenshot of the screen.
 */

export type PrintAlign = 'left' | 'right' | 'center';

/** Letterhead shown at the top of every printed page. */
export interface PrintBrand {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  footerNote?: string;
}

export interface PrintMeta {
  label: string;
  value: string;
}

export interface PrintColumn {
  key: string;
  header?: string;
  align?: PrintAlign;
}

export type PrintRow = Record<string, unknown>;

export interface PrintSection {
  heading?: string;
  /** Defaults to the keys of the first row, in order. */
  columns?: PrintColumn[];
  rows: readonly PrintRow[];
  /** Rendered as a bold `<tfoot>` row; an unnamed leading cell reads "Total". */
  totals?: PrintRow;
  emptyMessage?: string;
}

/** A tabular report: what every list and report screen prints. */
export interface PrintReport {
  title: string;
  subtitle?: string;
  /** The filters that produced these rows, so the paper explains itself. */
  filters?: PrintMeta[];
  /** Headline figures, printed as a row of boxes above the table. */
  summary?: PrintMeta[];
  sections: PrintSection[];
  note?: string;
  landscape?: boolean;
  /** Seeds the PDF filename the browser suggests. Defaults to the title. */
  filename?: string;
}

export interface PrintParty {
  heading: string;
  lines: (string | null | undefined)[];
}

export interface PrintTotal {
  label: string;
  value: string;
  strong?: boolean;
}

/** An invoice, voucher or statement: one document about one transaction. */
export interface PrintDocument {
  title: string;
  documentNo: string;
  status?: string;
  meta?: PrintMeta[];
  parties?: PrintParty[];
  section?: PrintSection;
  totals?: PrintTotal[];
  amountInWords?: string;
  note?: string;
  signatures?: string[];
  landscape?: boolean;
  filename?: string;
}

export interface PrintReceiptLine {
  name: string;
  note?: string;
  quantity: number;
  rate: number;
  amount: number;
}

/** An 80mm thermal till receipt. */
export interface PrintReceipt {
  documentNo: string;
  heading?: string;
  meta?: PrintMeta[];
  lines: readonly PrintReceiptLine[];
  totals: PrintTotal[];
  note?: string;
  filename?: string;
}

/** Stamped into the footer of everything printed. */
export interface PrintStamp {
  printedBy?: string;
  printedAt?: Date;
}

/* ------------------------------------------------------------------ *
 * Values
 * ------------------------------------------------------------------ */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

const STAMP_FMT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function numberFormat(decimals: number): Intl.NumberFormat {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

interface ResolvedColumn extends PrintColumn {
  header: string;
  align: PrintAlign;
  format: (value: unknown) => string;
}

/**
 * Decides one shape per column rather than per cell, so a money column keeps
 * its decimals aligned even when some of its values happen to be whole.
 */
function resolveColumns(section: PrintSection): ResolvedColumn[] {
  const declared: PrintColumn[] =
    section.columns ?? Object.keys(section.rows[0] ?? section.totals ?? {}).map((key) => ({ key }));
  const scanned = section.totals ? [...section.rows, section.totals] : section.rows;

  return declared.map((column) => {
    const values = scanned.map((row) => row[column.key]);
    const numbers = values.filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value),
    );
    const numeric =
      numbers.length > 0 &&
      values.every((value) => value == null || value === '' || typeof value === 'number');
    const fmt = numberFormat(numbers.some((n) => Math.abs(n % 1) > 1e-9) ? 2 : 0);

    return {
      ...column,
      header: column.header ?? column.key,
      align: column.align ?? (numeric ? 'right' : 'left'),
      format: (value: unknown) => {
        if (value == null || value === '') return '';
        if (typeof value === 'number') return Number.isFinite(value) ? fmt.format(value) : '';
        if (typeof value === 'boolean') return value ? 'Yes' : 'No';
        return String(value);
      },
    };
  });
}

/* ------------------------------------------------------------------ *
 * Stylesheet — deliberately its own world, not the app's Tailwind build.
 * ------------------------------------------------------------------ */

function pageCss(landscape: boolean): string {
  return `@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 12mm 11mm 13mm; }`;
}

const SHEET = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', ui-sans-serif, system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.45;
    color: #16181d;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .num { font-variant-numeric: tabular-nums; }

  header.letterhead {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16pt;
    padding-bottom: 8pt;
    border-bottom: 1.6pt solid #16181d;
  }
  .brand-name { margin: 0; font-size: 15pt; font-weight: 700; letter-spacing: -0.2pt; }
  .brand-lines { margin: 2pt 0 0; font-size: 8.5pt; color: #5b6070; }
  .brand-lines span + span::before { content: ' \\00b7 '; }
  .doc-head { text-align: right; }
  .doc-title { margin: 0; font-size: 12.5pt; font-weight: 650; }
  .doc-sub { margin: 1.5pt 0 0; font-size: 9pt; color: #5b6070; }
  .doc-no {
    margin: 2pt 0 0;
    font-size: 10pt;
    font-weight: 600;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }
  .status {
    display: inline-block;
    margin-top: 3pt;
    padding: 1pt 6pt;
    border: 0.8pt solid #16181d;
    border-radius: 9pt;
    font-size: 8pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.4pt;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4pt 22pt;
    margin: 8pt 0 0;
    font-size: 9pt;
  }
  .meta dt { display: inline; color: #5b6070; }
  .meta dd { display: inline; margin: 0 0 0 4pt; font-weight: 600; }

  .summary { display: flex; flex-wrap: wrap; gap: 7pt; margin: 10pt 0 0; }
  .summary div {
    flex: 1 1 96pt;
    padding: 5pt 8pt;
    border: 0.7pt solid #d5d8e0;
    border-radius: 4pt;
    background: #f7f8fa;
  }
  .summary dt { margin: 0; font-size: 8pt; color: #5b6070; }
  .summary dd { margin: 1pt 0 0; font-size: 11pt; font-weight: 650; font-variant-numeric: tabular-nums; }

  h2.section { margin: 13pt 0 0; font-size: 10.5pt; font-weight: 650; }

  table { width: 100%; border-collapse: collapse; margin-top: 9pt; font-size: 9pt; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  th, td {
    padding: 4pt 6pt;
    border-bottom: 0.5pt solid #dfe2e8;
    text-align: left;
    vertical-align: top;
  }
  thead th {
    border-bottom: 0.9pt solid #16181d;
    background: #f2f3f6;
    font-size: 8pt;
    font-weight: 650;
    text-transform: uppercase;
    letter-spacing: 0.35pt;
    color: #3a3f4c;
  }
  tbody tr { break-inside: avoid; }
  tbody tr:nth-child(even) td { background: #fafbfc; }
  tfoot td {
    border-top: 0.9pt solid #16181d;
    border-bottom: none;
    background: #f2f3f6;
    font-weight: 700;
  }
  .right { text-align: right; }
  .center { text-align: center; }
  .empty { padding: 14pt; text-align: center; color: #5b6070; font-size: 9pt; }

  .parties { display: flex; gap: 10pt; margin-top: 11pt; }
  .parties section { flex: 1; padding: 6pt 8pt; border: 0.7pt solid #d5d8e0; border-radius: 4pt; }
  .parties h3 {
    margin: 0 0 2pt;
    font-size: 8pt;
    font-weight: 650;
    text-transform: uppercase;
    letter-spacing: 0.4pt;
    color: #5b6070;
  }
  .parties p { margin: 0; font-size: 9.5pt; }
  .parties p:first-of-type { font-weight: 650; }

  .totals { display: flex; justify-content: flex-end; margin-top: 10pt; break-inside: avoid; }
  .totals dl { width: 62mm; margin: 0; border: 0.7pt solid #d5d8e0; border-radius: 4pt; overflow: hidden; }
  .totals .line { display: flex; justify-content: space-between; gap: 10pt; padding: 3.5pt 8pt; font-size: 9.5pt; }
  .totals .line + .line { border-top: 0.5pt solid #e6e8ee; }
  .totals .line dt { color: #3a3f4c; }
  .totals .line dd { margin: 0; font-variant-numeric: tabular-nums; }
  .totals .line.strong { background: #f2f3f6; font-weight: 700; font-size: 10.5pt; }

  .words { margin-top: 8pt; font-size: 9pt; }
  .note { margin-top: 9pt; font-size: 8.5pt; color: #3a3f4c; white-space: pre-line; }

  .signatures { display: flex; gap: 20pt; margin-top: 26pt; break-inside: avoid; }
  .signatures div {
    flex: 1;
    padding-top: 4pt;
    border-top: 0.7pt solid #9aa0ad;
    font-size: 8.5pt;
    color: #3a3f4c;
    text-align: center;
  }

  footer.stamp {
    display: flex;
    justify-content: space-between;
    gap: 12pt;
    margin-top: 14pt;
    padding-top: 5pt;
    border-top: 0.7pt solid #d5d8e0;
    font-size: 7.5pt;
    color: #6b7080;
  }
`;

/* ------------------------------------------------------------------ *
 * Fragments
 * ------------------------------------------------------------------ */

function letterhead(brand: PrintBrand, right: string): string {
  const lines = [brand.address, brand.phone, brand.email]
    .filter((line): line is string => !!line?.trim())
    .map((line) => `<span>${esc(line)}</span>`)
    .join('');
  return `
    <header class="letterhead">
      <div>
        <p class="brand-name">${esc(brand.name)}</p>
        ${lines ? `<p class="brand-lines">${lines}</p>` : ''}
      </div>
      <div class="doc-head">${right}</div>
    </header>`;
}

function metaStrip(meta: readonly PrintMeta[] | undefined): string {
  if (!meta?.length) return '';
  const items = meta
    .map((item) => `<div><dt>${esc(item.label)}</dt><dd>${esc(item.value)}</dd></div>`)
    .join('');
  return `<dl class="meta">${items}</dl>`;
}

function summaryStrip(summary: readonly PrintMeta[] | undefined): string {
  if (!summary?.length) return '';
  const items = summary
    .map((item) => `<div><dt>${esc(item.label)}</dt><dd>${esc(item.value)}</dd></div>`)
    .join('');
  return `<dl class="summary">${items}</dl>`;
}

function alignClass(align: PrintAlign): string {
  return align === 'right' ? ' class="right num"' : align === 'center' ? ' class="center"' : '';
}

function tableSection(section: PrintSection): string {
  const heading = section.heading ? `<h2 class="section">${esc(section.heading)}</h2>` : '';
  if (!section.rows.length && !section.totals) {
    const message = section.emptyMessage ?? 'Nothing to print for this selection.';
    return `${heading}<p class="empty">${esc(message)}</p>`;
  }

  const columns = resolveColumns(section);
  const head = columns
    .map((column) => `<th${alignClass(column.align)}>${esc(column.header)}</th>`)
    .join('');

  const body = section.rows
    .map(
      (row) =>
        `<tr>${columns
          .map(
            (column) =>
              `<td${alignClass(column.align)}>${esc(column.format(row[column.key]))}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('');

  const totals = section.totals;
  const foot = totals
    ? `<tfoot><tr>${columns
        .map((column, index) => {
          const raw = totals[column.key];
          const text =
            raw == null || raw === '' ? (index === 0 ? 'Total' : '') : column.format(raw);
          return `<td${alignClass(column.align)}>${esc(text)}</td>`;
        })
        .join('')}</tr></tfoot>`
    : '';

  return `${heading}<table><thead><tr>${head}</tr></thead>${foot}<tbody>${body}</tbody></table>`;
}

function stampFooter(brand: PrintBrand, stamp: PrintStamp, note?: string): string {
  const when = STAMP_FMT.format(stamp.printedAt ?? new Date());
  const by = stamp.printedBy ? ` by ${stamp.printedBy}` : '';
  return `
    <footer class="stamp">
      <span>${esc(note ?? brand.footerNote ?? brand.name)}</span>
      <span>${esc(`Printed ${when}${by}`)}</span>
    </footer>`;
}

function shell(title: string, landscape: boolean, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${pageCss(landscape)}${SHEET}</style>
</head>
<body>${body}</body>
</html>`;
}

/* ------------------------------------------------------------------ *
 * Documents
 * ------------------------------------------------------------------ */

export function renderReport(report: PrintReport, brand: PrintBrand, stamp: PrintStamp): string {
  const head = `
    <p class="doc-title">${esc(report.title)}</p>
    ${report.subtitle ? `<p class="doc-sub">${esc(report.subtitle)}</p>` : ''}`;

  const body = [
    letterhead(brand, head),
    metaStrip(report.filters),
    summaryStrip(report.summary),
    report.sections.map(tableSection).join(''),
    report.note ? `<p class="note">${esc(report.note)}</p>` : '',
    stampFooter(brand, stamp),
  ].join('');

  return shell(report.filename ?? report.title, !!report.landscape, body);
}

export function renderDocument(doc: PrintDocument, brand: PrintBrand, stamp: PrintStamp): string {
  const head = `
    <p class="doc-title">${esc(doc.title)}</p>
    <p class="doc-no">${esc(doc.documentNo)}</p>
    ${doc.status ? `<p><span class="status">${esc(doc.status)}</span></p>` : ''}`;

  const parties = doc.parties?.length
    ? `<div class="parties">${doc.parties
        .map(
          (party) => `
      <section>
        <h3>${esc(party.heading)}</h3>
        ${party.lines
          .filter((line): line is string => !!line && !!String(line).trim())
          .map((line) => `<p>${esc(line)}</p>`)
          .join('')}
      </section>`,
        )
        .join('')}</div>`
    : '';

  const totals = doc.totals?.length
    ? `<div class="totals"><dl>${doc.totals
        .map(
          (total) => `
      <div class="line${total.strong ? ' strong' : ''}">
        <dt>${esc(total.label)}</dt><dd>${esc(total.value)}</dd>
      </div>`,
        )
        .join('')}</dl></div>`
    : '';

  const signatures = doc.signatures?.length
    ? `<div class="signatures">${doc.signatures.map((label) => `<div>${esc(label)}</div>`).join('')}</div>`
    : '';

  const body = [
    letterhead(brand, head),
    metaStrip(doc.meta),
    parties,
    doc.section ? tableSection(doc.section) : '',
    totals,
    doc.amountInWords
      ? `<p class="words">In words: <strong>${esc(doc.amountInWords)}</strong></p>`
      : '',
    doc.note ? `<p class="note">${esc(doc.note)}</p>` : '',
    signatures,
    stampFooter(brand, stamp),
  ].join('');

  return shell(doc.filename ?? `${doc.title} ${doc.documentNo}`, !!doc.landscape, body);
}

const RECEIPT_SHEET = `
  @page { size: 80mm auto; margin: 3mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    width: 74mm;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, 'Courier New', monospace;
    font-size: 8.5pt;
    line-height: 1.4;
    color: #000;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  h1 { margin: 0; font-size: 12pt; text-align: center; letter-spacing: 0.4pt; }
  .centered { margin: 1mm 0 0; font-size: 7.5pt; text-align: center; }
  .rule { margin: 2mm 0; border-top: 1px dashed #000; }
  .meta div { display: flex; justify-content: space-between; gap: 4mm; font-size: 7.5pt; }
  table { width: 100%; border-collapse: collapse; font-size: 8pt; }
  th { text-align: left; font-weight: 700; border-bottom: 1px solid #000; padding-bottom: 0.6mm; }
  td { padding: 0.5mm 0; vertical-align: top; }
  tr.line td { padding-bottom: 1.2mm; }
  .right { text-align: right; font-variant-numeric: tabular-nums; }
  .item-note { font-size: 7pt; }
  .totals div { display: flex; justify-content: space-between; gap: 4mm; }
  .totals .strong { margin-top: 0.8mm; font-size: 10pt; font-weight: 700; }
  .foot { margin-top: 2mm; text-align: center; font-size: 7.5pt; white-space: pre-line; }
`;

export function renderReceipt(doc: PrintReceipt, brand: PrintBrand, stamp: PrintStamp): string {
  const qtyFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });
  const amountFmt = numberFormat(2);
  const contact = [brand.address, brand.phone].filter((line) => !!line?.trim()).join(' · ');

  const rows = doc.lines
    .map(
      (line) => `
      <tr>
        <td colspan="3">${esc(line.name)}${
          line.note ? `<div class="item-note">${esc(line.note)}</div>` : ''
        }</td>
      </tr>
      <tr class="line">
        <td>${esc(qtyFmt.format(line.quantity))} &times;</td>
        <td class="right">${esc(amountFmt.format(line.rate))}</td>
        <td class="right">${esc(amountFmt.format(line.amount))}</td>
      </tr>`,
    )
    .join('');

  const stamped = `${STAMP_FMT.format(stamp.printedAt ?? new Date())}${
    stamp.printedBy ? ` · ${stamp.printedBy}` : ''
  }`;

  const body = `
    <h1>${esc(brand.name)}</h1>
    ${contact ? `<p class="centered">${esc(contact)}</p>` : ''}
    <p class="centered">${esc(`${doc.heading ?? 'Sales receipt'} · ${doc.documentNo}`)}</p>
    <div class="rule"></div>
    <div class="meta">${(doc.meta ?? [])
      .map((item) => `<div><span>${esc(item.label)}</span><span>${esc(item.value)}</span></div>`)
      .join('')}</div>
    <div class="rule"></div>
    <table>
      <thead><tr><th>Qty</th><th class="right">Rate</th><th class="right">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="rule"></div>
    <div class="totals">${doc.totals
      .map(
        (total) =>
          `<div${total.strong ? ' class="strong"' : ''}><span>${esc(total.label)}</span><span>${esc(
            total.value,
          )}</span></div>`,
      )
      .join('')}</div>
    <div class="rule"></div>
    <p class="foot">${esc(doc.note ?? brand.footerNote ?? 'Thank you for your purchase.')}</p>
    <p class="foot">${esc(stamped)}</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(doc.filename ?? doc.documentNo)}</title>
<style>${RECEIPT_SHEET}</style>
</head>
<body>${body}</body>
</html>`;
}

/* ------------------------------------------------------------------ *
 * Handing it to the browser
 * ------------------------------------------------------------------ */

/**
 * Prints a complete HTML document from a hidden iframe — an iframe rather than
 * a popup so nothing is blocked, and the app keeps its state and scroll.
 */
export function printHtml(html: string): void {
  if (typeof document === 'undefined') return;

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('title', 'Print document');
  frame.tabIndex = -1;
  frame.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  frame.srcdoc = html;

  let removed = false;
  const cleanup = () => {
    if (removed) return;
    removed = true;
    frame.remove();
  };

  frame.addEventListener('load', () => {
    const view = frame.contentWindow;
    if (!view) {
      cleanup();
      return;
    }
    view.addEventListener('afterprint', cleanup, { once: true });
    try {
      view.focus();
      view.print();
    } catch {
      cleanup();
      return;
    }
    // Safari never fires `afterprint` from a frame; sweep up regardless.
    setTimeout(cleanup, 60_000);
  });

  document.body.appendChild(frame);
}
