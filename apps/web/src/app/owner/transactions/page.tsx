'use client';

import { useEffect, useMemo, useState } from 'react';
import { paymentsApi, usersApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';

function toDate(date = new Date()) { return date.toISOString().split('T')[0]; }

export default function OwnerTransactionsPage() {
  const [date, setDate] = useState(toDate());
  const [users, setUsers] = useState<any[]>([]);
  const [paidById, setPaidById] = useState('');
  const [data, setData] = useState<any[]>([]);
  const fetchData = () => paymentsApi.list({ status: 'PAID', paidById: paidById || undefined, startDate: `${date}T00:00:00.000Z`, endDate: `${date}T23:59:59.999Z`, limit: 300 }).then((r) => setData(r.data || []));

  useEffect(() => { fetchData(); }, [date, paidById]);
  useEffect(() => { usersApi.list().then((u) => setUsers((u || []).filter((x: any) => x.role === 'CASHIER'))); }, []);

  const total = useMemo(() => data.reduce((s, x) => s + parseFloat(x.totalAmount || '0'), 0), [data]);
  const voidPayment = async (id: string) => { await paymentsApi.voidPayment(id); toast.success('Transaksi di-void'); fetchData(); };
  const deletePayment = async (id: string) => { await paymentsApi.deletePayment(id); toast.success('Transaksi dihapus'); fetchData(); };

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Daftar Transaksi Owner</h1><p className="text-lg font-bold text-emerald-600">Total: {formatCurrency(total)}</p></div>
      <div className="flex gap-2"><input type="date" className="input w-52" value={date} onChange={(e) => setDate(e.target.value)} /><select className="input w-56" value={paidById} onChange={(e) => setPaidById(e.target.value)}><option value="">Semua kasir</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
      <div className="card p-0"><div className="table-wrapper"><table className="data-table"><thead><tr><th>ID</th><th>Kasir</th><th>Metode</th><th>Total</th><th>Aksi</th></tr></thead><tbody>{data.map((x) => <tr key={x.id}><td className="font-mono text-xs">{x.paymentNumber}</td><td>{x.paidBy?.name || '-'}</td><td>{x.method}</td><td className="font-semibold">{formatCurrency(x.totalAmount)}</td><td className="space-x-2"><a href={`/cashier/checkout?paymentId=${x.id}`} className="rounded bg-slate-100 px-2 py-1 text-xs">Detail</a><button onClick={() => voidPayment(x.id)} className="rounded bg-red-100 px-2 py-1 text-xs text-red-600">Void</button><button onClick={() => deletePayment(x.id)} className="rounded bg-red-600 px-2 py-1 text-xs text-white">Delete</button></td></tr>)}</tbody></table></div></div>
    </div>
  );
}
