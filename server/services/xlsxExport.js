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
  const largos = rows.map(r => String(columna.value(r) ?? '').length);
  const maximo = Math.max(columna.label.length, ...largos, 0);
  return Math.min(Math.max(maximo + 2, MIN_COL_WIDTH), MAX_COL_WIDTH);
};

// columns: [{ label, value: (row) => any, align?: 'left'|'center'|'right', numFmt?: string, width?: number }]
export const rowsToXlsxBuffer = async (columns, rows, { sheetName = 'Datos' } = {}) => {
  console.log('🔍 [DEBUG-SERVICE-XLSXEXPORT] rowsToXlsxBuffer() — columns:', columns?.map(c => c.label), 'cantidad de filas recibidas:', rows?.length);
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(sheetName);

    sheet.columns = columns.map(c => ({
      header: c.label,
      key: c.label,
      width: c.width || estimarAncho(c, rows)
    }));

    rows.forEach((row, i) => {
      const valores = {};
      columns.forEach(c => {
        const raw = c.value(row);
        valores[c.label] = (raw === null || raw === undefined || raw === '') ? '-' : raw;
      });
      const excelRow = sheet.addRow(valores);
      excelRow.eachCell((cell, colNumber) => {
        const columna = columns[colNumber - 1];
        cell.alignment = { horizontal: columna.align || 'left', vertical: 'middle' };
        if (columna.numFmt && cell.value !== '-') cell.numFmt = columna.numFmt;
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

    const buffer = await workbook.xlsx.writeBuffer();
    console.log('✅ [DEBUG-SERVICE-XLSXEXPORT] rowsToXlsxBuffer() — buffer generado, bytes:', buffer.byteLength);
    return buffer;
  } catch (err) {
    console.error('❌ [DEBUG-SERVICE-XLSXEXPORT] rowsToXlsxBuffer() — error:', err?.message, err?.stack);
    throw err;
  }
};

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
