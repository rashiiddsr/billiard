function escapeXml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toCell(value: unknown) {
  const isNumeric = typeof value === 'number' || (typeof value === 'string' && value !== '' && !Number.isNaN(Number(value)));
  const type = isNumeric ? 'Number' : 'String';
  return `<Cell><Data ss:Type="${type}">${escapeXml(value ?? '')}</Data></Cell>`;
}

export function downloadWorkbookXls(
  filename: string,
  sheets: Array<{ name: string; rows: unknown[][] }>,
) {
  const worksheetXml = sheets
    .map((sheet) => {
      const rowsXml = sheet.rows.map((row) => `<Row>${row.map(toCell).join('')}</Row>`).join('');
      return `<Worksheet ss:Name="${escapeXml(sheet.name.slice(0, 31) || 'Sheet')}"><Table>${rowsXml}</Table></Worksheet>`;
    })
    .join('');

  const xml = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
${worksheetXml}
</Workbook>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.xls') ? filename : `${filename}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}
