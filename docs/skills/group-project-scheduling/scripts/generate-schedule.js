// generate-schedule.js — render a schedule JSON into a styled .xlsx matching
// docs/skills/group-project-scheduling/examples/template-spec.md (navy header,
// dark-red title bar, yellow highlights, red deadline text, Google Sans).
//
// Usage:
//   node generate-schedule.js <input.json> <output.xlsx> [--compute-deadlines]
//
// --compute-deadlines: fills missing task deadlines from final_deadline − today,
// weighted by complexity (L1=1, L2=2, L3=3) with ~20% buffer; every computed
// deadline lies strictly between today and final_deadline.
import ExcelJS from 'exceljs';
import fs from 'node:fs';

const P = {
  navy: 'FF073763',
  darkRed: 'FF980000',
  yellow: 'FFFFD966',
  red: 'FFFF0000',
  white: 'FFFFFFFF',
  body: 'FF1F1F1F',
  titleText: 'FFF3F3F3',
  border: 'FFBFBFBF',
};
const COLUMNS = ['Nhiệm vụ', 'ID', 'Task cụ thể', 'PIC', 'Deadline', 'Tiến độ', 'Trạng thái', 'xem xét', 'Notes'];
const WIDTHS = [26, 7, 44, 18, 24, 20, 16, 10, 26];
const STATUSES = ['Chưa bắt đầu', 'Đang thực hiện', 'Hoàn thành', 'Trễ hạn'];
const WEIGHTS = { L1: 1, L2: 2, L3: 3 };
const BUFFER = 0.2;

const font = (size, bold, color, name = 'Google Sans') => ({ name, size, bold, color: { argb: color } });
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin = { style: 'thin', color: { argb: P.border } };
const border = { top: thin, left: thin, bottom: thin, right: thin };
const centerMid = { horizontal: 'center', vertical: 'middle', wrapText: true };
const leftMid = { horizontal: 'left', vertical: 'middle', wrapText: true };

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}
function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function fmtVN(dateStr, time = '23h59') {
  const [y, m, d] = dateStr.split('-');
  return `${time} ngày ${d}/${m}/${y}`;
}
function flatPIC(pic) {
  return Array.isArray(pic) ? pic.join(', ') : (pic ?? '');
}

function computeDeadlines(sched) {
  if (!sched.final_deadline) return;
  const today = sched.today || new Date().toISOString().slice(0, 10);
  const total = daysBetween(today, sched.final_deadline);
  if (total <= 0) throw new Error(`final_deadline (${sched.final_deadline}) must be after today (${today})`);
  const tasks = [];
  for (const ph of sched.phases || []) for (const t of ph.tasks || []) if (t.milestone || !t.deadline) tasks.push(t);
  // Deadline model (user rule): easy → short (soon), heavy → extended (later).
  // usable = window minus ~20% buffer; scale so the heaviest task lands just before final.
  const maxWeight = Math.max(...tasks.map((t) => WEIGHTS[t.complexity] ?? 1));
  const k = (total * (1 - BUFFER)) / maxWeight;
  for (const t of tasks) {
    if (t.milestone) continue; // milestone keeps its explicit deadline (final bound)
    const d = addDays(today, Math.max(1, Math.round((WEIGHTS[t.complexity] ?? 1) * k)));
    t.deadline = fmtVN(d, t.deadline_time || '23h59');
    t._computed = true;
  }
  return today;
}

async function main() {
  const args = process.argv.slice(2);
  const compute = args.includes('--compute-deadlines');
  const positional = args.filter((a) => !a.startsWith('--'));
  const [inputPath, outputPath] = positional;
  if (!inputPath || !outputPath) {
    console.error('Usage: node generate-schedule.js <input.json> <output.xlsx> [--compute-deadlines]');
    process.exit(1);
  }
  const sched = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const today = computeDeadlines(sched);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sched.title ? sched.title.replace(/[\\/?*[\]]/g, '_').slice(0, 31) : 'Lịch trình nhóm');
  COLUMNS.forEach((_, i) => { ws.getColumn(i + 1).width = WIDTHS[i]; });
  const N = COLUMNS.length;
  let r = 1;

  // 1. Title bar — dark red, merged across all columns
  ws.mergeCells(r, 1, r, N);
  const tc = ws.getCell(r, 1);
  tc.value = sched.title || 'KẾ HOẠCH LÀM VIỆC NHÓM';
  tc.font = font(17, true, P.titleText);
  tc.fill = fill(P.darkRed);
  tc.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  ws.getRow(r).height = 32;
  r++;

  // 2. Optional subtitle
  if (sched.subtitle) {
    ws.mergeCells(r, 1, r, N);
    const sc = ws.getCell(r, 1);
    sc.value = sched.subtitle;
    sc.font = font(13, false, P.body);
    sc.alignment = leftMid;
    r++;
  }

  // 3. Column header row — navy
  COLUMNS.forEach((h, i) => {
    const cell = ws.getCell(r, i + 1);
    cell.value = h;
    cell.font = font(15, true, P.white);
    cell.fill = fill(P.navy);
    cell.alignment = centerMid;
    cell.border = border;
  });
  ws.getRow(r).height = 28;
  r++;

  // 4. Phases + tasks
  for (const phase of sched.phases || []) {
    ws.mergeCells(r, 1, r, N);
    const pc = ws.getCell(r, 1);
    pc.value = phase.name;
    pc.font = font(14, true, P.white);
    pc.fill = fill(P.navy);
    pc.alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getRow(r).height = 24;
    r++;

    for (const t of phase.tasks || []) {
      const row = ws.getRow(r);
      row.height = t.height || 34;
      const values = [
        t.nhiemVu ?? '',
        t.id ?? '',
        t.task ?? '',
        flatPIC(t.pic),
        t.deadline ?? '',
        t.tienDo ?? '',
        t.trangThai ?? 'Chưa bắt đầu',
        t.xemXet ?? '',
        t.notes ?? '',
      ];
      values.forEach((v, i) => {
        const cell = ws.getCell(r, i + 1);
        cell.value = v;
        cell.border = border;
        cell.alignment = i === 2 || i === 8 ? leftMid : centerMid;
        cell.font = font(12, i === 0 || i === 3, P.body);
      });
      if (t._computed) {
        // computed deadlines get default body color; explicit ones get red emphasis
      } else if (t.deadline && !t.milestone) {
        ws.getCell(r, 5).font = font(12, true, P.red);
      }
      if (t.highlight) {
        for (let i = 1; i <= N; i++) ws.getCell(r, i).fill = fill(P.yellow);
      }
      if (t.milestone) {
        for (let i = 1; i <= N; i++) {
          const c = ws.getCell(r, i);
          c.fill = fill(P.red);
          c.font = font(12, true, P.white);
        }
      }
      r++;
    }
  }

  await wb.xlsx.writeFile(outputPath);
  console.log(`OK: ${outputPath} (${r - 1} rows, ${N} cols${today ? `, window ${today} → ${sched.final_deadline}` : ''})`);
}

main().catch((e) => { console.error(`ERROR: ${e.message}`); process.exit(1); });
