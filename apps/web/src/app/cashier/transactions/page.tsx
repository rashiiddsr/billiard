'use client';

import { useEffect, useMemo, useState } from 'react';
import { companyApi, paymentsApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { centerReceiptText, formatReceiptLine, printReceiptText, separatorLine, wrapAndCenterReceiptText } from '@/lib/receiptPrinter';
import toast from 'react-hot-toast';
import { downloadWorkbookXls } from '@/lib/exportWorkbook';
import TransactionDetailSummary from '@/components/shared/TransactionDetailSummary';

function toDateInputValue(date: Date) {
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().split('T')[0];
}

function toDateTimeIso(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}

export default function CashierTransactionsPage() {
  const today = useMemo(() => toDateInputValue(new Date()), []);
  const [activeShortcut, setActiveShortcut] = useState<'today' | 'last7' | 'last30' | 'month' | null>('today');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [startTime, setStartTime] = useState('00:00');
  const [endTime, setEndTime] = useState('23:59');
  const [data, setData] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [detailPaymentId, setDetailPaymentId] = useState<string | null>(null);
  const [companyProfile, setCompanyProfile] = useState<any>(null);

  const fetchData = () => {
    paymentsApi
      .list({
        status: 'PAID',
        startDate: toDateTimeIso(startDate, startTime),
        endDate: toDateTimeIso(endDate, endTime),
        limit: 200,
      })
      .then((r) => setData(r.data || []));
  };

  useEffect(() => {
    fetchData();
  }, [startDate, endDate, startTime, endTime]);

  useEffect(() => {
    companyApi.getProfile().then(setCompanyProfile).catch(() => setCompanyProfile(null));
  }, []);

  const applyShortcut = (type: 'today' | 'last7' | 'last30' | 'month') => {
    const now = new Date();
    const end = toDateInputValue(now);
    if (type === 'today') {
      setActiveShortcut(type);
      setStartDate(end);
      setEndDate(end);
      return;
    }
    if (type === 'last7') {
      setActiveShortcut(type);
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      setStartDate(toDateInputValue(start));
      setEndDate(end);
      return;
    }
    if (type === 'last30') {
      setActiveShortcut(type);
      const start = new Date(now);
      start.setDate(now.getDate() - 29);
      setStartDate(toDateInputValue(start));
      setEndDate(end);
      return;
    }
    setActiveShortcut(type);
    setStartDate(toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)));
    setEndDate(end);
  };

  const getShortcutClassName = (type: 'today' | 'last7' | 'last30' | 'month') =>
    `rounded px-3 py-1.5 text-xs ${
      activeShortcut === type
        ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
    }`;

  const total = useMemo(() => data.reduce((s, x) => s + parseFloat(x.totalAmount || '0'), 0), [data]);

  const downloadTransactionsCsv = async () => {
    const receipts = await Promise.all(
      data.map(async (payment) => {
        try {
          return await paymentsApi.getReceipt(payment.id);
        } catch {
          return null;
        }
      }),
    );

    const transactionRows = data.map((payment) => [
      payment.paymentNumber,
      new Date(payment.paidAt || payment.createdAt).toLocaleString('id-ID'),
      payment.method,
      payment.billingSession?.table?.name || 'Standalone',
      Number(payment.totalAmount || 0),
    ]);

    const detailRows = receipts.flatMap((receipt, idx) => {
      const payment = data[idx];
      if (!payment) return [];

      const rows: unknown[][] = [];
      (receipt?.packageUsages || []).forEach((pkg: any) => {
        (pkg.fnbItems || []).forEach((item: any) => {
          rows.push([
            payment.paymentNumber,
            `Paket: ${pkg.packageName}`,
            item.name,
            item.qty,
            item.subtotal,
          ]);
        });
      });

      (receipt?.fnbItems || []).forEach((item: any) => {
        rows.push([
          payment.paymentNumber,
          'F&B Tambahan',
          item.name,
          item.qty,
          item.subtotal,
        ]);
      });

      if (rows.length === 0) {
        rows.push([payment.paymentNumber, 'Tanpa Item F&B', '-', 0, 0]);
      }

      return rows;
    });

    downloadWorkbookXls(`transaksi-kasir-detail-${startDate}-${startTime}-${endDate}-${endTime}`, [
      {
        name: 'Transaksi',
        rows: [
          ['No. Transaksi', 'Waktu', 'Metode', 'Meja', 'Total Transaksi'],
          ...(transactionRows.length ? transactionRows : [['Tidak ada transaksi', '-', '-', '-', 0]]),
        ],
      },
      {
        name: 'Detail Item',
        rows: [
          ['No. Transaksi', 'Kategori Detail', 'Nama Item', 'Qty', 'Subtotal Item'],
          ...(detailRows.length ? detailRows : [['Tidak ada detail', '-', '-', 0, 0]]),
        ],
      },
    ]);

    toast.success('Laporan berhasil diunduh (multi-sheet)');
  };

  const openDetail = async (id: string) => {
    const receipt = await paymentsApi.getReceipt(id);
    setDetail(receipt);
    setDetailPaymentId(id);
  };

  const reprintReceipt = async () => {
    if (!detail) return;
    const paidAt = new Date(detail.paidAt).toLocaleString('id-ID');
    const paymentMethod = String(detail.method || '').toUpperCase();
    const footerText = companyProfile?.phoneNumber
      ? `Terima kasih atas kunjungan Anda. Hubungi CS via Telp/WA: ${companyProfile.phoneNumber}`
      : 'Terima kasih atas kunjungan Anda.';
    const rawLines: string[] = [
      separatorLine(32, '='),
      centerReceiptText('RE-PRINT'),
      separatorLine(32, '='),
      centerReceiptText(companyProfile?.name || 'Billiard Club OS'),
      ...wrapAndCenterReceiptText(companyProfile?.address || ''),
      separatorLine(),
      formatReceiptLine('No', detail.paymentNumber),
      formatReceiptLine('Kasir', detail.cashier),
      formatReceiptLine('Waktu', paidAt),
      detail.table !== 'Standalone' ? formatReceiptLine('Meja', detail.table) : '',
      (detail.billingSession?.amount || 0) > 0 ? formatReceiptLine(`Billiard (${detail.billingSession?.duration || 0}m)`, formatCurrency(detail.billingSession?.amount || 0)) : '',
      (detail.packageUsages || []).length > 0 ? separatorLine() : '',
      (detail.packageUsages || []).length > 0 ? 'Rincian Paket' : '',
      ...(detail.packageUsages || []).flatMap((pkg: any) => {
        const discount = Math.max(0, Number(pkg.originalPrice || 0) - Number(pkg.packagePrice || 0));
        const lines = [pkg.packageName + (pkg.qty > 1 ? ` x${pkg.qty}` : '')];
        if (pkg.durationMinutes) lines.push(formatReceiptLine(`Billing ${pkg.durationMinutes}m`, formatCurrency(pkg.billingEquivalent || 0)));
        for (const item of pkg.fnbItems || []) {
          lines.push(formatReceiptLine(`${item.name} x${item.qty}`, formatCurrency(item.subtotal || 0)));
        }
        lines.push(formatReceiptLine('Diskon', `-${formatCurrency(discount)}`));
        lines.push(formatReceiptLine('Subtotal', formatCurrency(pkg.packagePrice || 0)));
        lines.push(separatorLine());
        return lines;
      }),
      'F&B Tambahan',
      ...(detail.fnbItems || []).length > 0
        ? (detail.fnbItems || []).map((f: any) => formatReceiptLine(`${f.name} x${f.qty}`, formatCurrency(f.subtotal || 0)))
        : ['-'],
      separatorLine(),
      formatReceiptLine('TOTAL', formatCurrency(detail.total || 0)),
      formatReceiptLine(`Metode ${paymentMethod || '-'}`, formatCurrency(detail.amountPaid || 0)),
      paymentMethod === 'CASH' ? formatReceiptLine('Kembalian', formatCurrency(detail.change || 0)) : '',
      separatorLine(),
      ...wrapAndCenterReceiptText(footerText),
    ].filter(Boolean);

    const printed = await printReceiptText(`${rawLines.join('\n')}\n\n\n`, `Reprint ${detail.paymentNumber}`, {
      logoUrl: companyProfile?.logoUrl || null,
    });
    if (!printed) {
      toast.error('QZ Tray/Print Bridge tidak terhubung dan print browser gagal dibuka');
      return;
    }
    if (detailPaymentId) paymentsApi.markPrinted(detailPaymentId).catch(() => null);
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Daftar Transaksi</h1>
        <div className="flex items-center gap-3">
          <p className="text-lg font-bold text-emerald-600">Total: {formatCurrency(total)}</p>
          <button className="btn-secondary" onClick={downloadTransactionsCsv}>Unduh Laporan Detail</button>
        </div>
      </div>

      <div className="card p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-[auto_1fr_1fr_auto_1fr_1fr] md:items-center">
          <label className="text-sm text-slate-600">Rentang Tanggal & Jam</label>
          <input type="date" className="input w-full" value={startDate} onChange={(e) => { setActiveShortcut(null); setStartDate(e.target.value); }} />
          <input type="time" className="input w-full" value={startTime} onChange={(e) => { setActiveShortcut(null); setStartTime(e.target.value || '00:00'); }} />
          <span className="text-center text-slate-500">s/d</span>
          <input type="date" className="input w-full" value={endDate} onChange={(e) => { setActiveShortcut(null); setEndDate(e.target.value); }} />
          <input type="time" className="input w-full" value={endTime} onChange={(e) => { setActiveShortcut(null); setEndTime(e.target.value || '23:59'); }} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => applyShortcut('today')} className={getShortcutClassName('today')}>Hari ini</button>
          <button onClick={() => applyShortcut('last7')} className={getShortcutClassName('last7')}>7 hari terakhir</button>
          <button onClick={() => applyShortcut('last30')} className={getShortcutClassName('last30')}>30 hari terakhir</button>
          <button onClick={() => applyShortcut('month')} className={getShortcutClassName('month')}>Bulan ini</button>
        </div>
      </div>

      <div className="card p-0"><div className="table-wrapper"><table className="data-table"><thead><tr><th>ID</th><th>Waktu</th><th>Metode</th><th>Total</th><th>Aksi</th></tr></thead><tbody>{data.map((x) => <tr key={x.id}><td className="font-mono text-xs">{x.paymentNumber}</td><td>{new Date(x.paidAt || x.createdAt).toLocaleString('id-ID')}</td><td>{x.method}</td><td className="font-semibold">{formatCurrency(x.totalAmount)}</td><td><button onClick={() => openDetail(x.id)} className="rounded bg-slate-100 px-2 py-1 text-xs">Detail</button></td></tr>)}</tbody></table></div></div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-4">
            <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Detail Transaksi {detail.paymentNumber}</h3><button onClick={() => { setDetail(null); setDetailPaymentId(null); }}>✕</button></div>
            <TransactionDetailSummary detail={detail} />
            <button className="btn-primary mt-4 w-full" onClick={reprintReceipt}>Cetak Ulang Struk</button>
          </div>
        </div>
      )}
    </div>
  );
}
