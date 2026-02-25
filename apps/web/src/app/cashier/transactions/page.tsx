'use client';

import { useEffect, useMemo, useState } from 'react';
import { paymentsApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

function toDate(date = new Date()) { return date.toISOString().split('T')[0]; }

export default function CashierTransactionsPage() {
  const [date, setDate] = useState(toDate());
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    paymentsApi.list({ status: 'PAID', startDate: `${date}T00:00:00.000Z`, endDate: `${date}T23:59:59.999Z`, limit: 200 })
      .then((r) => setData(r.data || []));
  }, [date]);

  const total = useMemo(() => data.reduce((s, x) => s + parseFloat(x.totalAmount || '0'), 0), [data]);

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Daftar Transaksi Kasir</h1><p className="text-lg font-bold text-emerald-600">Total: {formatCurrency(total)}</p></div>
      <input type="date" className="input w-52" value={date} onChange={(e) => setDate(e.target.value)} />
      <div className="card p-0"><div className="table-wrapper"><table className="data-table"><thead><tr><th>ID</th><th>Waktu</th><th>Metode</th><th>Total</th><th>Aksi</th></tr></thead><tbody>{data.map((x) => <tr key={x.id}><td className="font-mono text-xs">{x.paymentNumber}</td><td>{new Date(x.createdAt).toLocaleString('id-ID')}</td><td>{x.method}</td><td className="font-semibold">{formatCurrency(x.totalAmount)}</td><td><a href={`/cashier/checkout?paymentId=${x.id}`} className="rounded bg-slate-100 px-2 py-1 text-xs">Detail</a></td></tr>)}</tbody></table></div></div>
    </div>
  );
}
