import ExcelJS from 'exceljs';

// Verde corporativo oscuro + texto blanco en negrita para la cabecera (ver
// captura de referencia del usuario), franjas grises muy claras alternadas
// en el resto para que se pueda seguir una fila larga sin perderse, y la
// cabecera congelada al scrollear (estándar de cualquier planilla prolija).
const HEADER_FILL = 'FF1B5E20';
const HEADER_FONT_COLOR = 'FFFFFFFF';
const STRIPE_FILL = 'FFF3F4F6';
const MAX_COL_WIDTH = 42;
const MIN_COL_WIDTH = 10;

const estimarAncho = (columna, rows) => {
  // Con muchas filas alcanza una muestra para estimar el ancho.
  const muestra = rows.length > 3000 ? rows.slice(0, 3000) : rows;
  let maximo = columna.label.length;
  for (const r of muestra) {
    const largo = String(columna.value(r) ?? '').length;
    if (largo > maximo) maximo = largo;
  }
  return Math.min(Math.max(maximo + 2, MIN_COL_WIDTH), MAX_COL_WIDTH);
};

// Agrega una hoja con cabecera verde, franjas y cabecera fija.
// columns: [{ label, value: (row) => any, align?: 'left'|'center'|'right', numFmt?: string, width?: number, link?: boolean }]
// link: si el valor es una URL, la celda queda como hipervínculo clickeable.
const agregarHoja = (workbook, { name, columns, rows }) => {
  // Excel no admite más de 31 caracteres ni algunos símbolos en el nombre de hoja.
  const sheet = workbook.addWorksheet(String(name).replace(/[\/?*[\]:]/g, ' ').slice(0, 31));

  sheet.columns = columns.map(c => ({
    header: c.label,
    key: c.label,
    width: c.width || estimarAncho(c, rows)
  }));

  rows.forEach((row, i) => {
    const valores = {};
    columns.forEach(c => {
      const raw = c.value(row);
      const vacio = raw === null || raw === undefined || raw === '';
      if (vacio) valores[c.label] = '-';
      else if (c.link && /^https?:\/\//.test(String(raw))) valores[c.label] = { text: String(raw), hyperlink: String(raw) };
      else valores[c.label] = raw;
    });
    const excelRow = sheet.addRow(valores);
    excelRow.eachCell((cell, colNumber) => {
      const columna = columns[colNumber - 1];
      cell.alignment = { horizontal: columna.align || 'left', vertical: 'middle', wrapText: !!columna.wrap };
      if (columna.numFmt && cell.value !== '-') cell.numFmt = columna.numFmt;
      if (columna.link && cell.value?.hyperlink) cell.font = { color: { argb: 'FF0563C1' }, underline: true };
      // Fila 1 es la cabecera (fija, ver más abajo): la franja empieza en
      // la primera fila de datos, i=0.
      if (i % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STRIPE_FILL } };
      }
    });
  });

  const headerRow = sheet.getRow(1);
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.font = { bold: true, color: { argb: HEADER_FONT_COLOR } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  if (rows.length) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
};

// Un archivo con varias hojas: sheets = [{ name, columns, rows }].
export const sheetsToXlsxBuffer = async (sheets) => {
  console.log('🔍 [DEBUG-SERVICE-XLSXEXPORT] sheetsToXlsxBuffer() — hojas:', sheets.map(s => `${s.name} (${s.rows.length})`));
  try {
    const workbook = new ExcelJS.Workbook();
    sheets.forEach(s => agregarHoja(workbook, s));
    const buffer = await workbook.xlsx.writeBuffer();
    console.log('✅ [DEBUG-SERVICE-XLSXEXPORT] sheetsToXlsxBuffer() — buffer generado, bytes:', buffer.byteLength);
    return buffer;
  } catch (err) {
    console.error('❌ [DEBUG-SERVICE-XLSXEXPORT] sheetsToXlsxBuffer() — error:', err?.message, err?.stack);
    throw err;
  }
};

// Una sola hoja (compatibilidad con los usos anteriores).
export const rowsToXlsxBuffer = (columns, rows, { sheetName = 'Datos' } = {}) =>
  sheetsToXlsxBuffer([{ name: sheetName, columns, rows }]);

export const sendXlsx = (res, filename, buffer) => {
  console.log('🔍 [DEBUG-SERVICE-XLSXEXPORT] sendXlsx() — filename:', filename, 'bytes:', buffer?.byteLength);
  try {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    console.log('✅ [DEBUG-SERVICE-XLSXEXPORT] sendXlsx() — enviando respuesta 200 con XLSX, filename:', filename);
    res.status(200).send(Buffer.from(buffer));
  } catch (err) {
    console.error('❌ [DEBUG-SERVICE-XLSXEXPORT] sendXlsx() — error:', err?.message, err?.stack);
    throw err;
  }
};
