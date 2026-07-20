'use strict';
const ExcelJS = require('exceljs');

const COLS = [
  { header: 'PATIENT',      key: 'patient',     width: 24 },
  { header: 'BED',          key: 'bed',         width: 9  },
  { header: 'SMO & DOA',    key: 'smoDoa',      width: 13 },
  { header: 'POD',          key: 'pod',         width: 5  },
  { header: 'PROBLEM LIST', key: 'problemList', width: 32 },
  { header: 'BACKGROUND',   key: 'background',  width: 24 },
  { header: 'RESULTS',      key: 'results',     width: 24 },
  { header: 'PLAN',         key: 'plan',        width: 24 },
];

const YELLOW     = 'FFFFFF00';
const THIN       = { style: 'thin', color: { argb: 'FF000000' } };
const ALL_BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

async function buildSurgWorkbook(patients) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Handover', { views: [{ state: 'frozen', ySplit: 1 }] });

  ws.columns = COLS.map(c => ({ header: c.header, key: c.key, width: c.width }));

  const hdr = ws.getRow(1);
  hdr.height = 26;
  hdr.eachCell((cell, colNum) => {
    cell.value     = COLS[colNum - 1].header;
    cell.font      = { bold: true, size: 10 };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
    cell.border    = ALL_BORDER;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });

  for (const p of patients) {
    const surname   = (p.lastName  || '').toUpperCase();
    const given     = [p.firstName, p.middleName].filter(Boolean).join(' ');
    const nameLine  = surname && given ? surname + ', ' + given : surname || given || '(unknown)';
    const titleStr  = p.title ? ' (' + p.title + ')' : '';
    const ageSex    = [p.age, p.gender].filter(Boolean).join('');
    const patientVal = [nameLine + titleStr, ageSex, p.nhi || ''].filter(Boolean).join('\n');

    const bedVal    = ['Surg', p.bed || ''].filter(Boolean).join('\n');
    const smoDoaVal = [p.smo || '', (p.doa || '').split(' ')[0]].filter(Boolean).join('\n');

    const row = ws.addRow({
      patient:     patientVal,
      bed:         bedVal,
      smoDoa:      smoDoaVal,
      pod:         p.pod || '',
      problemList: p.problemList || '',
      background:  p.background  || '',
      results:     p.results     || '',
      plan:        p.plan        || '',
    });

    row.height = 60;
    row.eachCell(cell => {
      cell.alignment = { wrapText: true, vertical: 'top' };
      cell.border    = ALL_BORDER;
      cell.font      = { size: 10 };
    });
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { buildSurgWorkbook };
