/**
 * Report export helpers — PDF §4-A7 "Export options: PDF / XLS".
 *
 * Shares the same {key, label, formatter} column contract as exportCsv.js, so a
 * table defines its columns once and can be exported to any of the three formats.
 *
 * jsPDF and SheetJS are imported dynamically: both are browser-only and heavy,
 * and this keeps them out of the initial page bundle (and out of SSR, where
 * `window` does not exist).
 */

/** Resolve one cell the same way exportToCSV does, so formats never disagree. */
function cellValue(row, col) {
  const raw = row[col.key];
  if (col.formatter) return col.formatter(raw, row);
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "object") return JSON.stringify(raw);
  return raw;
}

function ensureRows(rows) {
  if (!rows || rows.length === 0) {
    alert("No records to export");
    return false;
  }
  return true;
}

/**
 * Export rows to a real .xlsx workbook.
 *
 * @param {Array<Object>} rows
 * @param {Array<{key:string,label:string,formatter?:Function}>} columns
 * @param {string} filename
 * @param {Object} [options]
 * @param {string} [options.sheetName]
 * @param {Array<Array<any>>} [options.summaryRows] - key/value lines written above the table
 * @param {Array<{name:string,columns:Array,rows:Array}>} [options.extraSheets]
 */
export async function exportToXLS(rows, columns, filename = "export.xlsx", options = {}) {
  if (!ensureRows(rows)) return;

  const XLSX = await import("xlsx");
  const { sheetName = "Report", summaryRows = [], extraSheets = [] } = options;

  const header = columns.map((c) => c.label || c.key);
  const body = rows.map((row) => columns.map((col) => cellValue(row, col)));

  // Summary block (filters, KPIs) sits above the table, then a blank spacer row.
  const aoa = summaryRows.length > 0 ? [...summaryRows, [], header, ...body] : [header, ...body];

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = header.map((h, i) => ({
    wch: Math.min(
      40,
      Math.max(String(h).length + 2, ...body.map((r) => String(r[i] ?? "").length + 2), 10)
    ),
  }));

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31));

  for (const extra of extraSheets) {
    if (!extra.rows || extra.rows.length === 0) continue;
    const extraHeader = extra.columns.map((c) => c.label || c.key);
    const extraBody = extra.rows.map((row) => extra.columns.map((col) => cellValue(row, col)));
    const extraSheet = XLSX.utils.aoa_to_sheet([extraHeader, ...extraBody]);
    XLSX.utils.book_append_sheet(book, extraSheet, extra.name.slice(0, 31));
  }

  const clean = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  XLSX.writeFile(book, clean);
}

/**
 * Export rows to a paginated, branded PDF table.
 *
 * @param {Array<Object>} rows
 * @param {Array<{key:string,label:string,formatter?:Function}>} columns
 * @param {string} filename
 * @param {Object} [options]
 * @param {string} [options.title]
 * @param {string} [options.subtitle]
 * @param {Array<[string,string]>} [options.meta]    - filter/KPI lines under the title
 * @param {Array<{name:string,columns:Array,rows:Array}>} [options.extraTables]
 * @param {"portrait"|"landscape"} [options.orientation]
 */
export async function exportToPDF(rows, columns, filename = "export.pdf", options = {}) {
  if (!ensureRows(rows)) return;

  const { jsPDF } = await import("jspdf");
  const autoTableModule = await import("jspdf-autotable");
  const autoTable = autoTableModule.default || autoTableModule.autoTable;

  const {
    title = "DealFlow360 Report",
    subtitle = "",
    meta = [],
    extraTables = [],
    orientation = "landscape",
  } = options;

  const doc = new jsPDF({ orientation, unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const BRAND = [113, 75, 103]; // #714B67

  // ── Header band ──
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, pageWidth, 54, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, 40, 26);
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(subtitle, 40, 42);
  }
  doc.setFontSize(8);
  doc.text(`Generated ${new Date().toLocaleString()}`, pageWidth - 40, 26, { align: "right" });

  let cursorY = 74;

  // ── Applied filters / KPI block ──
  if (meta.length > 0) {
    doc.setTextColor(73, 80, 87);
    doc.setFontSize(9);
    const midpoint = Math.ceil(meta.length / 2);
    meta.forEach(([label, value], i) => {
      const col = i < midpoint ? 0 : 1;
      const rowIdx = i < midpoint ? i : i - midpoint;
      const x = 40 + col * (pageWidth / 2 - 40);
      const y = cursorY + rowIdx * 14;
      doc.setFont("helvetica", "bold");
      doc.text(`${label}:`, x, y);
      doc.setFont("helvetica", "normal");
      doc.text(String(value), x + 110, y);
    });
    cursorY += midpoint * 14 + 12;
  }

  const tableStyles = {
    headStyles: { fillColor: BRAND, textColor: 255, fontSize: 8, fontStyle: "bold" },
    bodyStyles: { fontSize: 7.5, textColor: [33, 37, 41] },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    styles: { cellPadding: 4, overflow: "linebreak" },
    margin: { left: 40, right: 40 },
  };

  autoTable(doc, {
    startY: cursorY,
    head: [columns.map((c) => c.label || c.key)],
    body: rows.map((row) => columns.map((col) => String(cellValue(row, col)))),
    ...tableStyles,
  });

  for (const extra of extraTables) {
    if (!extra.rows || extra.rows.length === 0) continue;
    const lastY = doc.lastAutoTable?.finalY ?? cursorY;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BRAND);
    doc.text(extra.name, 40, lastY + 26);
    autoTable(doc, {
      startY: lastY + 34,
      head: [extra.columns.map((c) => c.label || c.key)],
      body: extra.rows.map((row) => extra.columns.map((col) => String(cellValue(row, col)))),
      ...tableStyles,
    });
  }

  // ── Page numbers ──
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(108, 117, 125);
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth - 40,
      doc.internal.pageSize.getHeight() - 20,
      { align: "right" }
    );
    doc.text("DealFlow360", 40, doc.internal.pageSize.getHeight() - 20);
  }

  const clean = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  doc.save(clean);
}
