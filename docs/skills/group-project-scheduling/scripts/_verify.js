// _verify.js — T4 verification: generate example-output.xlsx, read it back, assert the
// template-spec styling contract + deadline-anchoring rules. Exit code 0 = all pass.
import { execFileSync } from 'node:child_process';
import ExcelJS from 'exceljs';
import fs from 'node:fs';

const OUT = 'example-output.xlsx';
const INPUT = 'example-input.json';
execFileSync(process.execPath, ['generate-schedule.js', INPUT, OUT, '--compute-deadlines'], { stdio: 'inherit' });

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(OUT);
const ws = wb.worksheets[0];
const sched = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
const checks = [];
const ok = (name, cond) => { checks.push([name, !!cond]); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); };

const headerRow = sched.subtitle ? 3 : 2;
const today = new Date('2026-05-01');
const fin = new Date('2026-05-29');

// --- palette ---
ok('title bar dark-red fill', ws.getCell('A1').fill?.fgColor?.argb === 'FF980000');
ok('title bar merged A1:I1', ws.getCell('A1').isMerged === true && ws.getCell('I1').isMerged === true);
ok('header row navy fill', ws.getCell(`A${headerRow}`).fill?.fgColor?.argb === 'FF073763');
ok('header row white bold', ws.getCell(`A${headerRow}`).font?.bold === true && ws.getCell(`A${headerRow}`).font?.color?.argb === 'FFFFFFFF');
ok('9 column headers', Array.from({ length: 9 }, (_, i) => ws.getCell(headerRow, i + 1).value).every(Boolean));

// --- merges for phase rows (navy, full width) ---
let phaseCount = 0;
ws.eachRow((row, r) => {
  if (r <= headerRow) return;
  const a = row.getCell(1);
  if (a.fill?.fgColor?.argb === 'FF073763' && a.isMerged && ws.getCell(r, 9).isMerged) phaseCount++;
});
ok(`>=3 merged phase rows (got ${phaseCount})`, phaseCount >= 3);

// --- highlight + milestone ---
let yellow = 0, red = 0;
ws.eachRow((row) => {
  const a = row.getCell(1);
  if (a.fill?.fgColor?.argb === 'FFFFD966') yellow++;
  if (a.fill?.fgColor?.argb === 'FFFF0000') red++;
});
ok('yellow highlight row(s) present', yellow >= 1);
ok('red milestone row(s) present', red >= 1);

// --- deadline anchoring: id -> complexity, parse each data-row deadline date ---
const idComplex = {};
const computedIds = []; // tasks WITHOUT explicit deadline → generator computed them
for (const ph of sched.phases) for (const t of ph.tasks) {
  idComplex[String(t.id)] = t.complexity;
  if (!t.deadline && !t.milestone) computedIds.push(String(t.id));
}
const deadlines = {}; // id -> {date, complexity}
ws.eachRow((row, r) => {
  if (r <= headerRow) return;
  const a = row.getCell(1);
  if (a.fill?.fgColor?.argb === 'FF073763') return; // phase rows
  const id = String(row.getCell(2).value ?? '');
  const dl = String(row.getCell(5).value ?? '');
  const m = dl.match(/ngày (\d{2})\/(\d{2})\/(\d{4})/);
  if (m) deadlines[id] = { date: new Date(`${m[3]}-${m[2]}-${m[1]}`), complexity: idComplex[id] };
});
const ids = Object.keys(deadlines);
ok('every task got a deadline', ids.length === Object.keys(idComplex).length);
ok('all deadlines inside today..final', ids.every((id) => deadlines[id].date >= today && deadlines[id].date <= fin));
const l3 = ids.filter((id) => deadlines[id].complexity === 'L3').map((id) => deadlines[id].date);
const l1 = ids.filter((id) => deadlines[id].complexity === 'L1').map((id) => deadlines[id].date);
ok('L3 windows >= L1 windows', l3.length && l1.length && Math.min(...l3) >= Math.max(...l1));
const l3Dates = ids.filter((id) => deadlines[id].complexity === 'L3').map((id) => deadlines[id].date.getTime());
const l2Dates = ids.filter((id) => deadlines[id].complexity === 'L2').map((id) => deadlines[id].date.getTime());
ok('L2 windows >= L1 windows', l2Dates.length && l1.length && Math.min(...l2Dates) >= Math.max(...l1));
ok('no computed deadline inside final 48h (>= final-2d)', computedIds.every((id) => deadlines[id] && deadlines[id].date <= new Date('2026-05-27')));
// explicit deadline (milestone id 12) exactly at final
ok('milestone deadline at final', deadlines['12'] && deadlines['12'].date.getTime() === fin.getTime());

// --- column widths ---
ok('col A width ~26', Math.abs((ws.getColumn(1).width ?? 0) - 26) < 0.5);
ok('col C width ~44', Math.abs((ws.getColumn(3).width ?? 0) - 44) < 0.5);
ok('col E width ~24', Math.abs((ws.getColumn(5).width ?? 0) - 24) < 0.5);

// --- statuses from allowed set ---
const allowed = new Set(['Chưa bắt đầu', 'Đang thực hiện', 'Hoàn thành', 'Trễ hạn']);
let statusOK = true;
ws.eachRow((row, r) => {
  if (r <= headerRow) return;
  const a = row.getCell(1);
  if (a.fill?.fgColor?.argb === 'FF073763') return;
  const st = String(row.getCell(7).value ?? '');
  if (st && !allowed.has(st)) statusOK = false;
});
ok('statuses from allowed set', statusOK);

fs.rmSync(OUT, { force: true });
const fails = checks.filter((c) => !c[1]);
console.log(`\n${checks.length - fails.length}/${checks.length} checks passed`);
process.exit(fails.length ? 1 : 0);
