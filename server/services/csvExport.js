// Excel interpreta el separador de listas de un .csv según la configuración
// regional de Windows, NO según lo que realmente use el archivo: en
// es-AR/es-ES esa config usa coma como separador DECIMAL, así que el
// separador de listas pasa a ser ";" — abrir con doble clic un CSV separado
// por comas hace que Excel no reconozca ninguna columna y apile todo en A.
// Usamos ";" a propósito para que abra bien de una en el Excel real que usa
// la farmacia, sin depender de que el usuario sepa importar con el asistente
// de "Datos > Desde texto/CSV" eligiendo el delimitador a mano.
const CSV_DELIMITER = ';';

const escapeCsvField = (value) => {
  console.log('🔍 [DEBUG-SERVICE-CSVEXPORT] escapeCsvField() — value:', value);
  const str = value === null || value === undefined ? '' : String(value);
  const necesitaComillas = new RegExp(`["${CSV_DELIMITER}\\n\\r]`).test(str);
  const resultado = necesitaComillas ? `"${str.replace(/"/g, '""')}"` : str;
  console.log('✅ [DEBUG-SERVICE-CSVEXPORT] escapeCsvField() — resultado:', resultado);
  return resultado;
};

// columns: [{ label: string, value: (row) => any }]
export const rowsToCsv = (columns, rows) => {
  console.log('🔍 [DEBUG-SERVICE-CSVEXPORT] rowsToCsv() — columns:', columns?.map(c => c.label), 'cantidad de filas recibidas:', rows?.length);
  try {
    const header = columns.map(c => escapeCsvField(c.label)).join(CSV_DELIMITER);
    const lines = rows.map(row => columns.map(c => escapeCsvField(c.value(row))).join(CSV_DELIMITER));
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
