const escapeCsvField = (value) => {
  console.log('🔍 [DEBUG-SERVICE-CSVEXPORT] escapeCsvField() — value:', value);
  const str = value === null || value === undefined ? '' : String(value);
  let resultado;
  if (/[",\n\r]/.test(str)) {
    resultado = `"${str.replace(/"/g, '""')}"`;
  } else {
    resultado = str;
  }
  console.log('✅ [DEBUG-SERVICE-CSVEXPORT] escapeCsvField() — resultado:', resultado);
  return resultado;
};

// columns: [{ label: string, value: (row) => any }]
export const rowsToCsv = (columns, rows) => {
  console.log('🔍 [DEBUG-SERVICE-CSVEXPORT] rowsToCsv() — columns:', columns?.map(c => c.label), 'cantidad de filas recibidas:', rows?.length);
  try {
    const header = columns.map(c => escapeCsvField(c.label)).join(',');
    const lines = rows.map(row => columns.map(c => escapeCsvField(c.value(row))).join(','));
    console.log('🔍 [DEBUG-SERVICE-CSVEXPORT] rowsToCsv() — cantidad de líneas generadas (sin header):', lines.length);

    const resultado = [header, ...lines].join('\r\n');
    console.log('✅ [DEBUG-SERVICE-CSVEXPORT] rowsToCsv() — cantidad de filas resultantes en el CSV:', lines.length, '— longitud total del string CSV:', resultado.length);
    return resultado;
  } catch (err) {
    console.error('❌ [DEBUG-SERVICE-CSVEXPORT] rowsToCsv() — error:', err?.message, err?.stack);
    throw err;
  }
};

const UTF8_BOM = '﻿';

// Antepone el BOM UTF-8 (para que Excel detecte tildes/eñes correctamente) y
// setea los headers de descarga. Llamar UNA sola vez por respuesta.
export const sendCsv = (res, filename, csvContent) => {
  console.log('🔍 [DEBUG-SERVICE-CSVEXPORT] sendCsv() — filename:', filename, 'longitud de csvContent:', csvContent?.length);
  try {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    console.log('✅ [DEBUG-SERVICE-CSVEXPORT] sendCsv() — enviando respuesta 200 con CSV, filename:', filename);
    res.status(200).send(UTF8_BOM + csvContent);
  } catch (err) {
    console.error('❌ [DEBUG-SERVICE-CSVEXPORT] sendCsv() — error:', err?.message, err?.stack);
    throw err;
  }
};
