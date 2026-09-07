const escapeCsvField = (value) => {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

// columns: [{ label: string, value: (row) => any }]
export const rowsToCsv = (columns, rows) => {
  const header = columns.map(c => escapeCsvField(c.label)).join(',');
  const lines = rows.map(row => columns.map(c => escapeCsvField(c.value(row))).join(','));
  return [header, ...lines].join('\r\n');
};

const UTF8_BOM = '﻿';

// Antepone el BOM UTF-8 (para que Excel detecte tildes/eñes correctamente) y
// setea los headers de descarga. Llamar UNA sola vez por respuesta.
export const sendCsv = (res, filename, csvContent) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(UTF8_BOM + csvContent);
};
