// Temp verification for KTL schedule (7-col variant) + regression (9-col default)
const ExcelJS = require('exceljs');
const ROOT = 'D:/Tools/Fork-Deepseek-Agentic-CLI/Deepseek-Agentic-CLI/work_dir/Schedule/';
const fails = [];
const ok = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + ' | ' + msg); if (!cond) fails.push(msg); };

(async () => {
  // ---- KTL file ----
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(ROOT + 'KTL_KeHoach_Nhom.xlsx');
  const ws = wb.worksheets[0];

  const title = ws.getRow(1).getCell(1).value;
  const tfill = ws.getRow(1).getCell(1).fill.fgColor?.argb;
  ok(String(title).includes('KẾ HOẠCH LÀM VIỆC NHÓM — KINH TẾ LƯỢNG'), 'Title bar text: ' + title);
  ok(tfill === 'FF980000', 'Title fill dark-red FF980000: ' + tfill);

  const header = [1, 2, 3, 4, 5, 6, 7].map((i) => ws.getRow(3).getCell(i).value).join('|');
  ok(header === 'Nhiệm vụ|ID|Task cụ thể|PIC|Deadline|Tiến độ|Notes', 'Header 7 cột: ' + header);
  ok(ws.getRow(3).getCell(1).fill.fgColor?.argb === 'FF073763', 'Header fill navy FF073763');

  let phaseCount = 0, taskCount = 0, emptyDeadline = true, emptyTienDo = true;
  let id1Yellow = false, id14Red = false, taskLeft = true, picCenter = true, milestoneWhite = false;
  ws.eachRow((row) => {
    const c1 = row.getCell(1).value;
    if (typeof c1 === 'string' && c1.startsWith('Giai đoạn')) phaseCount++;
    const id = row.getCell(2).value;
    if (id !== null && id !== undefined && id !== '') {
      taskCount++;
      const d = row.getCell(5).value, td = row.getCell(6).value;
      if (d !== null && d !== undefined && d !== '') emptyDeadline = false;
      if (td !== null && td !== undefined && td !== '') emptyTienDo = false;
      const f1 = row.getCell(1).fill?.fgColor?.argb;
      if (String(id) === '1' && f1 === 'FFFFD966') id1Yellow = true;
      if (String(id) === '14') {
        if (f1 === 'FFFF0000') id14Red = true;
        const f5 = row.getCell(5).fill?.fgColor?.argb;
        const fw = row.getCell(5).font?.color?.argb;
        if (f5 === 'FFFF0000' && fw === 'FFFFFFFF') milestoneWhite = true;
      }
      if (row.getCell(3).alignment?.horizontal !== 'left') taskLeft = false;
      if (row.getCell(4).alignment?.horizontal !== 'center') picCenter = false;
    }
  });
  ok(phaseCount === 4, '4 phase header rows: ' + phaseCount);
  ok(taskCount === 14, '14 task rows: ' + taskCount);
  ok(emptyDeadline, 'Mọi ô cột Deadline để trống');
  ok(emptyTienDo, 'Mọi ô cột Tiến độ để trống');
  ok(id1Yellow, 'Row ID 1 (highlight) fill vàng FFFFD966');
  ok(id14Red, 'Row ID 14 (milestone) fill đỏ FFFF0000');
  ok(milestoneWhite, 'Row ID 14 chữ trắng đậm');
  ok(taskLeft, 'Cột Task cụ thể căn trái');
  ok(picCenter, 'Cột PIC căn giữa');

  // ---- Regression: default 9-col path ----
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.readFile(ROOT + '_regression_check.xlsx');
  const ws2 = wb2.worksheets[0];
  const h9 = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => ws2.getRow(3).getCell(i).value).join('|');
  ok(h9 === 'Nhiệm vụ|ID|Task cụ thể|PIC|Deadline|Tiến độ|Trạng thái|xem xét|Notes', 'Regression: header 9 cột mặc định: ' + h9);

  console.log(fails.length ? `\n${fails.length} CHECK(S) FAILED` : '\nALL CHECKS PASSED ✔');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message); process.exit(2); });
