'use client';

import { useEffect, useMemo, useState } from 'react';
import { paymentsApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

function toDate(date = new Date()) { return date.toISOString().split('T')[0]; }

export default function CashierTransactionsPage() {
  const [date, setDate] = useState(toDate());
  const [data, setData] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);

  useEffect(() => {
    paymentsApi.list({ status: 'PAID', startDate: `${date}T00:00:00.000Z`, endDate: `${date}T23:59:59.999Z`, limit: 200 })
      .then((r) => setData(r.data || []));
  }, [date]);

  const total = useMemo(() => data.reduce((s, x) => s + parseFloat(x.totalAmount || '0'), 0), [data]);

  const openDetail = async (id: string) => {
    const receipt = await paymentsApi.getReceipt(id);
    setDetail(receipt);
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Daftar Transaksi Kasir</h1><p className="text-lg font-bold text-emerald-600">Total: {formatCurrency(total)}</p></div>
      <input type="date" className="input w-52" value={date} onChange={(e) => setDate(e.target.value)} />
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
