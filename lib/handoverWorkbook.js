'use strict';
const ExcelJS = require('exceljs');

const COLUMNS = [
  { header: '', key: 'coverage', width: 12 },
  { header: 'Name', key: 'name', width: 20 },
  { header: 'NHI', key: 'nhi', width: 10 },
  { header: 'Location', key: 'location', width: 12 },
  { header: 'GOC', key: 'goc', width: 6 },
  { header: 'Current Diagnosis', key: 'diagnosis', width: 28 },
  { header: 'Assessment', key: 'assessment', width: 34 },
  { header: 'Tasks', key: 'tasks', width: 26 },
  { header: 'Background', key: 'background', width: 20 },
];

const WRAP_KEYS = new Set(['diagnosis', 'assessment', 'tasks', 'background']);
const PATIENT_LEVEL_COLS = [1, 2, 3, 4, 5, 6, 7, 9]; // all columns except Tasks (col 8)

// patients: array of { firstName, lastName, nhi, ward, bed, sgoc, coverage,
// diagnosis, assessment, background, jobs: [{ text, done }] }
async function buildHandoverWorkbook(patients) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Handover', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = COLUMNS.map(c => ({ header: c.header, key: c.key, width: c.width }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
    cell.border = { bottom: { style: 'thin' } };
  });

  patients.forEach(p => {
    const pendingTasks = (p.jobs || []).filter(j => !j.done).map(j => j.text || '');
    const taskRows = pendingTasks.length > 0 ? pendingTasks : [''];
    const startRowNumber = sheet.rowCount + 1;

    taskRows.forEach((taskText, i) => {
      const row = sheet.addRow({
        coverage: i === 0 ? (p.coverage || '') : '',
        name: i === 0 ? `${p.lastName || ''}, ${p.firstName || ''}` : '',
        nhi: i === 0 ? (p.nhi || '') : '',
        location: i === 0 ? `${p.ward || ''} ${p.bed || ''}`.trim() : '',
        goc: i === 0 ? (p.sgoc || '') : '',
        diagnosis: i === 0 ? (p.diagnosis || '') : '',
        assessment: i === 0 ? (p.assessment || '') : '',
        tasks: taskText,
        background: i === 0 ? (p.background || '') : '',
      });
      row.eachCell((cell, colNumber) => {
        const key = COLUMNS[colNumber - 1] && COLUMNS[colNumber - 1].key;
        cell.alignment = {
          wrapText: key ? WRAP_KEYS.has(key) : false,
          vertical: 'top',
        };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
      });
    });

    const endRowNumber = sheet.rowCount;
    if (endRowNumber > startRowNumber) {
      PATIENT_LEVEL_COLS.forEach(col => sheet.mergeCells(startRowNumber, col, endRowNumber, col));
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

module.exports = { buildHandoverWorkbook };
