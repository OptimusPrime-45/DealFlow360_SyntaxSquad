/**
 * Utility to export an array of row objects to CSV and trigger download in browser.
 * @param {Array<Object>} rows - Array of items
 * @param {Array<{key: string, label: string, formatter?: (val, row) => string}>} columns - Column definition
 * @param {string} filename - Desired filename without extension or with .csv
 */
export function exportToCSV(rows, columns, filename = 'export.csv') {
  if (!rows || rows.length === 0) {
    alert('No records selected for export');
    return;
  }

  const cleanFilename = filename.endsWith('.csv') ? filename : `${filename}.csv`;

  // Build headers
  const headers = columns.map(col => `"${(col.label || col.key).replace(/"/g, '""')}"`);

  // Build rows
  const csvRows = rows.map(row => {
    return columns.map(col => {
      let val = row[col.key];
      if (col.formatter) {
        val = col.formatter(val, row);
      } else if (val === null || val === undefined) {
        val = '';
      } else if (typeof val === 'object') {
        val = JSON.stringify(val);
      }
      return `"${String(val).replace(/"/g, '""')}"`;
    }).join(',');
  });

  const csvContent = [headers.join(','), ...csvRows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', cleanFilename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
