'use client';

const getApiOrigin = () => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
  try {
    return new URL(apiUrl).origin;
  } catch {
    return 'http://localhost:3001';
  }
};

const resolveImageUrl = (path?: string | null) => {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getApiOrigin()}${normalizedPath}`;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export function printReceiptHtml(receiptHtml: string) {
  const win = window.open('', '_blank', 'width=320,height=760');
  if (!win) return false;
  win.document.open();
  win.document.write(receiptHtml);
  win.document.close();
  win.focus();
  win.onload = () => {
    win.print();
    win.close();
  };
  return true;
}

export function buildBusinessReceiptHtml({
  title,
  headerTag,
  company,
  bodyRows,
  paperWidth = '58mm',
}: {
  title: string;
  headerTag?: string;
  company?: { name?: string | null; address?: string | null; phoneNumber?: string | null; logoUrl?: string | null } | null;
  bodyRows: string;
  paperWidth?: '58mm' | '80mm';
}) {
  const logo = resolveImageUrl(company?.logoUrl);
  const companyName = escapeHtml(company?.name?.trim() || 'Billiard Club OS');
  const address = company?.address ? escapeHtml(company.address) : '';
  const phone = company?.phoneNumber ? escapeHtml(company.phoneNumber) : '';

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page { size: ${paperWidth} auto; margin: 0; }
      body {
        font-family: 'Courier New', 'Liberation Mono', monospace;
        margin: 0;
        padding: 0;
        color: #111827;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .receipt {
        box-sizing: border-box;
        width: ${paperWidth};
        margin: 0 auto;
        padding: 2mm;
      }
      .center { text-align: center; }
      .muted { color: #64748b; }
      .logo { max-width: 54px; max-height: 54px; margin: 0 auto 6px; display: block; object-fit: contain; }
      .line { border-top: 1px dashed #cbd5e1; margin: 6px 0; }
      .row { display: flex; justify-content: space-between; gap: 8px; margin: 2px 0; align-items: flex-start; }
      .row > span:first-child { flex: 1; min-width: 0; word-break: break-word; }
      .row > span:last-child { flex-shrink: 0; text-align: right; white-space: nowrap; }
      .bold { font-weight: 700; }
      .tag { border: 1px solid #111827; display: inline-block; padding: 2px 8px; font-weight: 700; margin-bottom: 6px; }
      .small { font-size: 13px; line-height: 1.3; }
      .pre { white-space: pre-wrap; }
      @media print {
        html, body { width: ${paperWidth}; }
      }
    </style>
  </head>
  <body>
    <div class="receipt small">
      <div class="center">
        ${logo ? `<img class="logo" src="${escapeHtml(logo)}" alt="logo" />` : ''}
        ${headerTag ? `<div class="tag">${escapeHtml(headerTag)}</div>` : ''}
        <div class="bold">${companyName}</div>
        ${address ? `<div class="pre">${address}</div>` : ''}
        ${phone ? `<div>Telp: ${phone}</div>` : ''}
      </div>
      <div class="line"></div>
      ${bodyRows}
      <div class="line"></div>
      <div class="center muted">Terima kasih, semoga datang kembali.</div>
    </div>
  </body>
</html>`;
}
