'use client';

import { useEffect, useMemo, useState } from 'react';
import { paymentsApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

function toDateInputValue(date: Date) {
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().split('T')[0];
}

export default function CashierTransactionsPage() {
  const today = useMemo(() => toDateInputValue(new Date()), []);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [data, setData] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);

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

  const applyShortcut = (type: 'today' | 'last7' | 'last30' | 'month') => {
    const now = new Date();
    const end = toDateInputValue(now);
    if (type === 'today') {
      setStartDate(end);
      setEndDate(end);
      return;
    }
    if (type === 'last7') {
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      setStartDate(toDateInputValue(start));
      setEndDate(end);
      return;
    }
    if (type === 'last30') {
      const start = new Date(now);
      start.setDate(now.getDate() - 29);
      setStartDate(toDateInputValue(start));
      setEndDate(end);
      return;
    }
    setStartDate(toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)));
    setEndDate(end);
  };

  const total = useMemo(() => data.reduce((s, x) => s + parseFloat(x.totalAmount || '0'), 0), [data]);

  const openDetail = async (id: string) => {
    const receipt = await paymentsApi.getReceipt(id);
    setDetail(receipt);
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Daftar Transaksi Kasir</h1><p className="text-lg font-bold text-emerald-600">Total: {formatCurrency(total)}</p></div>

      <div className="card p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-[auto_1fr_auto_1fr] md:items-center">
          <label className="text-sm text-slate-600">Rentang Tanggal</label>
          <input type="date" className="input w-full" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <span className="text-center text-slate-500">s/d</span>
          <input type="date" className="input w-full" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => applyShortcut('today')} className="rounded bg-slate-100 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-200">Hari ini</button>
          <button onClick={() => applyShortcut('last7')} className="rounded bg-slate-100 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-200">7 hari terakhir</button>
          <button onClick={() => applyShortcut('last30')} className="rounded bg-slate-100 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-200">30 hari terakhir</button>
          <button onClick={() => applyShortcut('month')} className="rounded bg-blue-100 px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-200">Bulan ini</button>
        </div>
      </div>

      <div className="card p-0"><div className="table-wrapper"><table className="data-table"><thead><tr><th>ID</th><th>Waktu</th><th>Metode</th><th>Total</th><th>Aksi</th></tr></thead><tbody>{data.map((x) => <tr key={x.id}><td className="font-mono text-xs">{x.paymentNumber}</td><td>{new Date(x.createdAt).toLocaleString('id-ID')}</td><td>{x.method}</td><td className="font-semibold">{formatCurrency(x.totalAmount)}</td><td><button onClick={() => openDetail(x.id)} className="rounded bg-slate-100 px-2 py-1 text-xs">Detail</button></td></tr>)}</tbody></table></div></div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-4">
            <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Detail Transaksi {detail.paymentNumber}</h3><button onClick={() => setDetail(null)}>✕</button></div>
            <div className="space-y-1 text-sm">
              {(detail.billingSession?.amount || 0) > 0 && (
                <>
                  <div className="flex justify-between"><span>Billiard awal</span><span>{formatCurrency(detail.billingSession?.breakdown?.baseAmount || 0)}</span></div>
                  {(detail.billingSession?.breakdown?.extensions || []).map((x: any, i: number) => <div key={x.id || i} className="flex justify-between text-slate-600"><span>Perpanjangan #{i + 1} (+{x.additionalMinutes} menit)</span><span>{formatCurrency(x.additionalAmount)}</span></div>)}
                  <div className="flex justify-between"><span>Total Billiard</span><span>{formatCurrency(detail.billingSession?.amount || 0)}</span></div>
                </>
              )}
              <div className="mt-2 border-t pt-2"><p className="font-semibold">F&B</p>{(detail.fnbItems || []).length === 0 ? <p className="text-slate-500">Tidak ada F&B</p> : detail.fnbItems.map((f: any, i: number) => <div key={i} className="flex justify-between"><span>{f.name} × {f.qty}</span><span>{formatCurrency(f.subtotal)}</span></div>)}</div>
              <div className="mt-2 flex justify-between border-t pt-2 font-semibold"><span>Total Transaksi</span><span>{formatCurrency(detail.total)}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
