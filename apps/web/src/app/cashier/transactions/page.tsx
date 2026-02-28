'use client';

import { useEffect, useMemo, useState } from 'react';
import { companyApi, paymentsApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { centerReceiptText, formatReceiptLine, printReceiptText, separatorLine } from '@/lib/receiptPrinter';
import toast from 'react-hot-toast';

function toDateInputValue(date: Date) {
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().split('T')[0];
}

export default function CashierTransactionsPage() {
  const today = useMemo(() => toDateInputValue(new Date()), []);
  const [activeShortcut, setActiveShortcut] = useState<'today' | 'last7' | 'last30' | 'month' | null>('today');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [data, setData] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [detailPaymentId, setDetailPaymentId] = useState<string | null>(null);
  const [companyProfile, setCompanyProfile] = useState<any>(null);

  const fetchData = () => {
    paymentsApi
      .list({
        status: 'PAID',
        startDate: new Date(`${startDate}T00:00:00`).toISOString(),
        endDate: new Date(`${endDate}T23:59:59`).toISOString(),
        limit: 200,
      })
      .then((r) => setData(r.data || []));
  };

  useEffect(() => {
    fetchData();
  }, [startDate, endDate]);

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

  const openDetail = async (id: string) => {
    const receipt = await paymentsApi.getReceipt(id);
    setDetail(receipt);
    setDetailPaymentId(id);
  };

  const reprintReceipt = () => {
    if (!detail) return;
    const packageRows = (detail.packageUsages || []).map((pkg: any) => {
      const discount = Math.max(0, Number(pkg.originalPrice || 0) - Number(pkg.packagePrice || 0));
      const fnbRows = (pkg.fnbItems || []).map((x: any) => `<div class="row"><span>${x.name} × ${x.qty}</span><span>${formatCurrency(x.subtotal)}</span></div>`).join('');
      return `<div><div class="bold">${pkg.packageName}${pkg.qty > 1 ? ` × ${pkg.qty}` : ''}</div>${pkg.durationMinutes ? `<div class="row"><span>Billing ${pkg.durationMinutes} menit</span><span>${formatCurrency(pkg.billingEquivalent)}</span></div>` : ''}${fnbRows}<div class="row"><span>Diskon</span><span>-${formatCurrency(discount)}</span></div><div class="row bold"><span>Subtotal</span><span>${formatCurrency(pkg.packagePrice)}</span></div></div>`;
    }).join('<div class="line"></div>');
    const fnbExtraRows = (detail.fnbItems || []).length > 0
      ? (detail.fnbItems || []).map((f: any) => `<div class="row"><span>${f.name} × ${f.qty}</span><span>${formatCurrency(f.subtotal)}</span></div>`).join('')
      : '<div class="muted">Tidak ada F&B tambahan</div>';

    const rawLines: string[] = [
      centerReceiptText('RE-PRINT'),
      centerReceiptText(companyProfile?.name || 'Billiard Club OS'),
      centerReceiptText(companyProfile?.address || ''),
      centerReceiptText(companyProfile?.phoneNumber ? `Telp: ${companyProfile.phoneNumber}` : ''),
      separatorLine(),
      formatReceiptLine('No', detail.paymentNumber),
      formatReceiptLine('Kasir', detail.cashier),
      formatReceiptLine('Waktu', new Date(detail.paidAt).toLocaleString('id-ID')),
      detail.table !== 'Standalone' ? formatReceiptLine('Meja', detail.table) : '',
      (detail.billingSession?.amount || 0) > 0 ? formatReceiptLine('Billiard', formatCurrency(detail.billingSession?.amount || 0)) : '',
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
        : ['Tidak ada F&B tambahan'],
      separatorLine(),
      formatReceiptLine('TOTAL', formatCurrency(detail.total || 0)),
      formatReceiptLine('Diterima', formatCurrency(detail.amountPaid || 0)),
      formatReceiptLine('Kembalian', formatCurrency(detail.change || 0)),
      separatorLine(),
      centerReceiptText('Terima kasih.'),
    ].filter(Boolean);

    const printed = printReceiptText(`${rawLines.join('\n')}\n\n\n`, `Reprint ${detail.paymentNumber}`);
    if (!printed) {
      toast.error('Popup print diblokir browser');
      return;
    }
    if (detailPaymentId) paymentsApi.markPrinted(detailPaymentId).catch(() => null);
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Daftar Transaksi</h1><p className="text-lg font-bold text-emerald-600">Total: {formatCurrency(total)}</p></div>

      <div className="card p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-[auto_1fr_auto_1fr] md:items-center">
          <label className="text-sm text-slate-600">Rentang Tanggal</label>
          <input type="date" className="input w-full" value={startDate} onChange={(e) => { setActiveShortcut(null); setStartDate(e.target.value); }} />
          <span className="text-center text-slate-500">s/d</span>
          <input type="date" className="input w-full" value={endDate} onChange={(e) => { setActiveShortcut(null); setEndDate(e.target.value); }} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => applyShortcut('today')} className={getShortcutClassName('today')}>Hari ini</button>
          <button onClick={() => applyShortcut('last7')} className={getShortcutClassName('last7')}>7 hari terakhir</button>
          <button onClick={() => applyShortcut('last30')} className={getShortcutClassName('last30')}>30 hari terakhir</button>
          <button onClick={() => applyShortcut('month')} className={getShortcutClassName('month')}>Bulan ini</button>
        </div>
      </div>

      <div className="card p-0"><div className="table-wrapper"><table className="data-table"><thead><tr><th>ID</th><th>Waktu</th><th>Metode</th><th>Total</th><th>Aksi</th></tr></thead><tbody>{data.map((x) => <tr key={x.id}><td className="font-mono text-xs">{x.paymentNumber}</td><td>{new Date(x.createdAt).toLocaleString('id-ID')}</td><td>{x.method}</td><td className="font-semibold">{formatCurrency(x.totalAmount)}</td><td><button onClick={() => openDetail(x.id)} className="rounded bg-slate-100 px-2 py-1 text-xs">Detail</button></td></tr>)}</tbody></table></div></div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-4">
            <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Detail Transaksi {detail.paymentNumber}</h3><button onClick={() => { setDetail(null); setDetailPaymentId(null); }}>✕</button></div>
            <div className="space-y-1 text-sm">
              {(detail.billingSession?.amount || 0) > 0 && (
                <>
                  <div className="flex justify-between"><span>Billiard awal</span><span>{formatCurrency(detail.billingSession?.breakdown?.baseAmount || 0)}</span></div>
                  {(detail.billingSession?.breakdown?.extensions || []).map((x: any, i: number) => <div key={x.id || i} className="flex justify-between text-slate-600"><span>Perpanjangan #{i + 1} (+{x.additionalMinutes} menit)</span><span>{formatCurrency(x.additionalAmount)}</span></div>)}
                  <div className="flex justify-between"><span>Total Billiard</span><span>{formatCurrency(detail.billingSession?.amount || 0)}</span></div>
                </>
              )}
              {(detail.packageUsages || []).length > 0 && (
                <div className="mt-2 border-t pt-2">
                  <p className="font-semibold">Rincian Paket</p>
                  {(detail.packageUsages || []).map((pkg: any, i: number) => (
                    <div key={pkg.id || i} className="mt-1 rounded bg-slate-50 p-2">
                      <div className="font-medium">{pkg.packageName}{pkg.qty > 1 ? ` × ${pkg.qty}` : ''}</div>
                      {pkg.durationMinutes ? <div className="flex justify-between text-slate-600"><span>Billing {pkg.durationMinutes} menit</span><span>{formatCurrency(pkg.billingEquivalent)}</span></div> : null}
                      {(pkg.fnbItems || []).map((f: any, idx: number) => <div key={idx} className="flex justify-between text-slate-600"><span>{f.name} × {f.qty}</span><span>{formatCurrency(f.subtotal)}</span></div>)}
                      <div className="flex justify-between text-slate-700"><span>Diskon</span><span>-{formatCurrency(Math.max(0, Number(pkg.originalPrice || 0) - Number(pkg.packagePrice || 0)))}</span></div>
                      <div className="flex justify-between font-semibold"><span>Subtotal</span><span>{formatCurrency(pkg.packagePrice)}</span></div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-2 border-t pt-2"><p className="font-semibold">F&B Tambahan</p>{(detail.fnbItems || []).length === 0 ? <p className="text-slate-500">Tidak ada F&B tambahan</p> : detail.fnbItems.map((f: any, i: number) => <div key={i} className="flex justify-between"><span>{f.name} × {f.qty}</span><span>{formatCurrency(f.subtotal)}</span></div>)}</div>
              <div className="mt-2 flex justify-between border-t pt-2 font-semibold"><span>Total Transaksi</span><span>{formatCurrency(detail.total)}</span></div>
            </div>
            <button className="btn-primary mt-4 w-full" onClick={reprintReceipt}>Cetak Ulang Struk</button>
          </div>
        </div>
      )}
    </div>
  );
}
