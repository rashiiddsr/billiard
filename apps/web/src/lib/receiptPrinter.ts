'use client';

import Cookies from 'js-cookie';

type QzSecurity = {
  setCertificatePromise: (fn: (resolve: (value?: string) => void, reject: (reason?: unknown) => void) => void) => void;
  setSignaturePromise: (fn: (toSign: string) => (resolve: (value?: string) => void, reject: (reason?: unknown) => void) => void) => void;
  setSignatureAlgorithm?: (algorithm: string) => void;
};

type QzWebsocket = {
  isActive: () => boolean;
  connect: (opts?: { retries?: number; delay?: number; host?: string | string[]; secure?: boolean }) => Promise<void>;
};

type QzConfigs = {
  create: (printer?: string | null, options?: Record<string, unknown>) => unknown;
};

type QzApi = {
  websocket: QzWebsocket;
  security: QzSecurity;
  configs: QzConfigs;
  print: (config: unknown, data: unknown[]) => Promise<void>;
};

declare global {
  interface Window {
    qz?: QzApi;
  }
}

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

const getDesktopPrintBridgeUrl = () => {
  const url = process.env.NEXT_PUBLIC_PRINT_BRIDGE_URL?.trim();
  return url && /^https?:\/\//.test(url) ? url : '';
};

const getQzScriptUrl = () => process.env.NEXT_PUBLIC_QZ_SCRIPT_URL?.trim() || 'https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.js';
const getQzPrinterName = () => process.env.NEXT_PUBLIC_QZ_PRINTER?.trim() || '';
const isQzEnabled = () => process.env.NEXT_PUBLIC_QZ_TRAY_ENABLED === 'true';
const shouldPreferRawForQz = () => process.env.NEXT_PUBLIC_QZ_PREFER_RAW === 'true';

const getQzCertificate = () => process.env.NEXT_PUBLIC_QZ_CERTIFICATE?.trim() || '';
const getQzCertificateEndpoint = () => process.env.NEXT_PUBLIC_QZ_CERTIFICATE_ENDPOINT?.trim() || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1'}/print/qz/certificate`;
const getQzSignEndpoint = () => process.env.NEXT_PUBLIC_QZ_SIGN_ENDPOINT?.trim() || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1'}/print/qz/sign`;
const getQzSignApiKey = () => process.env.NEXT_PUBLIC_QZ_SIGN_API_KEY?.trim() || '';


function getAuthHeaders() {
  const token = Cookies.get('accessToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function signQzPayload(payload: string) {
  const endpoint = getQzSignEndpoint();
  if (!endpoint) return '';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(getQzSignApiKey() ? { 'X-Api-Key': getQzSignApiKey() } : {}),
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ payload }),
  });

  if (!response.ok) {
    throw new Error('Gagal menandatangani request QZ Tray');
  }

  const result = await response.json();
  return typeof result?.signature === 'string' ? result.signature : '';
}


let qzCertificatePromise: Promise<string> | null = null;

async function resolveQzCertificate() {
  const configured = getQzCertificate();
  if (configured) return configured;

  if (!qzCertificatePromise) {
    qzCertificatePromise = (async () => {
      const endpoint = getQzCertificateEndpoint();
      if (!endpoint) return '';

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          ...(getQzSignApiKey() ? { 'X-Api-Key': getQzSignApiKey() } : {}),
          ...getAuthHeaders(),
        },
      });

      if (!response.ok) return '';
      const result = await response.json();
      return typeof result?.certificate === 'string' ? result.certificate : '';
    })().catch(() => '');
  }

  return qzCertificatePromise;
}

let qzLoaderPromise: Promise<boolean> | null = null;

async function ensureQzLoaded() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (window.qz) return true;

  if (!qzLoaderPromise) {
    qzLoaderPromise = new Promise<boolean>((resolve) => {
      const script = document.createElement('script');
      script.src = getQzScriptUrl();
      script.async = true;
      script.onload = () => resolve(!!window.qz);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }

  return qzLoaderPromise;
}

async function printViaQzTray(payload: { title: string; text?: string; html?: string }) {
  if (!isQzEnabled()) return false;
  const loaded = await ensureQzLoaded();
  if (!loaded || !window.qz) return false;

  const qz = window.qz;
  const certificate = await resolveQzCertificate();

  if (certificate) {
    qz.security.setCertificatePromise((resolve) => resolve(certificate));
    qz.security.setSignatureAlgorithm?.('SHA512');
    qz.security.setSignaturePromise((toSign) => async (resolve, reject) => {
      try {
        const signature = await signQzPayload(toSign);
        if (!signature) throw new Error('Signature kosong');
        resolve(signature);
      } catch (error) {
        reject(error);
      }
    });
  } else {
    qz.security.setCertificatePromise((resolve) => resolve());
    qz.security.setSignaturePromise(() => (resolve) => resolve());
  }

  if (!qz.websocket.isActive()) {
    await qz.websocket.connect({ retries: 1, delay: 0, host: ['localhost', '127.0.0.1'], secure: window.location.protocol === 'https:' });
  }

  const printerName = getQzPrinterName();
  const config = qz.configs.create(printerName || null, {
    copies: 1,
  });

  if (payload.text) {
    const rawText = payload.text.endsWith('\n') ? payload.text : `${payload.text}\n`;
    await qz.print(config, [{ type: 'raw', format: 'plain', data: `${rawText}\n\n\x1D\x56\x41\x10` }]);
    return true;
  }

  if (payload.html) {
    await qz.print(config, [{ type: 'pixel', format: 'html', flavor: 'plain', data: payload.html }]);
    return true;
  }

  return false;
}

async function sendToDesktopPrintBridge(payload: { title: string; text?: string; html?: string }) {
  const bridgeUrl = getDesktopPrintBridgeUrl();
  if (!bridgeUrl) return false;

  try {
    const response = await fetch(bridgeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'receipt',
        source: 'billiard-web',
        ...payload,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function printReceiptHtml(receiptHtml: string, title = 'Struk') {
  const printedByQz = await printViaQzTray({ title, html: receiptHtml }).catch(() => false);
  if (printedByQz) return true;

  const printedByBridge = await sendToDesktopPrintBridge({ title, html: receiptHtml });
  if (printedByBridge) return true;

  return printWithHiddenFrame(receiptHtml);
}

export async function printReceiptText(receiptText: string, title = 'Struk') {
  const safeTitle = escapeHtml(title);
  const safeText = escapeHtml(receiptText);

  const printedByQz = await printViaQzTray({ title, text: receiptText }).catch(() => false);
  if (printedByQz) return true;

  const printedByBridge = await sendToDesktopPrintBridge({ title, text: receiptText });
  if (printedByBridge) return true;

  return printWithHiddenFrame(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${safeTitle}</title>
    <style>
      @page { size: auto; margin: 0; }
      body {
        margin: 0;
        padding: 12px 12px 24mm;
        font-family: 'Courier New', 'Liberation Mono', monospace;
      }
      pre {
        margin: 0;
        font-size: 12px;
        line-height: 1.35;
        white-space: pre;
      }
    </style>
  </head>
  <body>
    <pre>${safeText}</pre>
  </body>
</html>`);
}

function printWithHiddenFrame(content: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '1px';
  iframe.style.height = '1px';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.style.border = '0';

  const cleanup = () => {
    window.setTimeout(() => {
      iframe.remove();
    }, 1000);
  };

  iframe.onload = () => {
    const targetWindow = iframe.contentWindow;
    if (!targetWindow) {
      cleanup();
      return;
    }
    targetWindow.onafterprint = cleanup;
    targetWindow.focus();
    targetWindow.print();
    window.setTimeout(cleanup, 5000);
  };

  iframe.srcdoc = content;
  document.body.appendChild(iframe);
  return true;
}


export async function printReceiptSmart({
  title = 'Struk',
  text,
  html,
}: {
  title?: string;
  text: string;
  html: string;
}) {
  if (isQzEnabled() && shouldPreferRawForQz()) {
    return printReceiptText(text, title);
  }

  const printedByHtml = await printReceiptHtml(html, title);
  if (printedByHtml) return true;

  return printReceiptText(text, title);
}

export function centerReceiptText(text: string, width = 32) {
  const cleanText = text.replace(/\s+/g, ' ').trim();
  if (!cleanText) return '';
  if (cleanText.length >= width) return cleanText;
  const leftPad = Math.floor((width - cleanText.length) / 2);
  return `${' '.repeat(leftPad)}${cleanText}`;
}

export function formatReceiptLine(left: string, right = '', width = 32) {
  const cleanLeft = left.replace(/\s+/g, ' ').trim();
  const cleanRight = right.replace(/\s+/g, ' ').trim();
  if (!cleanRight) return cleanLeft;
  const spacing = width - cleanLeft.length - cleanRight.length;
  if (spacing >= 1) return `${cleanLeft}${' '.repeat(spacing)}${cleanRight}`;
  return `${cleanLeft}
${' '.repeat(Math.max(0, width - cleanRight.length))}${cleanRight}`;
}

export function separatorLine(width = 32, char = '-') {
  return char.repeat(width);
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
