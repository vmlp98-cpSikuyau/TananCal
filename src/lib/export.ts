export interface TableData {
  title: string;
  subtitle?: string;
  columns: string[];
  rows: string[][];
}

export function safeFilename(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'export';
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportExcel(t: TableData, filename: string) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(t.title.slice(0, 31).replace(/[\\/?*[\]:]/g, ' ') || 'Export');
  ws.addRow([t.title]).font = { bold: true, size: 14 };
  if (t.subtitle) ws.addRow([t.subtitle]);
  ws.addRow([]);
  const head = ws.addRow(t.columns);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1E36' } }; });
  t.rows.forEach((r) => ws.addRow(r));
  ws.columns.forEach((col, i) => {
    const longest = Math.max(t.columns[i]?.length ?? 0, ...t.rows.map((r) => (r[i] ?? '').length));
    col.width = Math.min(60, Math.max(12, longest + 2));
  });
  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${filename}.xlsx`);
}

export async function exportPdf(t: TableData, filename: string) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: t.columns.length > 4 ? 'landscape' : 'portrait', unit: 'pt', format: 'letter' });
  doc.setFontSize(16);
  doc.text(t.title, 40, 48);
  if (t.subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(90);
    doc.text(t.subtitle, 40, 66);
  }
  autoTable(doc, {
    startY: t.subtitle ? 80 : 64,
    head: [t.columns],
    body: t.rows,
    headStyles: { fillColor: [11, 30, 54] },
    styles: { fontSize: 10 },
    margin: { left: 40, right: 40 },
  });
  doc.save(`${filename}.pdf`);
}

export async function exportPng(node: HTMLElement, filename: string) {
  const { toBlob } = await import('html-to-image');
  const blob = await toBlob(node, { pixelRatio: 2, backgroundColor: '#ffffff' });
  if (!blob) throw new Error('Could not render the image.');
  download(blob, `${filename}.png`);
}

/** Whole-group backups (FR-S2). */
export function exportJson(data: unknown, filename: string) {
  download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${filename}.json`);
}

function csvCell(v: string): string {
  // Neutralise spreadsheet formula injection as well as quoting.
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: string[], rows: string[][]): string {
  return [columns, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export function exportCsv(columns: string[], rows: string[][], filename: string) {
  download(new Blob(['﻿' + toCsv(columns, rows)], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`);
}
