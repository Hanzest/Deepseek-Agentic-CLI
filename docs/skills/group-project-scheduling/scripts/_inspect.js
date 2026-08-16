// TEMP inspection script (T0): dump structure + styling of the sample .xlsx templates.
// Usage: node scripts/_inspect.js <file1.xlsx> [file2.xlsx ...]
// Writes UTF-8 report to _t0-dump.txt in CWD.
import ExcelJS from 'exceljs';
import fs from 'node:fs';

function fillOf(cell) {
  const f = cell.fill;
  if (!f || f.type !== 'pattern') return 'NONE';
  if (f.pattern === 'solid') return (f.fgColor && f.fgColor.argb) || 'NONE';
  return (f.bgColor && f.bgColor.argb) || 'NONE';
}
function fontCol(cell) {
  return (cell.font && cell.font.color && cell.font.color.argb) || 'NONE';
}
function cellText(cell) {
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((r) => r.text).join('');
    if (v.text != null) return String(v.text);
    if (v.result != null) return String(v.result);
    return JSON.stringify(v).slice(0, 60);
  }
  return String(v);
}

const out = [];
const files = process.argv.slice(2);
for (const file of files) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  out.push(`===== ${file} =====`);
  for (const ws of wb.worksheets) {
    out.push(`--- SHEET: ${ws.name} | rows=${ws.rowCount} cols=${ws.columnCount}`);
    const widths = [];
    ws.columns.forEach((col, i) => widths.push(`${String.fromCharCode(65 + i)}=${col.width ?? 'auto'}`));
    out.push(`COLWIDTH: ${widths.join(', ')}`);
    const merges = (ws.model.merges || []).map((m) => JSON.stringify(m));
    out.push(`MERGES(${merges.length}): ${merges.slice(0, 40).join(' | ')}`);
    const fills = new Set();
    const fontCols = new Set();
    let rowsPrinted = 0;
    ws.eachRow((row, r) => {
      if (r > 40 || rowsPrinted >= 60) return;
      const rh = row.height;
      let rowHasContent = false;
      const cellsOut = [];
      row.eachCell({ includeEmpty: false }, (cell, c) => {
        if (c > 14) return;
        const v = cellText(cell).replace(/\n/g, '\\n');
        const fi = fillOf(cell);
        const fc = fontCol(cell);
        if (fi !== 'NONE') fills.add(fi);
        if (fc !== 'NONE') fontCols.add(fc);
        const isMerged = cell.isMerged === true;
        const master = isMerged && cell.master ? `${cell.master.row},${cell.master.col}` : '';
        const f = cell.font || {};
        const a = cell.alignment || {};
        cellsOut.push(
          `c${c}: '${v.slice(0, 70)}'${isMerged ? ' [M->' + master + ']' : ''} | font=${f.name ?? ''},${f.size ?? ''},b=${f.bold ?? ''},col=${fc} | fill=${fi} | wrap=${a.wrapText ?? ''} | h=${a.horizontal ?? ''}/v=${a.vertical ?? ''}`
        );
        if (v !== '' || fi !== 'NONE' || fc !== 'NONE') rowHasContent = true;
      });
      if (rowHasContent) {
        rowsPrinted++;
        out.push(`r${r} [h=${rh ?? ''}]: ${cellsOut.join(' || ')}`);
      }
    });
    out.push(`DISTINCT FILLS: ${[...fills].join(', ')}`);
    out.push(`DISTINCT FONT COLORS: ${[...fontCols].join(', ')}`);
  }
}
fs.writeFileSync('_t0-dump.txt', out.join('\n'), 'utf8');
console.log(`Wrote ${out.length} lines to _t0-dump.txt`);
